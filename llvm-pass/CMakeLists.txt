cmake_minimum_required(VERSION 3.20)
project(EnergyPass LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

find_package(ZLIB REQUIRED)
find_package(LLVM REQUIRED CONFIG)

message(STATUS "Using LLVM ${LLVM_PACKAGE_VERSION}")
message(STATUS "LLVMConfig.cmake found at ${LLVM_DIR}")

list(APPEND CMAKE_MODULE_PATH "${LLVM_CMAKE_DIR}")
include(AddLLVM)
include(HandleLLVMOptions)

add_library(EnergyPass MODULE
  src/EnergyAnalysisPass.cpp
  src/EnergyModel.cpp
)

target_include_directories(EnergyPass
  PRIVATE
    ${LLVM_INCLUDE_DIRS}
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_compile_definitions(EnergyPass PRIVATE ${LLVM_DEFINITIONS})

llvm_map_components_to_libnames(ENERGY_PASS_LINK_COMPONENTS
  Core
  CodeGen
  Remarks
  Support
  TransformUtils
)

if(TARGET LLVM)
  target_link_libraries(EnergyPass PRIVATE LLVM)
else()
  target_link_libraries(EnergyPass PRIVATE ${ENERGY_PASS_LINK_COMPONENTS})
endif()

set_target_properties(EnergyPass PROPERTIES
  PREFIX ""
  OUTPUT_NAME "EnergyPass"
)
