	org $4000
start
	lbra loop
data
    fdb $1234,$1234,$1234
loop
	ldx #data
    ldx data,pcr
	bne loop
	beq loop
	jmp loop
	end start
	