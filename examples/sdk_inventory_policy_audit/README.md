# Copied Inventory Policy Audit Example

This creator-facing example builds outside the Obelisk source tree and uses only the
installed SDK package:

Support tier: experimental pattern. Formal inactive declaration only: This label is
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
- `OBELISK_API_CAPABILITY_GAMEPLAY_POLICY_EVENTS`
- `OBELISK_API_CAPABILITY_GAMEPLAY_POLICY_EVENT_DESCRIPTORS`
- `RegisterGameplayPolicyEventWithOwnerTokenHandle`
- `UnregisterGameplayPolicyEventWithOwnerToken`
- `DescribeGameplayPolicyEventKind`

This is an experimental copied-data pattern for observing copied inventory-backed
`GameplayPolicyEvent` categories. It counts callback-scope scalar fields from promoted
event kinds and logs only process-local aggregate counts during shutdown.

Before registering, check `abi_version`, capability bits, a non-zero
`plugin_owner_token`, `struct_size` coverage for both
`RegisterGameplayPolicyEventWithOwnerTokenHandle` and
`UnregisterGameplayPolicyEventWithOwnerToken`, and non-null function pointers. A returned
registration ID of `0` is failure; release any owner-scoped state already acquired during
init and return init failure.
Before reading `capabilities` or gameplay policy slots, first reject an API table whose
advertised `struct_size` does not cover the appended metadata prefix through
`capabilities`, then verify `abi_version == OBELISK_API_ABI_VERSION`.

Descriptor validation is metadata-only. Event descriptors do not provide identity,
lookup, persistence, mutation, or return-override authority, and resource descriptors
must preserve both `OBELISK_RESOURCE_KIND_DESCRIPTOR_FLAG_NO_IDENTITY` and
`OBELISK_RESOURCE_KIND_DESCRIPTOR_FLAG_NO_LOOKUP` before a copied event category is used
for public SDK routing.

The example does not provide an Inventory SDK, Items SDK, identity, lookup, mutation,
return override, commands, permissions, chat replies/send-chat, storage, ArkApi
compatibility, Windows/MSVC portability, or implementation patterns from other
frameworks. It does not make policy decisions and does not retain callback payloads after
the callback returns.

The `find_package` version is a compatibility floor for the current pre-release SDK line,
not a complete SDK claim and not a claim that a stable `v0.1.0` release tag exists.

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
cmake -S examples/sdk_inventory_policy_audit -B /tmp/obelisk-sdk-inventory-policy-audit-build \
  -DCMAKE_PREFIX_PATH=/path/to/obelisk-install-root
cmake --build /tmp/obelisk-sdk-inventory-policy-audit-build -j"$(nproc)"
```

The output is `obelisk_sdk_inventory_policy_audit.so`. Install plugins into a local
Obelisk root with `scripts/install_obelisk_plugin.sh`; do not copy a partially built
`.so` into a shared runtime `plugins/` directory.
