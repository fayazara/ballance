#!/usr/bin/env python3
"""Build native and WASM audit bridges against the pinned, separately supplied SDK.

Generated SDK binaries stay outside the shipped application. This does not fetch
dependencies, install a compiler, execute the original game, or start a server.
"""
import argparse
import json
import os
import platform
import re
import subprocess
from pathlib import Path

REVISION = '7579664996e68040dd0158081b04f612e6a2d515'
parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
source, output = args.source.resolve(), args.output.resolve()
revision = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
assert revision == REVISION, f'Expected IVP {REVISION}, got {revision}'
assert not subprocess.check_output(['git', '-C', str(source), 'status', '--porcelain'], text=True).strip(), 'Reference source must be unmodified'
output.mkdir(parents=True, exist_ok=True)
environment = {**os.environ, 'EM_CACHE': str(output / 'emscripten-cache')}
wrapper = Path(__file__).with_name('ivp-simulation-bridge.cpp').resolve()
libraries = ['ivp_compact_builder', 'ivp_controller', 'ivp_physics', 'ivp_collision', 'ivp_surface_manager', 'ivp_utility']

# The 64-bit reference selects a four-element retail matrix kernel and a
# four-byte offset shift. Compare against the original 32-bit scalar kernel,
# keeping a pointer-width mask on native hosts. The supplied SDK stays untouched;
# only this generated compatibility header is force-included in the native build.
matrix = (source / 'ivp_physics/ivp_great_matrix.hxx').read_text()
matrix, changes = re.subn(r'#ifdef PLATFORM_64BITS\n.*?(?=\n#else\n#define IVP_VECFPU_SIZE 1)',
    '#ifdef PLATFORM_64BITS\n#define IVP_VECFPU_SIZE 1\n#define IVP_VECFPU_LD 0\n'
    '#define IVP_VECFPU_MASK 0xffffffff\n#define IVP_VECFPU_MEM_MASK (~(uintp)7)\n#define IVP_VECFPU_MEMSHIFT 3', matrix, count=1, flags=re.S)
assert changes == 1, 'Expected pinned 64-bit matrix kernel block'
compatibility = output / 'native-scalar-matrix.hxx'
compatibility.write_text('#include <ivp_physics.hxx>\n' + matrix)
native_options = output / 'native-options.cmake'
# Project includes run after CMake's compiler checks, which do not have the
# staged SDK include directory yet. The include applies to library builds only.
native_options.write_text('add_compile_options("-include" "${CMAKE_CURRENT_LIST_DIR}/native-scalar-matrix.hxx")\n')

def run(command, name):
    print(name, flush=True)
    with (output / (name + '.log')).open('w') as log:
        subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=True, env=environment)

for target in ['native', 'wasm']:
    build = output / (target + '-build')
    native_matrix_flags = ['-include', str(compatibility)] if target == 'native' else []
    run((['emcmake'] if target == 'wasm' else []) + ['cmake', '-S', str(source), '-B', str(build),
        '-DCMAKE_BUILD_TYPE=Release', '-DIVP_INCLUDE_GEOMPACK=OFF', '-DIVP_INCLUDE_3DSIMPORT=OFF',
        '-DIVP_INCLUDE_QHULL=ON', '-DCMAKE_CXX_FLAGS=-DUNIX -ffp-contract=off',
        '-DCMAKE_PROJECT_ivp_INCLUDE=' + (str(native_options) if target == 'native' else '')], target + '-configure')
    run(['cmake', '--build', str(build), '-j', '8'], target + '-compile')
    flags = ['-DAPPLE'] if target == 'native' and platform.system() == 'Darwin' else []
    if target == 'wasm':
        flags += ['-sMODULARIZE=1', '-sEXPORT_ES6=1', '-sENVIRONMENT=web,node', '-sALLOW_MEMORY_GROWTH=1',
                  '-sEXPORTED_FUNCTIONS=["_malloc","_free"]', '-sEXPORTED_RUNTIME_METHODS=["HEAPF64","HEAPU8"]', '-sASSERTIONS=1']
    run(['em++' if target == 'wasm' else 'c++', '-std=c++17', '-O2', '-DUNIX', '-DIVP_VERSION_SDK',
         '-fno-strict-aliasing', '-ffp-contract=off', *native_matrix_flags, '-I' + str(build / 'include/ivp'), str(wrapper),
         *[str(build / ('lib' + lib + '.a')) for lib in libraries], *flags,
         '-o', str(output / ('ivp-simulation.mjs' if target == 'wasm' else 'ivp-simulation-native'))], target + '-link')
    if target == 'native':
        # Generate inertia data with exactly the same geometry builder and
        # floating-point settings as the native/WASM simulation comparison.
        run(['c++', '-std=c++17', '-O2', '-DUNIX', '-DIVP_VERSION_SDK',
             '-fno-strict-aliasing', '-ffp-contract=off', *native_matrix_flags,
             '-I' + str(build / 'include/ivp'), str(wrapper.with_name('measure-original-inertia.cpp')),
             *[str(build / ('lib' + lib + '.a')) for lib in libraries], *flags,
             '-o', str(output / 'measure-inertia')], 'native-inertia-link')

(output / 'build.json').write_text(json.dumps({'revision': revision, 'source': str(source),
    'nativeMatrixKernel': 'legacy scalar, pointer-width alignment mask', 'floatingPointContraction': False,
    'emscripten': subprocess.check_output(['emcc', '--version'], text=True).splitlines()[0]}, indent=2) + '\n')
