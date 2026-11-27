# Examples

This directory contains creator-facing examples that build against the installed Obelisk
SDK package. These examples are separate from `plugins/`, which contains first-party
in-tree reference plugins used by Obelisk's own build and tests.

They are foundation/contributor package-shape samples for the current installed SDK package,
not ArkApi portability kits, module SDKs, or evidence that Obelisk SDK v1 is complete.

The current native command extension also has `sdk_command_plugin/`: an experimental
installed-SDK C11 consumer for exact commands, opt-in argument matching, scoped directed
replies and cooperative lifecycle. Its executable fixture validates ABI checks, partial
registration cleanup, UTF-8 replies to two mock origins and repeated shutdown/reinit.
Real-client Steam/Epic acceptance is separate. The historical foundation-only limits
below describe the earlier templates; the command starter follows the current native
contracts documented in `docs/SDK_QUICKSTART.md` and `include/obelisk/ObeliskApi.h`.

- `sdk_minimal_plugin/`: smallest external C plugin using `find_package(Obelisk 0.1.0
  CONFIG REQUIRED COMPONENTS SDK)` and `Obelisk::obelisk_sdk`.
- `sdk_descriptor_catalog/`: external C plugin that reads metadata-only resource and
  gameplay policy event descriptors after capability, `struct_size`, and function-pointer
  checks.
- `sdk_timer_plugin/`: external C plugin using the installed SDK timer capability with
  owner-token registration and explicit shutdown cleanup.
- `sdk_inventory_policy_audit/`: external C plugin showing an experimental copied-data
  audit pattern for inventory-backed `GameplayPolicyEvent` callbacks; it is not an
  inventory, item, identity, lookup, mutation, return override, command, permission,
  send-chat, storage, or compatibility surface. It is intentionally not built by the
  top-level Obelisk CMake project, not installed by `scripts/install_obelisk.sh`, and
  not part of the release install layout.

Each example README owns exactly one formal inactive `Support tier:` declaration. The
current installed SDK example tiers are for installed-SDK review only, and tier label
text must not be restated in this index, package metadata, or packaging copy except as
the single declaration in the example's own README. These declarations do not activate
support tiers, release support, public support availability, public module SDK coverage,
Plugin Hub publication/readiness, or intake work while SDK blockers remain open.

Current status for this examples slice remains SDK 0/12, P0 0/4, and stable=false.
Installed SDK/package-shape evidence here is package-shape evidence only; it is not
public package readiness, runtime readiness/support, stable SDK wording, or v1 completion
evidence. It cannot be upgraded to release support, support-tier activation, Plugin Hub
readiness/publication, public package readiness, runtime readiness/support, or stable SDK
wording unless a current-turn exact approval and accepted checker evidence are both named;
no such approval/evidence exists in this examples slice.
Every example in this directory is package-shape-only with stable-claim=false.

The three current installed-SDK foundation templates are the starter template
(`sdk_minimal_plugin/`), the descriptor catalog template
(`sdk_descriptor_catalog/`), and the owner-token timer template
(`sdk_timer_plugin/`). They are package-shape and current-C-ABI hygiene templates only.
They do not promise Plugin Hub identity, command routing, permissions/admin,
replies/send-chat/broadcast, storage, inventory/item/structure modules, mutation, return
override authority, ArkApi/AseApi portability, or Obelisk SDK v1 completion.

The `find_package(Obelisk 0.1.0 CONFIG REQUIRED COMPONENTS SDK)` request and
`Obelisk::obelisk_sdk` target are a prerelease compatibility/package-shape floor only.
They do not activate support tiers, release support, Plugin Hub publication/readiness,
public module SDK coverage, identity, permissions/admin, commands/replies,
`ResourceHandle`, lookup, mutation, return override, or runtime support.
The installed CMake package also exports `Obelisk_FIND_PACKAGE_SDK_PACKAGE_SHAPE_ONLY`
and false non-claim markers for exact-version stable-claim aliases, public package readiness,
and v1 completion evidence. Treat those variables as release-boundary markers only, not
as runtime capabilities or support activation.

Foundation examples must stay inside public `include/obelisk/ObeliskApi.h` contracts. Do not use
private headers, raw UE pointers, `ProcessEvent` internals, identity, lookup, mutation,
return overrides, new gameplay APIs, chat replies/send-chat, or ArkApi implementation
patterns in creator-facing examples.

