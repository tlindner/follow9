    org $4000
POLCAT  equ $A000
start
    lda $-10,x
    lda -16,x
    lda <$-10,x
    lda <-16,x
    lda >$-10,x
    lda >-16,x
    
    lda $10,x
    lda 16,x
    lda <$10,x
    lda <16,x
    lda >$10,x
    lda >16,x
    
    lda [POLCAT]
    
    end start
    