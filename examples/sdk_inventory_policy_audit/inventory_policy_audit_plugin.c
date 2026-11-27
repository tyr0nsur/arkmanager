#include <obelisk/ObeliskApi.h>

#include <stdatomic.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#if !defined(__linux__) || !defined(__x86_64__)
#error "Obelisk SDK examples target Linux x86_64 shared objects; they are not Windows/MSVC portability samples."
#endif

#if defined(__GNUC__) || defined(__clang__)
#define OBELISK_PLUGIN_EXPORT __attribute__((visibility("default")))
#else
#define OBELISK_PLUGIN_EXPORT
#endif

static ObeliskApi g_api;
static bool g_has_api = false;
static uint64_t g_owner_token = 0;
static _Atomic uint64_t g_registration_id = 0;
static _Atomic uint64_t g_inventory_events = 0;
static _Atomic uint64_t g_return_true_events = 0;
static _Atomic uint64_t g_return_false_events = 0;
static _Atomic uint64_t g_requested_by_player_events = 0;
static _Atomic uint64_t g_ignore_cooldown_events = 0;
static uint64_t g_audit_user_data = 0x0B3115CA1u;

static const char kDefaultConfig[] =
    "{\n"
    "  \"enabled\": false,\n"
    "  \"allow_all_instances\": false,\n"
    "  \"instance_allowlist\": []\n"
    "}\n";

static bool has_api_metadata_prefix(const ObeliskApi* api)
{
    return api != NULL &&
        api->struct_size >= offsetof(ObeliskApi, capabilities) + sizeof(api->capabilities) &&
        api->abi_version == OBELISK_API_ABI_VERSION;
}

static bool has_policy_api(const ObeliskApi* api)
{
    return has_api_metadata_prefix(api) &&
        api->struct_size >= offsetof(ObeliskApi, RegisterGameplayPolicyEventWithOwnerTokenHandle) +
            sizeof(api->RegisterGameplayPolicyEventWithOwnerTokenHandle) &&
        api->struct_size >= offsetof(ObeliskApi, UnregisterGameplayPolicyEventWithOwnerToken) +
            sizeof(api->UnregisterGameplayPolicyEventWithOwnerToken) &&
        api->struct_size >= offsetof(ObeliskApi, DescribeResourceKind) +
            sizeof(api->DescribeResourceKind) &&
        api->struct_size >= offsetof(ObeliskApi, DescribeGameplayPolicyEventKind) +
            sizeof(api->DescribeGameplayPolicyEventKind) &&
        (api->capabilities & OBELISK_API_CAPABILITY_GAMEPLAY_POLICY_EVENTS) != 0 &&
        (api->capabilities & OBELISK_API_CAPABILITY_RESOURCE_KIND_DESCRIPTORS) != 0 &&
        (api->capabilities & OBELISK_API_CAPABILITY_GAMEPLAY_POLICY_EVENT_DESCRIPTORS) != 0 &&
        api->RegisterGameplayPolicyEventWithOwnerTokenHandle != NULL &&
        api->UnregisterGameplayPolicyEventWithOwnerToken != NULL &&
        api->DescribeResourceKind != NULL &&
        api->DescribeGameplayPolicyEventKind != NULL;
}

static bool has_init_context(const ObeliskPluginInitContext* context)
{
    return context != NULL &&
        context->abi_version == OBELISK_PLUGIN_INIT_CONTEXT_ABI_VERSION &&
        context->struct_size >= offsetof(ObeliskPluginInitContext, plugin_owner_token) +
            sizeof(context->plugin_owner_token) &&
        context->plugin_owner_token != 0;
}

static void reset_counters(void)
{
    atomic_store(&g_inventory_events, 0);
    atomic_store(&g_return_true_events, 0);
    atomic_store(&g_return_false_events, 0);
    atomic_store(&g_requested_by_player_events, 0);
    atomic_store(&g_ignore_cooldown_events, 0);
}

static void reset_state(void)
{
    memset(&g_api, 0, sizeof(g_api));
    g_has_api = false;
    g_owner_token = 0;
    atomic_store(&g_registration_id, 0);
    reset_counters();
}

static uint64_t event_kind_mask(uint32_t event_kind)
{
    if (event_kind < OBELISK_GAMEPLAY_POLICY_EVENT_KIND_MIN ||
        event_kind > OBELISK_GAMEPLAY_POLICY_EVENT_KIND_MAX)
    {
        return 0;
    }
    return 1ull << (event_kind - 1u);
}

