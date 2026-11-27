cmake_minimum_required(VERSION 3.22)
project(ObeliskSdkMinimalPlugin LANGUAGES C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS OFF)

find_package(Obelisk 0.1.0 CONFIG REQUIRED COMPONENTS SDK)

add_library(obelisk_sdk_minimal_plugin SHARED minimal_plugin.c)
target_link_libraries(obelisk_sdk_minimal_plugin PRIVATE Obelisk::obelisk_sdk)
set_target_properties(obelisk_sdk_minimal_plugin PROPERTIES
    PREFIX ""
    OUTPUT_NAME "obelisk_sdk_minimal_plugin"
    C_VISIBILITY_PRESET hidden
)
