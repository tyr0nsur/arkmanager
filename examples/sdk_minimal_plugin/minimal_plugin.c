#include <obelisk/ObeliskApi.h>

#include <stdbool.h>
#include <stddef.h>
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

static const char kDefaultConfig[] =
    "{\n"
    "  \"enabled\": false,\n"
    "  \"allow_all_instances\": false,\n"
    "  \"instance_allowlist\": []\n"
    "}\n";

static bool has_api_metadata_prefix(const ObeliskApi* api)
{
    return api != NULL &&
        api->struct_size >= offsetof(ObeliskApi, capabilities) + sizeof(api->capabilities);
}

static bool has_init_context_prefix(const ObeliskPluginInitContext* context)
{
    return context != NULL &&
        context->abi_version == OBELISK_PLUGIN_INIT_CONTEXT_ABI_VERSION &&
        context->struct_size >= offsetof(ObeliskPluginInitContext, instance_id) +
            sizeof(context->instance_id);
}

static void reset_state(void)
{
    memset(&g_api, 0, sizeof(g_api));
    g_has_api = false;
}

OBELISK_PLUGIN_EXPORT
bool ObeliskPlugin_GetInfo(ObeliskPluginMetadata* out)
{
    if (out == NULL)
        return false;

    out->abi_version = OBELISK_PLUGIN_METADATA_ABI_VERSION;
    out->struct_size = sizeof(ObeliskPluginMetadata);
    out->plugin_id = "obelisk_sdk_minimal_plugin";
    out->name = "Obelisk SDK Minimal Plugin";
    out->version = "0.1.0";
    out->config_file = "config.json";
    out->default_config_json = kDefaultConfig;
    return true;
}

OBELISK_PLUGIN_EXPORT
bool ObeliskPlugin_Init(ObeliskApi* api, const ObeliskPluginInitContext* context)
{
    if (!has_api_metadata_prefix(api) ||
        api->abi_version != OBELISK_API_ABI_VERSION ||
        !has_init_context_prefix(context))
    {
        return false;
    }

    memset(&g_api, 0, sizeof(g_api));
    memcpy(&g_api, api, api->struct_size < sizeof(g_api) ? api->struct_size : sizeof(g_api));
    g_has_api = true;

    if (g_api.LogInfo != NULL)
        g_api.LogInfo("[obelisk_sdk_minimal_plugin] loaded");
    return true;
}

OBELISK_PLUGIN_EXPORT
void ObeliskPlugin_Shutdown(void)
{
    if (g_has_api && g_api.LogInfo != NULL)
        g_api.LogInfo("[obelisk_sdk_minimal_plugin] shutdown");
    reset_state();
}