static bool describe_inventory_event_kind(const ObeliskApi* api, uint32_t event_kind)
{
    ObeliskGameplayPolicyEventDescriptor descriptor;
    memset(&descriptor, 0, sizeof(descriptor));
    descriptor.struct_size = sizeof(descriptor);
    if (!api->DescribeGameplayPolicyEventKind(event_kind, &descriptor))
        return false;

    const uint64_t expected_mask = event_kind_mask(event_kind);
    return descriptor.abi_version == OBELISK_GAMEPLAY_POLICY_EVENT_DESCRIPTOR_ABI_VERSION &&
        descriptor.struct_size == sizeof(descriptor) &&
        descriptor.event_kind == event_kind &&
        descriptor.resource_kind == OBELISK_GAMEPLAY_POLICY_RESOURCE_KIND_INVENTORY_ITEM &&
        descriptor.event_kind_mask == expected_mask &&
        (descriptor.event_kind_mask & OBELISK_GAMEPLAY_POLICY_EVENT_MASK_ALL_INVENTORY) != 0 &&
        (descriptor.flags & OBELISK_GAMEPLAY_POLICY_EVENT_FLAG_COPIED_PAYLOAD) != 0 &&
        (descriptor.flags & OBELISK_GAMEPLAY_POLICY_EVENT_FLAG_INVENTORY_BACKED) != 0 &&
        descriptor.field_mask != 0;
}

static bool validate_inventory_resource_descriptor(const ObeliskApi* api)
{
    ObeliskResourceKindDescriptor descriptor;
    memset(&descriptor, 0, sizeof(descriptor));
    descriptor.struct_size = sizeof(descriptor);
    if (!api->DescribeResourceKind(OBELISK_GAMEPLAY_POLICY_RESOURCE_KIND_INVENTORY_ITEM, &descriptor))
        return false;

    const uint64_t required_flags = OBELISK_RESOURCE_KIND_DESCRIPTOR_FLAG_CATEGORY_ONLY |
        OBELISK_RESOURCE_KIND_DESCRIPTOR_FLAG_NO_IDENTITY |
        OBELISK_RESOURCE_KIND_DESCRIPTOR_FLAG_NO_LOOKUP;

    return descriptor.abi_version == OBELISK_RESOURCE_KIND_DESCRIPTOR_ABI_VERSION &&
        descriptor.struct_size == sizeof(descriptor) &&
        descriptor.resource_kind == OBELISK_GAMEPLAY_POLICY_RESOURCE_KIND_INVENTORY_ITEM &&
        (descriptor.flags & required_flags) == required_flags &&
        (descriptor.supported_gameplay_policy_event_mask &
            OBELISK_GAMEPLAY_POLICY_EVENT_MASK_ALL_INVENTORY) ==
            OBELISK_GAMEPLAY_POLICY_EVENT_MASK_ALL_INVENTORY &&
        descriptor.supported_gameplay_policy_field_mask != 0 &&
        strcmp(descriptor.stable_name, "inventory_item") == 0;
}

static bool validate_inventory_policy_descriptors(const ObeliskApi* api)
{
    if (!validate_inventory_resource_descriptor(api))
        return false;

    for (uint32_t event_kind = OBELISK_GAMEPLAY_POLICY_EVENT_KIND_INVENTORY_REMOTE_ADD_CHECK;
         event_kind <= OBELISK_GAMEPLAY_POLICY_EVENT_KIND_INVENTORY_USE_ITEM_ONTO_ITEM_CHECK;
         ++event_kind)
    {
        if (!describe_inventory_event_kind(api, event_kind))
            return false;
    }

    return true;
}

static bool is_inventory_policy_event(const ObeliskGameplayPolicyEvent* event)
{
    return event != NULL &&
        event->abi_version == OBELISK_GAMEPLAY_POLICY_EVENT_ABI_VERSION &&
        event->struct_size >= offsetof(ObeliskGameplayPolicyEvent, int32_values) +
            sizeof(event->int32_values) &&
        event->resource_kind == OBELISK_GAMEPLAY_POLICY_RESOURCE_KIND_INVENTORY_ITEM &&
        (event->flags & OBELISK_GAMEPLAY_POLICY_EVENT_FLAG_COPIED_PAYLOAD) != 0 &&
        (event->flags & OBELISK_GAMEPLAY_POLICY_EVENT_FLAG_INVENTORY_BACKED) != 0;
}

