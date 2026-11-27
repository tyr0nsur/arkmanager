#include <obelisk/ObeliskApi.h>

#include <stdatomic.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
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
static _Atomic uint64_t g_timer_id = 0;
static uint64_t g_timer_user_data = 0x0B3115C001u;
static atomic_bool g_timer_seen = false;

static const char kDefaultConfig[] =
    "{\n"
    "  \"enabled\": false,\n"
    "  \"allow_all_instances\": false,\n"
    "  \"instance_allowlist\": []\n"
    "}\n";

static bool has_timer_api(const ObeliskApi* api)
{
    return api != NULL &&
        api->abi_version == OBELISK_API_ABI_VERSION &&
        api->struct_size >= offsetof(ObeliskApi, UnregisterTimerWithOwnerToken) +
            sizeof(api->UnregisterTimerWithOwnerToken) &&
        (api->capabilities & OBELISK_API_CAPABILITY_TIMERS) != 0 &&
        api->RegisterTimerWithOwnerTokenHandle != NULL &&
        api->UnregisterTimerWithOwnerToken != NULL;
}

static bool has_init_context(const ObeliskPluginInitContext* context)
{
    return context != NULL &&
        context->abi_version == OBELISK_PLUGIN_INIT_CONTEXT_ABI_VERSION &&
        context->struct_size >= offsetof(ObeliskPluginInitContext, plugin_owner_token) +
            sizeof(context->plugin_owner_token) &&
        context->plugin_owner_token != 0;
}

static void reset_state(void)
{
    memset(&g_api, 0, sizeof(g_api));
    g_has_api = false;
    g_owner_token = 0;
    atomic_store(&g_timer_id, 0);
    atomic_store(&g_timer_seen, false);
}

static void on_timer(uint64_t timer_id, void* user_data)
{
    if (timer_id == atomic_load(&g_timer_id) && user_data == &g_timer_user_data)
        atomic_store(&g_timer_seen, true);
}

#ifdef OBELISK_SDK_TIMER_PLUGIN_TEST_PROBES
OBELISK_PLUGIN_EXPORT
bool InstallLayoutConsumer_ScheduledCallbackSeen(void)
{
    return atomic_load(&g_timer_seen);
}
#endif

OBELISK_PLUGIN_EXPORT
bool ObeliskPlugin_GetInfo(ObeliskPluginMetadata* out)
{
    if (out == NULL)
        return false;

    out->abi_version = OBELISK_PLUGIN_METADATA_ABI_VERSION;
    out->struct_size = sizeof(ObeliskPluginMetadata);
    out->plugin_id = "obelisk_sdk_timer_plugin";
    out->name = "Obelisk SDK Timer Plugin";
    out->version = "0.1.0";
    out->config_file = "config.json";
    out->default_config_json = kDefaultConfig;
    return true;
}

OBELISK_PLUGIN_EXPORT
bool ObeliskPlugin_Init(ObeliskApi* api, const ObeliskPluginInitContext* context)
{
    if (!has_timer_api(api) || !has_init_context(context))
        return false;

    memset(&g_api, 0, sizeof(g_api));
    memcpy(&g_api, api, api->struct_size < sizeof(g_api) ? api->struct_size : sizeof(g_api));
    g_has_api = true;
    g_owner_token = context->plugin_owner_token;
    atomic_store(&g_timer_seen, false);

    const uint64_t timer_id = g_api.RegisterTimerWithOwnerTokenHandle(
        g_owner_token,
        1000,
        1000,
        OBELISK_TIMER_FLAG_REPEATING,
        on_timer,
        &g_timer_user_data);
    if (timer_id == 0)
    {
        reset_state();
        return false;
    }
    atomic_store(&g_timer_id, timer_id);

    if (g_api.LogInfo != NULL)
        g_api.LogInfo("[obelisk_sdk_timer_plugin] timer registered");
    return true;
}

OBELISK_PLUGIN_EXPORT
void ObeliskPlugin_Shutdown(void)
{
    const uint64_t timer_id = atomic_exchange(&g_timer_id, 0);
    if (g_has_api && timer_id != 0 && g_api.UnregisterTimerWithOwnerToken != NULL)
        g_api.UnregisterTimerWithOwnerToken(g_owner_token, timer_id);
    if (g_has_api && g_api.LogInfo != NULL)
        g_api.LogInfo("[obelisk_sdk_timer_plugin] shutdown");
    reset_state();
}
