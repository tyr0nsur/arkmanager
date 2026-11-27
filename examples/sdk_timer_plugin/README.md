# Timer SDK Plugin

This creator-facing example builds outside the Obelisk source tree and uses only the
installed SDK package:

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
- `OBELISK_API_CAPABILITY_TIMERS`
- `RegisterTimerWithOwnerTokenHandle`
- `UnregisterTimerWithOwnerToken`

It demonstrates one timer example: process-local owner-token timers.
Timer IDs are runtime handles only. They are not stable across process restarts, ARK server
instances, maps, plugin reloads, or cluster nodes, and must never be persisted in shared
configuration or storage. Timer IDs and owner tokens have no post-unload validity. A
returned timer ID of `0` means registration failed; clean up any owner-scoped state
already acquired during init and return init failure.

The timer capability bit is not enough by itself. Check `struct_size` covers both
`RegisterTimerWithOwnerTokenHandle` and `UnregisterTimerWithOwnerToken`, verify both
function pointers are non-null, and require a non-zero `plugin_owner_token` before
registering a timer.
Before reading `capabilities` or timer slots, first reject an API table whose advertised
`struct_size` does not cover the appended metadata prefix through `capabilities`, then
verify `abi_version == OBELISK_API_ABI_VERSION`.

`ObeliskPlugin_Init` receives borrowed `api` and `context` pointers. This example copies
the advertised `ObeliskApi` prefix by value before using it from shutdown, keeps only the
process-local `plugin_owner_token`, and does not store `config_dir`, `config_path`, or
`instance_id` pointers after init returns.

The owner token is also process-local runtime state: keep it only in memory for matching
owner-scoped unregister calls, never write it to config/shared storage, and never reuse
it after restart, reload, unload, or in another ARK server process.

The example does not use private headers, raw UE pointers, gameplay module APIs, identity,
lookup, mutation, return overrides, chat replies/send-chat, ArkApi compatibility,
Windows/MSVC portability, or implementation patterns from other frameworks.

The `find_package` version is a compatibility floor for the current pre-release SDK line,
not a complete SDK claim and not a claim that a stable `v0.1.0` release tag exists.

Do not link this example against `libobelisk.so`, `libsubhook.so`, runtime/private
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
cmake -S examples/sdk_timer_plugin -B /tmp/obelisk-sdk-timer-build \
  -DCMAKE_PREFIX_PATH=/path/to/obelisk-install-root
cmake --build /tmp/obelisk-sdk-timer-build -j"$(nproc)"
```

The output is `obelisk_sdk_timer_plugin.so`. Install plugins into a local Obelisk root
with `scripts/install_obelisk_plugin.sh`; do not copy a partially built `.so` into a
shared runtime `plugins/` directory.
