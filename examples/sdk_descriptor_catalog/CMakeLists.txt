cmake_minimum_required(VERSION 3.22)
project(ObeliskSdkDescriptorCatalog LANGUAGES C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS OFF)

find_package(Obelisk 0.1.0 CONFIG REQUIRED COMPONENTS SDK)

add_library(obelisk_sdk_descriptor_catalog SHARED descriptor_catalog_plugin.c)
target_link_libraries(obelisk_sdk_descriptor_catalog PRIVATE Obelisk::obelisk_sdk)
option(OBELISK_SDK_DESCRIPTOR_CATALOG_TEST_PROBES "Export install-layout test probes" OFF)
if(OBELISK_SDK_DESCRIPTOR_CATALOG_TEST_PROBES)
    target_compile_definitions(obelisk_sdk_descriptor_catalog PRIVATE OBELISK_SDK_DESCRIPTOR_CATALOG_TEST_PROBES=1)
endif()
set_target_properties(obelisk_sdk_descriptor_catalog PROPERTIES
    PREFIX ""
    OUTPUT_NAME "obelisk_sdk_descriptor_catalog"
    C_VISIBILITY_PRESET hidden
)
