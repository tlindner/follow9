	org $2000
	fcc 'tim lindner'
start
	lbeq loop
	beq poop
	lda ,x+
	lda ,y++
poop
	ldb ,-u
	ldb ,--u
	bsr finish
	bsr sub
	rts
	
	org $2030
sub
	ldb ,s
	lda a,u
	ldb b,s
	lda #$54
loop
	bra loop
finish
	bne loop
	beq loop
	lbsr start
	jmp loop
	end start
	