# Minimal Installed-SDK Plugin

This is the smallest package-shape example for building an Obelisk plugin outside the
Obelisk source tree. It uses only the installed CMake package and public C ABI:

Support tier: release-supported seed. Formal inactive declaration only: This label is
parked/inactive until complete-SDK closure; it does not authorize release support,
support-tier activation, Plugin Hub publication/readiness, public module SDK coverage,
runtime support, or public support availability, and contributes `0` SDK/P0 completion
progress. It cannot become active unless a current-turn exact approval and accepted
checker evidence are both named for the release/support claim.

Package-shape status: package-shape-only; stable-claim=false; SDK/P0 completion credit remains 0.

Builder/status artifact boundary: bridge builders, promotion-certificate builders, SDK
status reports, and P0 roadmap/status artifacts are non-claim planning/accounting
inputs here. They do not grant or imply player identity, permissions/admin, command
response, commands/replies, stable SDK, public package readiness, Plugin Hub
readiness/publication, support-tier activation, runtime readiness, SDK/P0 progress, or
v1 completion.

- `find_package(Obelisk 0.1.0 CONFIG REQUIRED COMPONENTS SDK)`
- `Obelisk::obelisk_sdk`
- `ObeliskPlugin_GetInfo`
- `ObeliskPlugin_Init`
- optional `ObeliskPlugin_Shutdown`
- logging through the copied `ObeliskApi` table

It does not use `ProcessEvent`, gameplay events, new gameplay APIs, chat events, timers,
UE pointers, identity, lookup, mutation, return overrides, chat replies/send-chat, legacy
plugin migration claims, non-Linux toolchain promises, or implementation headers. It has
no private API access.

In a real Obelisk load, the runtime evaluates the plugin activation envelope before
calling `ObeliskPlugin_Init`: `enabled=false`, a missing or non-matching
`instance_allowlist`, or an unsafe allowlist prevents the plugin from initializing. This
minimal example does not parse config itself and must not be copied as the activation
model for feature plugins. Once a plugin uses an optional surface such as events or
timers, follow the reference plugins by checking capabilities, enforcing `struct_size`
gates before reading appended API slots, validating `plugin_owner_token`, keeping
returned handles, and unregistering owned runtime state during shutdown or init-failure
cleanup.

Before reading `capabilities` or trusting any optional slot, first reject an API table
whose advertised `struct_size` does not cover the appended metadata prefix through
`capabilities`, then verify `abi_version == OBELISK_API_ABI_VERSION`.

Treat each appended function pointer as independently optional. A capability bit does not
make a slot callable unless `struct_size` covers that exact pointer and the pointer is
non-null; for handle APIs, check both the register and matching unregister slot before
registering anything. A returned handle of `0` is failure, not a valid owner-scoped
handle.

Owner tokens and returned handles are process-local runtime values; keep them only in
memory for matching owner-scoped unregister calls, and never persist them, share them
between ARK server processes, or reuse them after restart, reload, or unload. They have
no post-unload validity.

The `ObeliskApi*` pointer and `ObeliskPluginInitContext` string pointers passed to
`ObeliskPlugin_Init` are borrowed for init only. This example copies the API table by
value before using logging during shutdown and does not retain `config_dir`,
`config_path`, or `instance_id` after init.

The example intentionally uses the installed SDK package and the current numeric
compatibility floor:

```cmake
find_package(Obelisk 0.1.0 CONFIG REQUIRED COMPONENTS SDK)
target_link_libraries(obelisk_sdk_minimal_plugin PRIVATE Obelisk::obelisk_sdk)
```

That package version is a compatibility floor for the current pre-release SDK line, not a
complete SDK claim and not a claim that a stable `v0.1.0` release tag exists.

Do not link this template against `libobelisk.so`, `libsubhook.so`, runtime/private
targets, or first-party plugin implementation libraries. External SDK plugins should
consume only the installed public header through `Obelisk::obelisk_sdk`.

The exact `find_package(Obelisk 0.1.0 CONFIG REQUIRED COMPONENTS SDK)` request
and `Obelisk::obelisk_sdk` target are prerelease compatibility/package-shape floor
checks only; they do not activate support tiers, release support, Plugin Hub
publication/readiness, public module SDK coverage, identity, permissions/admin,
commands/replies, `ResourceHandle`, lookup, mutation, return override, or runtime
support.

This example is a foundation/contributor package-shape sample, not ArkApi portability
guidance and not Obelisk SDK v1 evidence.

## Build

Install Obelisk into a test root first, then point CMake at that install:

```bash
cmake -S examples/sdk_minimal_plugin -B /tmp/obelisk-sdk-minimal-build \
  -DCMAKE_PREFIX_PATH=/path/to/obelisk-install-root
cmake --build /tmp/obelisk-sdk-minimal-build -j"$(nproc)"
```

The output is `obelisk_sdk_minimal_plugin.so`. Install plugins into a local Obelisk root
with `scripts/install_obelisk_plugin.sh`; do not copy a partially built `.so` into a
shared runtime `plugins/` directory.
