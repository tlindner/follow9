#include <stdio.h>

int main( int argc, char *argv[] )
{
	int i;
	
	for( i=0; i<0x100; i++ )
	{
		printf( "%c%c", 0xa6, i );
	
		switch( i ) {
			case 0x88:
			case 0x8c:
			case 0x98:
			case 0x9c:
			case 0xa8:
			case 0xac:
			case 0xb8:
			case 0xbc:
			case 0xc8:
			case 0xcc:
			case 0xd8:
			case 0xdc:
			case 0xe8:
			case 0xec:
			case 0xf8:
			case 0xfc:
				printf( "%c", 0x55 );
				break;
			
			case 0x89:
			case 0x8d:
			case 0x99:
			case 0x9d:
			case 0x9f:
			case 0xa9:
			case 0xad:
			case 0xaf:
			case 0xb0:
			case 0xb9:
			case 0xbd:
			case 0xc9:
			case 0xcd:
			case 0xd9:
			case 0xdd:
			case 0xdf:
			case 0xe9:
			case 0xed:
			case 0xf9:
			case 0xfd:
			case 0xff:
				printf( "%c%c", 0xaa, 0xaa );
				break;
		}
	}


}