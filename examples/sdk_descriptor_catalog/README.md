# Descriptor Catalog SDK Plugin

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
- `OBELISK_API_CAPABILITY_RESOURCE_KIND_DESCRIPTORS`
- `OBELISK_API_CAPABILITY_GAMEPLAY_POLICY_EVENT_DESCRIPTORS`
- `DescribeResourceKind`
- `DescribeGameplayPolicyEventKind`

It demonstrates metadata-only descriptor discovery for the current installed-SDK
package-shape seed. Resource descriptors are category data only. They are not identity,
lookup handles, persistent IDs, mutable resources, or proof that two events refer to the
same object.
Gameplay policy event descriptors are discovery data only. They do not expose raw UE
state, return override authority, mutation, or object lookup.
Descriptor APIs do not imply identity, permissions/admin, commands/replies, `ResourceHandle`, lookup, mutation, return override, support-tier activation, release support, Plugin Hub publication/readiness, or runtime support.

`ObeliskPlugin_Init` receives borrowed `api` and `context` pointers. This example uses
them only during init; a plugin that needs runtime functions later must copy the
advertised `ObeliskApi` prefix by value and keep any context strings in plugin-owned
storage. Descriptor callers must check `struct_size`, the descriptor capability bits,
and non-null descriptor function pointers, then initialize each descriptor output
`struct_size` to the fixed v1 descriptor size before calling the API.
Before reading `capabilities` or descriptor slots, first reject an API table whose
advertised `struct_size` does not cover the appended metadata prefix through
`capabilities`, then verify `abi_version == OBELISK_API_ABI_VERSION`.

Check each descriptor slot independently. A runtime may advertise one descriptor
capability while an older or partial table omits a later appended pointer, so callers
must verify `struct_size` covers `DescribeResourceKind` before using resource descriptors
and covers `DescribeGameplayPolicyEventKind` before using event-kind descriptors.
For resource descriptors, require both
`OBELISK_RESOURCE_KIND_DESCRIPTOR_FLAG_NO_IDENTITY` and
`OBELISK_RESOURCE_KIND_DESCRIPTOR_FLAG_NO_LOOKUP`; missing either flag means the category
must not be treated as public identity, lookup, handle, persistence, or correlation data.

The example does not use private headers, raw UE pointers, `ProcessEvent`, gameplay
module APIs, identity, lookup, mutation, return overrides, chat replies/send-chat, ArkApi
compatibility, Windows/MSVC portability, or implementation patterns from other
frameworks.

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
cmake -S examples/sdk_descriptor_catalog -B /tmp/obelisk-sdk-descriptor-catalog-build \
  -DCMAKE_PREFIX_PATH=/path/to/obelisk-install-root
cmake --build /tmp/obelisk-sdk-descriptor-catalog-build -j"$(nproc)"
```

The output is `obelisk_sdk_descriptor_catalog.so`. Install plugins into a local Obelisk
root with `scripts/install_obelisk_plugin.sh`; do not copy a partially built `.so` into a
shared runtime `plugins/` directory.
