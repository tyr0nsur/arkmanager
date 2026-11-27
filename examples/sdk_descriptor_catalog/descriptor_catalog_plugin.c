#include <obelisk/ObeliskApi.h>

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

static bool g_descriptor_catalog_validated = false;

static const char kDefaultConfig[] =
    "{\n"
    "  \"enabled\": false,\n"
    "  \"allow_all_instances\": false,\n"
    "  \"instance_allowlist\": []\n"
    "}\n";

static bool has_descriptor_api(const ObeliskApi* api)
{
    return api != NULL &&
        api->abi_version == OBELISK_API_ABI_VERSION &&
        api->struct_size >= offsetof(ObeliskApi, DescribeGameplayPolicyEventKind) +
            sizeof(api->DescribeGameplayPolicyEventKind) &&
        (api->capabilities & OBELISK_API_CAPABILITY_RESOURCE_KIND_DESCRIPTORS) != 0 &&
        (api->capabilities & OBELISK_API_CAPABILITY_GAMEPLAY_POLICY_EVENT_DESCRIPTORS) != 0 &&
        api->DescribeResourceKind != NULL &&
        api->DescribeGameplayPolicyEventKind != NULL;
}

static bool has_init_context_prefix(const ObeliskPluginInitContext* context)
{
    return context != NULL &&
        context->abi_version == OBELISK_PLUGIN_INIT_CONTEXT_ABI_VERSION &&
        context->struct_size >= offsetof(ObeliskPluginInitContext, instance_id) +
            sizeof(context->instance_id);
}

static bool is_single_bit(uint64_t value)
{
    return value != 0 && (value & (value - 1u)) == 0;
}

static bool stable_text_is_safe(const char* value, size_t capacity)
{
    bool saw_nul = false;
    for (size_t i = 0; i < capacity; ++i)
    {
        const unsigned char ch = (unsigned char)value[i];
        if (ch == '\0')
        {
            saw_nul = true;
            break;
        }
        if (!((ch >= 'a' && ch <= 'z') ||
              (ch >= 'A' && ch <= 'Z') ||
              (ch >= '0' && ch <= '9') ||
              ch == '_' ||
              ch == '-' ||
              ch == '.' ||
              ch == ' '))
        {
            return false;
        }
    }
    return saw_nul && value[0] != '\0';
}

static void log_info(const ObeliskApi* api, const char* message)
{
    if (api != NULL && api->LogInfo != NULL)
        api->LogInfo(message);
}

