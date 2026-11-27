# ObeliskNative command starter

Support tier: experimental pattern. This declaration does not establish stable
release support or full SDK completion. Runtime capability checks and real-client
acceptance remain required independently of the installed-SDK fixture.

Experimental Linux x86_64 C11 plugin built only against the installed SDK. It
registers `/sdkhello` with exact matching and `/sdkecho <text>` with explicit
verb/ASCII case-insensitive matching. Replies target the current invocation
synchronously. Neither command requires an administrator or accesses identity.

```bash
cmake -S . -B build -DCMAKE_PREFIX_PATH=/path/to/installed/sdk
cmake --build build
nm -D --defined-only build/obelisk_sdk_command_plugin.so
```

The prefix must contain `include/obelisk` and `lib/cmake/Obelisk`. No runtime
library or private repository header is linked. Use the SDK from the same
reviewed experimental runtime release; the version request is a package floor,
not a promise that every 0.1.x runtime supports these operations.

The operator installs the `.so` through the normal plugin installation procedure.
The runtime prepares a disabled config. Enable this plugin only for an explicit
instance, using its generated `config.json`:

```json
{"enabled": true, "allow_all_instances": false, "instance_allowlist": ["theisland"]}
```

The runtime validates that activation envelope before calling Init. The starter
adds no custom settings and does not parse the config itself. Rename the plugin
ID, output library and commands together when making a new plugin.

The sample checks ABI versions, prefix/slot sizes, capabilities, function pointers
and a nonzero owner token. It copies only the advertised API prefix, rolls back
partial registration and exports idempotent shutdown. The cooperative lifecycle
declaration is valid because it owns only managed command callbacks. Adding
workers or external callbacks requires revisiting that declaration. Never retain
invocation tokens, borrowed strings or Init-context pointers. Never reply from a
timer or worker thread. Command replies accept at most 1024 UTF-8 bytes.

Build, registration, rollback and callback behavior are exercised with an
installed-SDK fixture. Real Steam/Epic presentation and multiplayer acceptance
remain separate. This template supplies no authenticated account, permissions,
inventory delivery, ArkApi DLL compatibility or stable SDK completion claim.
