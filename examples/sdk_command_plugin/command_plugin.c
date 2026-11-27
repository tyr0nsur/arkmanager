#include <obelisk/ObeliskApi.h>

#include <string.h>

#if !defined(__linux__) || !defined(__x86_64__)
#error "This example targets the experimental Linux x86_64 runtime."
#endif

#define EXPORT __attribute__((visibility("default")))
#define API_COVERS(api, slot) \
    ((api)->struct_size >= offsetof(ObeliskApi, slot) + sizeof((api)->slot))
// The October experimental SDK already supports these exports, but predates
// their symbolic declaration in the public header. Preserve that source floor.
#ifndef OBELISK_PLUGIN_LIFECYCLE_MANAGED_CALLBACKS_ONLY
#define OBELISK_PLUGIN_LIFECYCLE_MANAGED_CALLBACKS_ONLY 1u
#endif

static ObeliskApi g_api;
static uint64_t g_owner;
static uint64_t g_hello;
static uint64_t g_echo;

static void reply(const ObeliskCommandInvocation* invocation, const char* text, size_t size)
{
    const ObeliskCommandStringView view = {text, size};
    // Delivery acceptance is not a receipt from the client. Never retain the token.
    if (!g_api.ReplyToCommandWithOwnerToken(g_owner, invocation->invocation_token, view) && g_api.LogWarn)
        g_api.LogWarn("[sdk_command] Reply was rejected by the runtime.");
}

static void on_command(const ObeliskCommandInvocation* invocation, void* user_data)
{
    if (!invocation || invocation->abi_version != OBELISK_COMMAND_INVOCATION_ABI_VERSION ||
        invocation->struct_size < sizeof(*invocation) || !invocation->invocation_token)
        return;

    if (!user_data) {
        static const char greeting[] = "Hello from the installed ObeliskNative SDK!";
        reply(invocation, greeting, sizeof(greeting) - 1);
        return;
    }

    // VERB matching is explicitly enabled for /sdkecho. Full UTF-8 input is
    // borrowed for this callback; only the ASCII command name is case-folded.
    const char* text = invocation->command_text.data;
    size_t size = invocation->command_text.size;
    if (!text || size < sizeof("/sdkecho") - 1) return;
    text += sizeof("/sdkecho") - 1;
    size -= sizeof("/sdkecho") - 1;
    while (size && (*text == ' ' || *text == '\t')) { ++text; --size; }
    if (!size || size > 1024) {
        static const char usage[] = "Usage: /sdkecho <text, max 1024 UTF-8 bytes>";
        reply(invocation, usage, sizeof(usage) - 1);
    } else {
        reply(invocation, text, size);
    }
}

EXPORT bool ObeliskPlugin_GetInfo(ObeliskPluginMetadata* out)
{
    if (!out) return false;
    *out = (ObeliskPluginMetadata){
        .abi_version = OBELISK_PLUGIN_METADATA_ABI_VERSION,
        .struct_size = sizeof(*out),
        .plugin_id = "obelisk_sdk_command_plugin",
        .name = "ObeliskNative SDK Command Example",
        .version = "0.1.0-experimental.1",
        .config_file = "config.json",
        .default_config_json = "{\"enabled\":false,\"allow_all_instances\":false,\"instance_allowlist\":[]}"
    };
    return true;
}

EXPORT void ObeliskPlugin_Shutdown(void)
{
    // Outside callbacks, unregister drains in-flight uses before state is reset.
    if (g_echo) g_api.UnregisterCommandWithOwnerToken(g_owner, g_echo);
    if (g_hello) g_api.UnregisterCommandWithOwnerToken(g_owner, g_hello);
    g_echo = g_hello = g_owner = 0;
    memset(&g_api, 0, sizeof(g_api));
}

EXPORT bool ObeliskPlugin_Init(ObeliskApi* api, const ObeliskPluginInitContext* context)
{
    // Check prefix coverage before ABI/capability reads and each slot before use.
    if (g_owner || !api || !API_COVERS(api, capabilities) ||
        api->abi_version != OBELISK_API_ABI_VERSION ||
        !context || context->abi_version != OBELISK_PLUGIN_INIT_CONTEXT_ABI_VERSION ||
        context->struct_size < offsetof(ObeliskPluginInitContext, plugin_owner_token) + sizeof(context->plugin_owner_token) ||
        !context->plugin_owner_token ||
        !(api->capabilities & OBELISK_API_CAPABILITY_COMMAND_REPLIES) ||
        !(api->capabilities & OBELISK_API_CAPABILITY_COMMAND_MATCH_OPTIONS) ||
        !API_COVERS(api, RegisterCommandWithOwnerTokenHandle) || !api->RegisterCommandWithOwnerTokenHandle ||
        !API_COVERS(api, UnregisterCommandWithOwnerToken) || !api->UnregisterCommandWithOwnerToken ||
        !API_COVERS(api, ReplyToCommandWithOwnerToken) || !api->ReplyToCommandWithOwnerToken ||
        !API_COVERS(api, RegisterCommandWithOptionsWithOwnerTokenHandle) || !api->RegisterCommandWithOptionsWithOwnerTokenHandle)
        return false;

    memset(&g_api, 0, sizeof(g_api));
    memcpy(&g_api, api, api->struct_size < sizeof(g_api) ? api->struct_size : sizeof(g_api));
    g_owner = context->plugin_owner_token;
    g_hello = g_api.RegisterCommandWithOwnerTokenHandle(g_owner, "/sdkhello", on_command, NULL);
    if (g_hello)
        g_echo = g_api.RegisterCommandWithOptionsWithOwnerTokenHandle(g_owner, "/sdkecho",
            OBELISK_COMMAND_MATCH_FLAG_VERB | OBELISK_COMMAND_MATCH_FLAG_ASCII_CASE_INSENSITIVE,
            on_command, &g_echo);
    if (!g_hello || !g_echo) {
        ObeliskPlugin_Shutdown();
        return false;
    }
    return true;
}

EXPORT uint32_t ObeliskPlugin_LifecycleCapabilities(void)
{
    return OBELISK_PLUGIN_LIFECYCLE_MANAGED_CALLBACKS_ONLY;
}

EXPORT bool ObeliskPlugin_PrepareUnload(void)
{
    // No threads, external callbacks or deferred plugin-owned work exist.
    return true;
}
