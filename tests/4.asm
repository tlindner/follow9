	org $2000
start
	lda #34
	lda $2234
	rts
	fdb one,two,three,four
one
	lda #$1
	rts
	
	org $2500
two
	lda #$1
	rts
	
	org $3000
three
	lda #$1
	rts
	
	org $3500
four
	lda #$1
	rts
	end start
	