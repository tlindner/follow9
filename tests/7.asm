SKP1 equ $21
SKP2 equ $8c
SKP1LD equ $86
    org $1000
start
    clra
    jsr L1
    jsr L2
    rts

L1
    fcb SKP1
L2
    CLRB
    CLRa
    rts
    end start