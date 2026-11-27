cmake_minimum_required(VERSION 3.22)
project(ObeliskSdkInventoryPolicyAudit LANGUAGES C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS OFF)

find_package(Obelisk 0.1.0 CONFIG REQUIRED COMPONENTS SDK)

add_library(obelisk_sdk_inventory_policy_audit SHARED inventory_policy_audit_plugin.c)
target_link_libraries(obelisk_sdk_inventory_policy_audit PRIVATE Obelisk::obelisk_sdk)
option(OBELISK_SDK_INVENTORY_POLICY_AUDIT_TEST_PROBES "Export install-layout test probes" OFF)
if(OBELISK_SDK_INVENTORY_POLICY_AUDIT_TEST_PROBES)
    target_compile_definitions(
        obelisk_sdk_inventory_policy_audit
        PRIVATE OBELISK_SDK_INVENTORY_POLICY_AUDIT_TEST_PROBES=1
    )
endif()
set_target_properties(obelisk_sdk_inventory_policy_audit PROPERTIES
    PREFIX ""
    OUTPUT_NAME "obelisk_sdk_inventory_policy_audit"
    C_VISIBILITY_PRESET hidden
)
