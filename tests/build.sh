#!/bin/sh

lwasm --decb -o 1.bin --list=1.lst 1.asm
lwasm --decb -o 2.bin --list=2.lst 2.asm
cc -oindex index.c
./index.exe >3.bin
lwasm --decb -o 4.bin --list=4.lst 4.asm
lwasm --decb -o 5.bin --list=5.lst 5.asm
lwasm --decb -o 6.bin --list=6.lst 6.asm
lwasm --decb -o 7.bin --list=7.lst 7.asm
lwasm --decb -o 8.bin --list=8.lst 8.asm
