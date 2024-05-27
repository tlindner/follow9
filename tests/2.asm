	org $4000
start
	lda #$54
loop
	bra loop
	bne loop
	beq loop
	jmp loop
	end start
	