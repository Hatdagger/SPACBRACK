#!/bin/sh
# Build the PC harness for the front end (test/frontend.c includes main.c).
# main.c is copied away from src/ so its #include "externs.h" finds the
# stand-in in test/stubs instead of the real one.
set -e
cd "$(dirname "$0")/.."
B=${1:-build-pc}
mkdir -p "$B"
cp src/main.c src/sound.c src/sound.h src/sound_ids.h src/save.c src/save.h src/rules.h src/cpu.h src/art_keys.h "$B/"
CF="-std=c89 -pedantic -Wall -Wextra -Werror -O2 -Itest/stubs"
gcc $CF -c src/rules.c -o "$B/rules.o"
gcc $CF -c src/cpu.c -o "$B/cpu.o"
gcc $CF -I"$B" -c test/frontend.c -o "$B/frontend.o"   # includes main.c, sound.c, save.c
gcc -o "$B/frontend" "$B/rules.o" "$B/cpu.o" "$B/frontend.o"
echo "built $B/frontend"
