cmake_minimum_required(VERSION 3.22)
project(ObeliskSdkTimerPlugin LANGUAGES C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS OFF)

find_package(Obelisk 0.1.0 CONFIG REQUIRED COMPONENTS SDK)

option(OBELISK_SDK_TIMER_PLUGIN_TEST_PROBES "Export install-layout test probes" OFF)

add_library(obelisk_sdk_timer_plugin SHARED timer_plugin.c)
target_link_libraries(obelisk_sdk_timer_plugin PRIVATE Obelisk::obelisk_sdk)
if(OBELISK_SDK_TIMER_PLUGIN_TEST_PROBES)
    target_compile_definitions(obelisk_sdk_timer_plugin PRIVATE OBELISK_SDK_TIMER_PLUGIN_TEST_PROBES=1)
endif()
set_target_properties(obelisk_sdk_timer_plugin PROPERTIES
    PREFIX ""
    OUTPUT_NAME "obelisk_sdk_timer_plugin"
    C_VISIBILITY_PRESET hidden
)