static void log_warn(const ObeliskApi* api, const char* message)
{
    if (api != NULL && api->LogWarn != NULL)
        api->LogWarn(message);
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

static bool describe_resource_kind(
    const ObeliskApi* api,
    uint32_t resource_kind,
    ObeliskResourceKindDescriptor* out)
{
    memset(out, 0, sizeof(*out));
    out->struct_size = sizeof(*out);
    if (!api->DescribeResourceKind(resource_kind, out))
        return false;

    const uint64_t required_flags =
        OBELISK_RESOURCE_KIND_DESCRIPTOR_FLAG_CATEGORY_ONLY |
        OBELISK_RESOURCE_KIND_DESCRIPTOR_FLAG_NO_IDENTITY |
        OBELISK_RESOURCE_KIND_DESCRIPTOR_FLAG_NO_LOOKUP;

    return out->abi_version == OBELISK_RESOURCE_KIND_DESCRIPTOR_ABI_VERSION &&
        out->struct_size == sizeof(*out) &&
        out->resource_kind == resource_kind &&
        (out->flags & required_flags) == required_flags &&
        (out->supported_gameplay_policy_event_mask & ~OBELISK_GAMEPLAY_POLICY_EVENT_MASK_ALL) == 0 &&
        stable_text_is_safe(out->stable_name, sizeof(out->stable_name)) &&
        stable_text_is_safe(out->display_name, sizeof(out->display_name));
}

static bool describe_event_kind(
    const ObeliskApi* api,
    uint32_t event_kind,
    ObeliskGameplayPolicyEventDescriptor* out)
{
    memset(out, 0, sizeof(*out));
    out->struct_size = sizeof(*out);
    if (!api->DescribeGameplayPolicyEventKind(event_kind, out))
        return false;

    const uint64_t expected_mask = event_kind_mask(event_kind);
    return out->abi_version == OBELISK_GAMEPLAY_POLICY_EVENT_DESCRIPTOR_ABI_VERSION &&
        out->struct_size == sizeof(*out) &&
        out->event_kind == event_kind &&
        out->resource_kind != OBELISK_GAMEPLAY_POLICY_RESOURCE_KIND_UNKNOWN &&
        out->event_kind_mask == expected_mask &&
        is_single_bit(out->event_kind_mask) &&
        (out->field_mask != 0) &&
        (out->flags & OBELISK_GAMEPLAY_POLICY_EVENT_FLAG_COPIED_PAYLOAD) != 0 &&
        stable_text_is_safe(out->stable_name, sizeof(out->stable_name)) &&
        stable_text_is_safe(out->display_name, sizeof(out->display_name));
}

static bool validate_descriptor_catalog(const ObeliskApi* api)
{
    ObeliskResourceKindDescriptor structure;
    ObeliskResourceKindDescriptor inventory_item;
    if (!describe_resource_kind(api, OBELISK_GAMEPLAY_POLICY_RESOURCE_KIND_STRUCTURE, &structure) ||
        !describe_resource_kind(api, OBELISK_GAMEPLAY_POLICY_RESOURCE_KIND_INVENTORY_ITEM, &inventory_item))
    {
        log_warn(api, "[obelisk_sdk_descriptor_catalog] resource descriptor query failed");
        return false;
    }

    uint64_t observed_event_mask = 0;
    for (uint32_t event_kind = OBELISK_GAMEPLAY_POLICY_EVENT_KIND_MIN;
         event_kind <= OBELISK_GAMEPLAY_POLICY_EVENT_KIND_MAX;
         ++event_kind)
    {
        ObeliskGameplayPolicyEventDescriptor event;
        if (!describe_event_kind(api, event_kind, &event))
        {
            log_warn(api, "[obelisk_sdk_descriptor_catalog] event descriptor query failed");
            return false;
        }

        const ObeliskResourceKindDescriptor* resource = NULL;
        if (event.resource_kind == structure.resource_kind)
            resource = &structure;
        else if (event.resource_kind == inventory_item.resource_kind)
            resource = &inventory_item;
        else
        {
            log_warn(api, "[obelisk_sdk_descriptor_catalog] event descriptor used an unknown resource kind");
            return false;
        }

        if ((event.event_kind_mask & resource->supported_gameplay_policy_event_mask) != event.event_kind_mask ||
            (event.field_mask & resource->supported_gameplay_policy_field_mask) != event.field_mask)
        {
            log_warn(api, "[obelisk_sdk_descriptor_catalog] event descriptor is outside resource masks");
            return false;
        }

        observed_event_mask |= event.event_kind_mask;
    }

    if (observed_event_mask != OBELISK_GAMEPLAY_POLICY_EVENT_MASK_ALL)
    {
        log_warn(api, "[obelisk_sdk_descriptor_catalog] descriptor catalog did not cover all promoted event kinds");
        return false;
    }

    char message[256];
    snprintf(message,
             sizeof(message),
             "[obelisk_sdk_descriptor_catalog] validated descriptor catalog: resources=%s,%s events=0x%llx",
             structure.stable_name,
             inventory_item.stable_name,
             (unsigned long long)observed_event_mask);
    log_info(api, message);
    return true;
}

#ifdef OBELISK_SDK_DESCRIPTOR_CATALOG_TEST_PROBES
OBELISK_PLUGIN_EXPORT
bool InstallLayoutConsumer_DescriptorCatalogValidated(void)
{
    return g_descriptor_catalog_validated;
}
#endif

OBELISK_PLUGIN_EXPORT
bool ObeliskPlugin_GetInfo(ObeliskPluginMetadata* out)
{
    if (out == NULL)
        return false;

    out->abi_version = OBELISK_PLUGIN_METADATA_ABI_VERSION;
    out->struct_size = sizeof(ObeliskPluginMetadata);
    out->plugin_id = "obelisk_sdk_descriptor_catalog";
    out->name = "Obelisk SDK Descriptor Catalog";
    out->version = "0.1.0";
    out->config_file = "config.json";
    out->default_config_json = kDefaultConfig;
    return true;
}

OBELISK_PLUGIN_EXPORT
bool ObeliskPlugin_Init(ObeliskApi* api, const ObeliskPluginInitContext* context)
{
    g_descriptor_catalog_validated = false;
    if (!has_init_context_prefix(context))
        return false;
    if (!has_descriptor_api(api))
    {
        log_warn(api, "[obelisk_sdk_descriptor_catalog] descriptor API unavailable");
        return false;
    }

    g_descriptor_catalog_validated = validate_descriptor_catalog(api);
    return g_descriptor_catalog_validated;
}

OBELISK_PLUGIN_EXPORT
void ObeliskPlugin_Shutdown(void)
{
    g_descriptor_catalog_validated = false;
}