static void on_gameplay_policy_event(const ObeliskGameplayPolicyEvent* event, void* user_data)
{
    if (user_data != &g_audit_user_data || !is_inventory_policy_event(event))
        return;

    atomic_fetch_add(&g_inventory_events, 1);

    if ((event->field_mask & OBELISK_GAMEPLAY_POLICY_FIELD_MASK_RETURN_VALUE) != 0)
    {
        const bool return_value =
            (event->bool_values & (1ull << OBELISK_GAMEPLAY_POLICY_FIELD_RETURN_VALUE)) != 0;
        atomic_fetch_add(return_value ? &g_return_true_events : &g_return_false_events, 1);
    }

    if ((event->field_mask & OBELISK_GAMEPLAY_POLICY_FIELD_MASK_REQUESTED_BY_PLAYER) != 0 &&
        (event->bool_values & (1ull << OBELISK_GAMEPLAY_POLICY_FIELD_REQUESTED_BY_PLAYER)) != 0)
    {
        atomic_fetch_add(&g_requested_by_player_events, 1);
    }

    if ((event->field_mask & OBELISK_GAMEPLAY_POLICY_FIELD_MASK_IGNORE_COOLDOWN) != 0 &&
        (event->bool_values & (1ull << OBELISK_GAMEPLAY_POLICY_FIELD_IGNORE_COOLDOWN)) != 0)
    {
        atomic_fetch_add(&g_ignore_cooldown_events, 1);
    }
}

static void log_audit_summary(void)
{
    if (!g_has_api || g_api.LogInfo == NULL)
        return;

    char message[256];
    snprintf(message,
             sizeof(message),
             "[obelisk_sdk_inventory_policy_audit] copied policy observations: total=%llu "
             "return_true=%llu return_false=%llu requested_by_player=%llu ignore_cooldown=%llu",
             (unsigned long long)atomic_load(&g_inventory_events),
             (unsigned long long)atomic_load(&g_return_true_events),
             (unsigned long long)atomic_load(&g_return_false_events),
             (unsigned long long)atomic_load(&g_requested_by_player_events),
             (unsigned long long)atomic_load(&g_ignore_cooldown_events));
    g_api.LogInfo(message);
}

#ifdef OBELISK_SDK_INVENTORY_POLICY_AUDIT_TEST_PROBES
OBELISK_PLUGIN_EXPORT
bool InstallLayoutConsumer_InventoryPolicyAuditRegistered(void)
{
    return atomic_load(&g_registration_id) != 0;
}

OBELISK_PLUGIN_EXPORT
uint64_t InstallLayoutConsumer_InventoryPolicyAuditEventCount(void)
{
    return atomic_load(&g_inventory_events);
}
#endif

OBELISK_PLUGIN_EXPORT
bool ObeliskPlugin_GetInfo(ObeliskPluginMetadata* out)
{
    if (out == NULL)
        return false;

    out->abi_version = OBELISK_PLUGIN_METADATA_ABI_VERSION;
    out->struct_size = sizeof(ObeliskPluginMetadata);
    out->plugin_id = "obelisk_sdk_inventory_policy_audit";
    out->name = "Obelisk SDK Inventory Policy Audit";
    out->version = "0.1.0";
    out->config_file = "config.json";
    out->default_config_json = kDefaultConfig;
    return true;
}

OBELISK_PLUGIN_EXPORT
bool ObeliskPlugin_Init(ObeliskApi* api, const ObeliskPluginInitContext* context)
{
    reset_state();
    if (!has_policy_api(api) || !has_init_context(context))
        return false;
    if (!validate_inventory_policy_descriptors(api))
    {
        if (api->LogWarn != NULL)
            api->LogWarn("[obelisk_sdk_inventory_policy_audit] inventory policy descriptors unavailable");
        return false;
    }

    memcpy(&g_api, api, api->struct_size < sizeof(g_api) ? api->struct_size : sizeof(g_api));
    g_has_api = true;
    g_owner_token = context->plugin_owner_token;

    const uint64_t registration_id = g_api.RegisterGameplayPolicyEventWithOwnerTokenHandle(
        g_owner_token,
        OBELISK_GAMEPLAY_POLICY_EVENT_MASK_ALL_INVENTORY,
        on_gameplay_policy_event,
        &g_audit_user_data);
    if (registration_id == 0)
    {
        reset_state();
        return false;
    }

    atomic_store(&g_registration_id, registration_id);
    if (g_api.LogInfo != NULL)
        g_api.LogInfo("[obelisk_sdk_inventory_policy_audit] copied policy observer registered");
    return true;
}

OBELISK_PLUGIN_EXPORT
void ObeliskPlugin_Shutdown(void)
{
    const uint64_t registration_id = atomic_exchange(&g_registration_id, 0);
    if (g_has_api && registration_id != 0 && g_api.UnregisterGameplayPolicyEventWithOwnerToken != NULL)
        g_api.UnregisterGameplayPolicyEventWithOwnerToken(g_owner_token, registration_id);

    log_audit_summary();
    reset_state();
}
