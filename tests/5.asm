 org $0
data0	fcb $24
data1	fcb $24
data2	fcb $24
data3	fcb $24
start
	lda <7,pcr
	lda >10,pcr
	lda <7,pc
	lda >10,pc
	rts
	end start