## Installed-SDK Author Validation

Use this pass before publishing a copied example or future post-SDK seed. It validates
package shape and ABI hygiene only; it does not promote gameplay/module readiness or
prove a complete v1 SDK claim.

From the external plugin source root:

```bash
cmake -S . -B build \
  -DCMAKE_PREFIX_PATH=/path/to/obelisk-install-root \
  -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
cmake --build build -j"$(nproc)"
```

Confirm the build consumed the installed SDK headers and did not fall back to a local
Obelisk source checkout:

```bash
rg -n '/path/to/obelisk-install-root/include' build/compile_commands.json
! rg -n '/path/to/Obelisk/include' build/compile_commands.json
```

The plugin CMake must request only the installed SDK package and target:

```bash
rg -n 'find_package\(Obelisk 0\.1\.0 CONFIG REQUIRED COMPONENTS SDK\)|Obelisk::obelisk_sdk' CMakeLists.txt
```

Do not add runtime/private link targets such as `libobelisk.so`, `libsubhook.so`,
`core/`, `runtime/`, `loader/`, `ue/`, or first-party plugin implementation libraries to
external SDK examples. `Obelisk::obelisk_sdk` is an interface include target for the
public C ABI only; linking runtime/private libraries is not package-shape evidence and
turns the example into an in-tree/runtime-coupled artifact.

The public-source check should return no matches for private or unpromoted patterns:

```bash
rg -n --glob '!README.md' --glob '!build/**' \
  '#include .*(core/|plugins/|private|ArkApi|AseApi)|ProcessEvent|UObject|UFunction|FString|GObjects|GetNativePointerField|NativeCall|ResourceHandle' .
```

For a minimal lifecycle/config/logging seed, the dynamic exports should be limited to the
Obelisk plugin entry points:

```bash
nm -D --defined-only build/<plugin-name>.so
```

Before packaging, confirm the plugin:

- exports `ObeliskPlugin_GetInfo` and `ObeliskPlugin_Init` with `extern "C"` or C
  linkage;
- exports idempotent `ObeliskPlugin_Shutdown` if it keeps copied API state, callback
  handles, timer handles, catalog state, threads, files, sockets, or other process-local
  state;
- copies the `ObeliskApi` table by value before using it after init, and never stores
  borrowed `ObeliskPluginInitContext` pointers;
- first rejects an API table whose advertised `struct_size` does not cover the appended
  metadata prefix through `capabilities`, then checks `abi_version`, capability bits,
  non-null function pointers, and a non-zero `plugin_owner_token` before using optional
  callbacks, descriptors, or timers; check `struct_size` per appended function pointer,
  including unregister pointers, not just once per capability family;
- treats a returned callback or timer handle of `0` as registration failure, unregisters
  any owner-scoped handles already acquired during init, and returns init failure instead
  of keeping partial runtime state;
- treats callback handles, timer handles, copied event sequence values, and descriptor
  cache state as process-local only; never persists them in config/shared storage or
  reuses them after restart, map transfer, or another ARK server process; never treats
  them as valid after plugin reload/unload; recreates registrations during
  `ObeliskPlugin_Init` and releases them in `ObeliskPlugin_Shutdown`;
- treats `plugin_owner_token` values as process-local runtime tokens; keeps them only in
  memory for matching owner-scoped unregister calls, and never persists or shares them
  across ARK server processes or reuses them after plugin reload/unload;
- treats resource descriptors as category metadata only and rejects public identity or
  lookup assumptions unless the descriptor explicitly preserves both
  `OBELISK_RESOURCE_KIND_DESCRIPTOR_FLAG_NO_IDENTITY` and
  `OBELISK_RESOURCE_KIND_DESCRIPTOR_FLAG_NO_LOOKUP`;
- ships `default_config_json` as a parseable top-level JSON object with a safe-disabled
  activation envelope: `enabled=false`, `allow_all_instances=false`, and an empty
  `instance_allowlist`;
- contains exactly one formal inactive `Support tier:` declaration in the example
  README; do not restate the label in package metadata or packaging copy, and never
  treat it as Plugin Hub publication, release support, support-tier activation, public
  module SDK coverage, runtime support/readiness, or installed SDK completion evidence.
