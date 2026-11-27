cmake_minimum_required(VERSION 3.22)
project(ObeliskSdkCommandPlugin LANGUAGES C)

find_package(Obelisk 0.1.0 CONFIG REQUIRED COMPONENTS SDK)

add_library(obelisk_sdk_command_plugin SHARED command_plugin.c)
target_link_libraries(obelisk_sdk_command_plugin PRIVATE Obelisk::obelisk_sdk)
set_target_properties(obelisk_sdk_command_plugin PROPERTIES
    PREFIX ""
    C_STANDARD 11
    C_STANDARD_REQUIRED ON
    C_EXTENSIONS OFF
    C_VISIBILITY_PRESET hidden
)
