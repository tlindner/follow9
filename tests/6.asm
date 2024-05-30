	org $1000
start
	lda data1
	lda data2
	lda data3
	lda $0500
	rts
data1 fdb $1234
data2 fcb $56
data3 fcc "TIM"
	fdb jump1,jump2,jump3
	fcb $01,$02,$03,$04
jump1
	rts
jump2
	rts
jump3
	rts
	end start
