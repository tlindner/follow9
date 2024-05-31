/***************************************************************************
 * follow9 -- Javascript 6x09 Disassembler
 * Copyright (c) 2024  tim lindner, https://tlindner.macmess.org/
 * All rights reserved.
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 * notice, this list of conditions and the following disclaimer in the
 * documentation and/or other materials provided with the distribution.
 *
 * This software is derived from dasm09, so its license is below.
 ***************************************************************************/

/***************************************************************************
 * dasm09 -- Portable M6809/H6309/OS9 Disassembler
 *
 * Copyright (c) 2000,2013  Arto Salmi
 * All rights reserved.
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 * notice, this list of conditions and the following disclaimer in the
 * documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE REGENTS AND CONTRIBUTORS ``AS IS"" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE REGENTS AND CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 ***************************************************************************/

var buffer;
var allow_6309_codes = false;
var all_caps = false;
var list_opcodes = false;
var opcode_space, address_space;
var result;
var print_address;
var label_table, jump_table;
var generate_label;
var absIndPC;
var label_aa;

const m6809_exg_tfr = ["d", "x", "y", "u", "s", "pc", "??", "??", "a", "b", "cc", "dp", "??", "??", "??", "??" ];
const h6309_exg_tfr = ["d", "x", "y", "u", "s", "pc", "w" ,"v", "a", "b", "cc", "dp", "0", "0", "e", "f"];

const bit_r = ["cc","a","b","??"];

const block_r = ["d","x","y","u","s","?","?","?","?","?","?","?","?","?","?","?"];

const reg = [ "x","y","u","s" ];

const off4 = [
  "0",  "1",  "2",  "3",  "4",  "5",  "6",  "7",
  "8",  "9", "10", "11", "12", "13", "14", "15",
"-16","-15","-14","-13","-12","-11","-10", "-9",
 "-8", "-7", "-6", "-5", "-4", "-3", "-2", "-1"
];

function newFile() {
    var input = document.getElementById("datafile");

    input.onchange = e => {

        // getting a hold of the file reference
        var file = e.target.files[0];

        // setting up the reader
        var reader = new FileReader();
        reader.readAsArrayBuffer(file);

        // here we tell the reader what to do when it"s done reading...
        reader.onload = readerEvent => {
            buffer = readerEvent.target.result; // this is the content!
            disassemble();
        }
    }
}

function disassemble() {
    allow_6309_codes = document.getElementById("hd6309").checked;
    all_caps = document.getElementById("allCaps").checked;
    list_opcodes = document.getElementById("listOpcodes").checked;
    print_address = document.getElementById("printAddress").checked;
    generate_label = document.getElementById("genLabel").checked;
    absIndPC = document.getElementById("absIndPC").checked;
    result = "";
    label_table = new Array;
    jump_table = new Array;

    if(list_opcodes) {
        opcode_space = "                ";
    }
    else
    {
        opcode_space = "";
    }

    if(print_address) {
        address_space = "     ";
    }
    else
    {
        address_space = "";
    }

    let memory = new Array(65536);
    let view = new Uint8Array(buffer);
    let offset = parseInt(document.getElementById("offset").value)

    if (view.length == 0)
    {
        document.getElementById("disassembly").value = "Data file empty."
        return;
    }

    // build no follow array
    let no_follow = document.getElementById("noFollow").value.split(",");

    for (let i = 0; i < no_follow.length; i++) {
        no_follow[i] = parseInt(no_follow[i]);
    }

    // build transfer address array
    let transfers;
    let preTransfer = document.getElementById("transferList").value;
    if (preTransfer != "")
    {
        transfers = preTransfer.split(",");

        for (let i = 0; i < transfers.length; i++) {
            transfers[i] = parseInt(transfers[i]);

            if((transfers[i] != undefined) || (!isNan(transfers[i])))
            {
                label_table.push(transfers[i]);
            }
        }
    }
    else
    {
        transfers = new Array;
    }

    switch(document.querySelector("input[name=file_type]:checked").value)
    {
        case "raw":
            // Load data into memory, offset by offset

            for (let i=0; i<view.length; i++) {
                write_memory(memory,i+offset,view[i]);
            }
        break;

        case "decb":
            // Disk Extended Color BASIC allows discontiguous segements and an execution address
            let i=0;
            let state = 0;
            let length, address;

            while( i<view.length ) {
                switch( state ) {
                    case 0:
                        if( view[i] == 0 ) {
                            state = 1;
                        } else if (view[i] == 0xff) {
                            state = 6;
                        } else {
                            document.getElementById("disassembly").value = "Malformed DECB binary. Wrong preamble."
                            return;
                        }
                    break;

                    case 1:
                        length = view[i] << 8;
                        state = 2;
                    break;

                    case 2:
                        length += view[i];
                        state = 3;
                    break;

                    case 3:
                        address = view[i] << 8;
                        state = 4;
                    break;

                    case 4:
                        address += view[i];
                        state = 5;
                    break;

                    case 5:
                        write_memory(memory,address+offset,view[i]);
                        length -= 1;

                        if(length==0) {
                            state = 0;
                        }

                        address += 1;
                    break;

                    case 6:
                        address = view[i] << 8;
                        state = 7;
                    break;

                    case 7:
                        address += view[i];
                        state = 8;

                        if( address != 0 ) {
                            document.getElementById("disassembly").value = "Malformed DECB postamble."
                            return;
                        }
                    break;

                    case 8:
                        address = view[i] << 8;
                        state = 9;
                    break;

                    case 9:
                        address += view[i];
                        transfers.push((address+offset)&0xffff);
                        i = view.length;
                    break;
                }

                i += 1;
            }

            // TODO: load symbol table: http://tlindner.macmess.org/?p=820
        break;

        case "os9":
            document.getElementById("disassembly").value = "OS-9 format currently unimplemented.";
            return;
        break;

        default:
            document.getElementById("disassembly").value = "Unknown value for file_type.";
            return;
    }

    document.getElementById("disassembly").value = "";

    // Add transfer table addresses to transfer array
    let ttl = document.getElementById("transferTable").value.split(",");
    ttl.forEach((item) => {
        let range = item.split(";");
        let start = parseInt(range[0]);
        let length = parseInt(range[1]);

            if(start != undefined && (!isNaN(start)))
            {
                label_table.push(start);

                for( let i=start; i<start+length; i+=2 )
                {
                    let address = read_memory(memory,i) << 8;
                    address += read_memory(memory,i+1);
                    if(address != undefined && (!isNaN(address)))
                    {
                        transfers.push(address);
                        label_table.push(address);
                        jump_table.push(i);
                    }
                }
            }
    });

    // fill label table associative array
    label_aa = [];
    let ltaa = document.getElementById("labelList").value.split(",");
    ltaa.forEach((item) => {
        let pair = item.split(";");
        let address = parseInt(pair[1]);
        if(address != undefined && (!isNaN(address)))
        {
            label_aa[address] = pair[0];
            label_table.push(address);
        }
    });

    // Fill disassembly array
    let pc = transfers.pop();
    let dis = new Array;

    while(pc != undefined) {
        if( memory[pc] == undefined ) {
            // unasigned memory, move on
            pc = transfers.pop();
        }
        else if(dis[pc] == undefined)
        {
            // check address if on no follow list
            if(no_follow.includes(pc))
            {
                pc = transfers.pop();
                continue;
            }

            // disassemble new PC
            let address, pc_mode;

            if( allow_6309_codes )
                [pc, address, pc_mode] = disem(memory, pc, dis, opcodes_6309_p1);
            else
                [pc, address, pc_mode] = disem(memory, pc, dis, opcodes_6809_p1);

            switch( pc_mode ) {
                case "pc_nop":     /* no effect */
                break;
                case "pc_jmp":     /* jump */
                    pc = address;
                break;
                case "pc_bra":     /* branch, or subroutine jump */
                    if( address != undefined)
                    {
                        transfers.push(address);
                    }
                break;
                case "pc_tfr":     /* register transfer */
                    if((read_memory(memory,pc-1) & 0x05) == 0x05)
                    {
                        // PC overwritten (at end of subroutine)
                        pc = transfers.pop();
                    }
                break;
                case "pc_ret":     /* return from subroutine */
                    pc = transfers.pop();
                break;
                case "pc_pul":     /* possible end of execution */
                    if( (read_memory(memory, pc-1) & 0x80) == 0x80)
                    {
                        // PC pulled, at end of subroutine
                        pc = transfers.pop();
                    }
                break;
                case "pc_end":     /* end of execution */
                    pc = transfers.pop();
                break;
                default:
                    document.getElementById("disassembly").value = "Fatal error: Unimplemented pc_mode at address: $" + pc.toString(16).padStart(4,"0");
                    return;
            }
        }
        else
        {
            pc = transfers.pop();
        }
    }

    // Sort and unique label table
    label_table = [...new Set(label_table)].sort();

    // print out of bounds labels as equates
    if(generate_label)
    {
        label_table.forEach((item) => {
            if( memory[item] == undefined )
            {
                result += address_space + opcode_space + generate_conditional_label(item) + conditional_caps(" equ $" + item.toString(16).padStart(4,"0")) + "\r";
            }
        });
    }

    // pretty print disassembly
    state = 0;
    let fcb = new Array;

    for( let i=0; i<65536; i++ ) {

        if(memory[i] == undefined ) {
            print_fcb(memory, fcb);

            // Nothing to do if memory is unassigned
            state = 0;
        }
        else if( (dis[i] != undefined))
        {
            print_fcb(memory, fcb);

            if(state == 0 )
            {
                // print org statement if there is a gap
                state = 1;
                result += conditional_caps(address_space + opcode_space + " org     $" + (i).toString(16).padStart(4,"0") + "\r");
            }

            // label
            if( generate_label && label_table.includes(i))
            {
                result += address_space + opcode_space + generate_conditional_label(i) + "\r";
            }

            // disassemble
            if(dis[i] != "" )
            {
                if(print_address) result += conditional_caps((i).toString(16).padStart(4,"0")).padEnd(5, " ");

                result += conditional_caps(dis[i] + "\r");
            }
        }
        else
        {
            if(state == 0 )
            {
                // print org statement if there is a gap
                state = 1;
                result += conditional_caps(address_space + opcode_space + " org     $" + (i).toString(16).padStart(4,"0") + "\r");
            }

            // FCB
            fcb.push(i);
        }
    }

    print_fcb(memory, fcb);

    document.getElementById("disassembly").value = result;
}

function generate_conditional_label(address)
{
    let string;

    if(generate_label)
    {
        if(label_aa[address] != undefined)
        {
            string =  label_aa[address];
        }
        else
        {
            string = "L" + address.toString(16).padStart(4,"0").toUpperCase();
            label_table.push(address);
        }
    }
    else
    {
        string = "$" + address.toString(16).padStart(4,"0");
    }

    return string;
}

function conditional_caps(string)
{
    if(all_caps)
    {
        return string.toUpperCase();
    }

    return string;
}

function print_fcb(mem, fcb )
{
    let i=0, j=0;
    let hex = "", ascii = "";
    let address = fcb[i];
    let fdb;
    let optional_comma, psuedo_op;

    fdb = jump_table.includes(fcb[i]);

    while( i < fcb.length )
    {
        if(j==0)
        {
            if(generate_label && label_table.includes(fcb[i]))
            {
                result += address_space + opcode_space + generate_conditional_label(fcb[i]) + "\r";
            }

            address = fcb[i];
            optional_comma = "";
            hex = "";
            ascii = "";
        }
        else
        {
            optional_comma = ",";
        }

        if(fdb)
        {
            let table = mem[fcb[i]] << 8;
            i += 1;
            table += mem[fcb[i]];
            hex += optional_comma + generate_conditional_label(table);

            ascii += "";
            psuedo_op = "fdb";
        }
        else
        {
            hex += optional_comma + "$" + mem[fcb[i]].toString(16).padStart(2,"0");
            ascii += make_print(mem[fcb[i]]);
            psuedo_op = "fcb";
        }

        i += 1
        j += 1

        if(generate_label && label_table.includes(fcb[i]))
        {
            // Next address has a label
            j=8;
        }

        if((j>7) || (fdb != jump_table.includes(fcb[i])))
        {
            if(print_address) result += conditional_caps(address.toString(16)).padStart(4,"0").padEnd(5, " ");
            result += opcode_space + conditional_caps(" " + psuedo_op + "     " + hex.padEnd(31," ")) + " " + ascii.padEnd(8," ") + "\r";
            j=0;
        }

        fdb = jump_table.includes(fcb[i])
    }

    if( j!= 0 )
    {
        if(print_address) result += conditional_caps(address.toString(16)).padStart(4,"0").padEnd(5, " ");
        result += opcode_space + conditional_caps(" " + psuedo_op + "     " + hex.padEnd(31," ")) + " " + ascii.padEnd(8," ") + "\r";
    }

    fcb.length = 0;
}

function make_print(aChar)
{
    if((aChar > 31) && (aChar <  127))
    {
        return String.fromCharCode(aChar);
    }

    return ".";
}

function disem( mem, pc, dis, inTable )
{
    let table;
    let argument;
    let address;
    let origPC = pc;
    let origPCMode;
    let current;
    let mnenonmic;
    let operand = "";

    // Handle opcode prefix
    if( (read_memory(mem, pc) == 0x10) || (read_memory(mem, pc) == 0x11))
    {
        while( (read_memory(mem, pc) == 0x10) || (read_memory(mem, pc) == 0x11) )
        {
            pc = next_pc( pc, 1 );
        }

        table = inTable[read_memory(mem, origPC)][1];
    }
    else
    {
        table = inTable;
    }

    current = table[read_memory(mem, pc)];
    origPCMode = current[2];
    mnenonmic = current[0];
    pc = next_pc( pc, 1 );

    switch( current[1] ){
        case "nom":    /* no mode */
            operand = "???"
        break;

        case "imp":    /* inherent/implied */
        break;

        case "imb":    /* immediate byte */
            address = read_memory(mem, pc);
            pc = next_pc( pc, 1 );
            operand = "#$" + address.toString(16).padStart(2,"0");
        break;

        case "imw":    /* immediate word */
            address = read_memory(mem, pc) << 8;
            pc = next_pc( pc, 1 );
            address += read_memory(mem, pc);
            pc = next_pc( pc, 1 );
            operand = "#$" + address.toString(16).padStart(4,"0");
        break;

        case "dir":    /* direct */
            address = read_memory(mem, pc);
            pc = next_pc( pc, 1 );
            operand = "<$" + address.toString(16).padStart(2,"0");
        break;

        case "ext":    /* extended                   */
            address = read_memory(mem, pc) << 8;
            pc = next_pc( pc, 1 );
            address += read_memory(mem, pc);
            pc = next_pc( pc, 1 );
            operand = generate_conditional_label(address); //"L" + address.toString(16).padStart(4,"0");
            //label_table.push(address);
        break;

        case "ind":    /* indexed */
            [pc, operand, address] = index_decode( mem, pc, operand );
            if((read_memory(mem,origPC) == 0xad) && (read_memory(mem,origPC+1) == 0x9f))
            {
                // JSR Indexed
                if( (mem[address] != undefined) && (mem[address+1] != undefined))
                {
                    let temp;
                    temp = mem[address] << 8;
                    temp += mem[address+1];
                    address = temp;
                }
                else
                {
                    address = undefined;
                }
            }
        break;

        case "reb":    /* relative byte */
            address = read_memory(mem, pc);
            pc = next_pc( pc, 1 );
            address = pc + (address << 24 >> 24)
            operand = generate_conditional_label(address); // "L" + address.toString(16).padStart(4,"0");
            //label_table.push(address);
        break;

        case "rew":    /* relative word */
            address = read_memory(mem, pc) << 8;
            pc = next_pc( pc, 1 );
            address += read_memory(mem, pc);
            pc = next_pc( pc, 1 );
            address = pc + (address << 16 >> 16)
            operand = generate_conditional_label(address); //"L" + address.toString(16).padStart(4,"0");
            //label_table.push(address);
        break;

        case "r1":    /* tfr/exg mode */
            address = read_memory(mem, pc);
            pc = next_pc( pc, 1 );
            if(allow_6309_codes)
            {
                operand = h6309_exg_tfr[address>>4] + "," + h6309_exg_tfr[address&15];
            }
            else
            {
                operand = m6809_exg_tfr[address>>4] + "," + m6809_exg_tfr[address&15];
            }
        break;

        case "r2":    /* pul/psh system */
        case "r3":    /* pul/psh user */
            address = read_memory(mem, pc);
            pc = next_pc( pc, 1 );
            if( address == 0 ) {
                operand = "$00"
            } else {
                if( address & 0x80 ) operand += "pc,";
                if( address & 0x40 ) {
                    if( current[1] == "r2") operand += "u,";
                    if( current[1] == "r3") operand += "s,";
                }
                if( address & 0x20 ) operand += "y";
                if( address & 0x10 ) operand += "x,";
                if( address & 0x08 ) operand += "dp,";
                if( address & 0x04 ) operand += "b,";
                if( address & 0x02 ) operand += "a,";
                if( address & 0x01 ) operand += "cc,";
                operand = operand.slice(0, -1);
            }
        break;

        case "bd":    /* Bit Manipulation direct */
            let memory = read_memory(mem, pc);
            pc = next_pc( pc, 1 );
            address = read_memory(mem, pc);
            pc = next_pc( pc, 1 );
            operand = "#$" + memory.toString(16).padStart(2,"0") + ",<$" + address.toString(16).padStart(2,"0");
        break;

        case "bi":    /* Bit Manipulation index */
            address = read_memory(mem, pc);
            pc = next_pc( pc, 1 );
            operand = "#$" + address.toString(16).padStart(2,"0") + ",";
            [pc, operand] = index_decode( mem, pc, operand );
        break;

        case "be":    /* Bit Manipulation extended */
            argument = read_memory(mem, pc);
            pc = next_pc( pc, 1 );
            address = read_memory(mem, pc) << 8;
            pc = next_pc( pc, 1 );
            address += read_memory(mem, pc);
            pc = next_pc( pc, 1 );
            operand = "#$" + argument.toString(16).padStart(2,"0") + ",<$" + address.toString(16).padStart(4,"0");
        break;

        case "bt":    /* Bit Transfers direct */
            argument = read_memory(mem, pc);
            pc = next_pc( pc, 1 );
            address = read_memory(mem, pc);
            pc = next_pc( pc, 1 );
            operand = bit_r[argument>>6] + "." + (argument&7) + ",<$" + address.toString(16).padStart(2,"0") + "." + ((argument>>3)&7)
        break;

        case "t1":    /* Block Transfer r0+,r1+ */
            address = read_memory(mem, pc);
            pc = next_pc( pc, 1 );
            operand = block_r[address>>4] + "+," + block_r[address&15] + "+";
        break;

        case "t2":    /* Block Transfer r0-,r1- */
            address = read_memory(mem, pc);
            pc = next_pc( pc, 1 );
            operand = block_r[address>>4] + "-," + block_r[address&15] + "-";
        break;

        case "t3":    /* Block Transfer r0+,r1 */
            address = read_memory(mem, pc);
            pc = next_pc( pc, 1 );
            operand = block_r[address>>4] + "+," + block_r[address&15];
        break;

        case "t4":    /* Block Transfer r0,r1+ */
            address = read_memory(mem, pc);
            pc = next_pc( pc, 1 );
            operand = block_r[address>>4] + "," + block_r[address&15] + "+";
        break;

        case "iml":     /* immediate 32-bit */
            address = read_memory(mem, pc) << 24;
            pc = next_pc( pc, 1 );
            address += read_memory(mem, pc) << 16;
            pc = next_pc( pc, 1 );
            address += read_memory(mem, pc) << 8;
            pc = next_pc( pc, 1 );
            address += read_memory(mem, pc);
            pc = next_pc( pc, 1 );
            operand = "#$" + address.toString(16).padStart(8,"0");
        break;

        default:
            operand = "<<Unimplemented operand>>"
    }

    dis[origPC] = "";
    let opcode_space;
    let j;

    if(list_opcodes) {
        if( origPC > pc )
        {
            // handle wrap around
            for ( let i=origPC; i<0x10000; i++ )
            {
                dis[origPC] += read_memory(mem, i).toString(16).padStart(2,"0")
            }

            j = 0;
        }
        else
        {
            j = origPC;
        }

        for ( let i=j; i<pc; i++ )
        {
            dis[origPC] += read_memory(mem, i).toString(16).padStart(2,"0")
        }

        dis[origPC] = dis[origPC].padEnd(16, " " );
    }

    dis[origPC] += " " + (mnenonmic.padEnd(8, " ") + operand).trim();

    // other memory bytes are set to empty string to suppress printing
    if( origPC+1 > pc )
    {
        // handle wrap around
        for ( let i=origPC+1; i<0x10000; i++ )
        {
            dis[i] = "";
        }

        j = 0;
    }
    else
    {
        j = origPC+1;
    }

    for( let i=j; i<pc; i++ )
    {
        dis[i] = "";
    }

    return [pc, address, origPCMode];
}

function read_memory(mem, pc)
{
    if(mem[pc]==undefined){
        return 0;
    } else {
        return mem[pc];
    }
}

function write_memory(mem, address, value )
{
    mem[address&0xffff] = value;
}

function next_pc( pc, count ) {
    pc += count;
    pc &= 0xffff;
    return pc;
}

function index_decode( mem, pc, operand )
{
    let value = read_memory(mem, pc);
    pc = next_pc( pc, 1 );

    let register = reg[(value>>5)&3];

    if(value & 0x80)
    {
        switch( value & 0x1f )
        {
            case 0x00: operand += "," + register + "+"; break;
            case 0x01: operand += "," + register + "++"; break;
            case 0x02: operand += ",-" + register; break;
            case 0x03: operand += ",--" + register; break;
            case 0x04: operand += "," + register; break;
            case 0x05: operand += "b," + register; break;
            case 0x06: operand += "a," + register; break;

            case 0x08:
                value = read_memory(mem, pc);
                pc = next_pc( pc, 1 );
                operand += "$" + value.toString(16).padStart(2,"0") + "," + register;
                break;

            case 0x09:
                value = read_memory(mem, pc) << 8;
                pc = next_pc( pc, 1 );
                value += read_memory(mem, pc);
                pc = next_pc( pc, 1 );
                operand += "$" + value.toString(16).padStart(4,"0") + "," + register;
                break;

            case 0x0b: operand += "d," + register; break;

            case 0x0c:
                value = read_memory(mem, pc);
                pc = next_pc( pc, 1 );

                if(absIndPC)
                    operand += "<" + ((value << 24) >> 24) + ",pc";
                else
                    operand += "<" + generate_conditional_label(pc + ((value << 24) >> 24)) + ",pcr";
                break;

            case 0x0d:
                value = read_memory(mem, pc) << 8;
                pc = next_pc( pc, 1 );
                value += read_memory(mem, pc);
                pc = next_pc( pc, 1 );

                if(absIndPC)
                    operand += ">" + ((value << 16) >> 16) + ",pc";
                else
                    operand += ">" + generate_conditional_label(pc + ((value << 16) >> 16)) + ",pcr";
                break;

            case 0x11: operand += "[," + register + "++]"; break;

            case 0x13: operand += "[,--" + register + "]"; break;

            case 0x14: operand += "[," + register + "]"; break;

            case 0x15: operand += "[b," + register +"]"; break;

            case 0x16: operand += "[a," + register + "]"; break;

            case 0x18:
                value = read_memory(mem, pc);
                pc = next_pc( pc, 1 );
                operand += "[$" + value.toString(16).padStart(2,"0") + "," + register + "]";
                break;

            case 0x19:
            case 0x1d:
                value = read_memory(mem, pc) << 8;
                pc = next_pc( pc, 1 );
                value += read_memory(mem, pc);
                pc = next_pc( pc, 1 );
                if(absIndPC)
                    operand += ">[" + ((value << 16) >> 16) + ",pc]";
                else
                    operand += ">[" + generate_conditional_label(pc + ((value << 16) >> 16)) + ",pcr]";
                break;

            case 0x1b: operand += "[d," + register + "]"; break;

            case 0x1c:
                value = read_memory(mem, pc);
                pc = next_pc( pc, 1 );
                if(absIndPC)
                    operand += "[<" + ((value << 24) >> 24) + ",pc]";
                else
                    operand += "[<" + generate_conditional_label(pc + ((value << 24) >> 24)) + ",pcr]";
                break;

            case 0x07:
                if(allow_6309_codes)
                {
                    operand += "e," + register;
                } else {
                    operand += "???";
                }
                break;

            case 0x17:
                if(allow_6309_codes)
                {
                    operand += "[e," + register + "]";
                } else {
                    operand += "???";
                }
                break;

            case 0x0a:
                if(allow_6309_codes)
                {
                    operand += "f," + register;
                } else {
                    operand += "???";
                }
                break;

            case 0x1a:
                if(allow_6309_codes)
                {
                    operand += "[f," + register + "]";
                } else {
                    operand += "???";
                }
                break;

            case 0x0e:
                if(allow_6309_codes)
                {
                    operand += "w," + register;
                } else {
                    operand += "???";
                }
                break;

            case 0x1e:
                if(allow_6309_codes)
                {
                    operand += "[w," + register + "]";
                } else {
                    operand += "???";
                }
                break;

            default:
                if(value == 0x9f)
                {
                    value = read_memory(mem, pc) << 8;
                    pc = next_pc( pc, 1 );
                    value += read_memory(mem, pc);
                    pc = next_pc( pc, 1 );
                    operand += "[" + generate_conditional_label(value) + "]";
                }
                else if(allow_6309_codes)
                {
                    switch( value )
                    {
                        case 0x8f: operand += ",w"; break;
                        case 0x90: operand += "[,w]"; break;
                        case 0xaf:
                            value = read_memory(mem, pc) << 8;
                            pc = next_pc( pc, 1 );
                            value += read_memory(mem, pc);
                            pc = next_pc( pc, 1 );
                            operand += "$" + value.toString(16).padStart(2,"0") + ",w";
                            break;

                        case 0xb0:
                            value = read_memory(mem, pc) << 8;
                            pc = next_pc( pc, 1 );
                            value += read_memory(mem, pc);
                            pc = next_pc( pc, 1 );
                            operand += "[$" + value.toString(16).padStart(4,"0") + ",w]";
                            break;

                        case 0xcf: operand += ",w++"; break;
                        case 0xd0: operand += "[,w++]"; break;
                        case 0xef: operand += ",--w"; break;
                        case 0xf0: operand += "[,--w]"; break;
                        default:   operand += "???"; break;

                    }
                } else {
                    operand += "???"; break;
                }
        }
    }
    else
    {
        operand += off4[value&31] + "," + register;
    }

    return [pc, operand, value];
}

const opcodes_6809_p2 = [
// $00
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
// $10
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
// $20
["ill", "nom", "pc_nop"],
["lbrn", "rew", "pc_nop"],
["lbhi", "rew", "pc_bra"],
["lbls", "rew", "pc_bra"],
["lbcc", "rew", "pc_bra"],
["lbcs", "rew", "pc_bra"],
["lbne", "rew", "pc_bra"],
["lbeq", "rew", "pc_bra"],
["lbvc", "rew", "pc_bra"],
["lbvs", "rew", "pc_bra"],
["lbpl", "rew", "pc_bra"],
["lbmi", "rew", "pc_bra"],
["lbge", "rew", "pc_bra"],
["lblt", "rew", "pc_bra"],
["lbgt", "rew", "pc_bra"],
["lble", "rew", "pc_bra"],
// $30
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["swi2", "imp", "pc_nop"],
// $40
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
// $50
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
// $60
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
// $70
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
// $80
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["cmpd", "imw", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["cmpy", "imw", "pc_nop"],
["ill", "nom", "pc_nop"],
["ldy", "imw", "pc_nop"],
["ill", "nom", "pc_nop"],
// $90
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["cmpd", "dir", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["cmpy", "dir", "pc_nop"],
["ill", "nom", "pc_nop"],
["ldy", "dir", "pc_nop"],
["sty", "dir", "pc_nop"],
// $A0
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["cmpd", "ind", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["cmpy", "ind", "pc_nop"],
["ill", "nom", "pc_nop"],
["ldy", "ind", "pc_nop"],
["sty", "ind", "pc_nop"],
// $B0
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["cmpd", "ext", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["cmpy", "ext", "pc_nop"],
["ill", "nom", "pc_nop"],
["ldy", "ext", "pc_nop"],
["sty", "ext", "pc_nop"],
// $C0
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["lds", "imw", "pc_nop"],
["ill", "nom", "pc_nop"],
// $D0
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["lds", "dir", "pc_nop"],
["sts", "dir", "pc_nop"],
// $E0
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["lds", "ind", "pc_nop"],
["sts", "ind", "pc_nop"],
// $F0
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["lds", "ext", "pc_nop"],
["sts", "ext", "pc_nop"]
];

const opcodes_6809_p3 = [
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["swi3", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["cmpu", "imw", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["cmps", "imw", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["cmpu", "dir", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["cmps", "dir", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["cmpu", "ind", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["cmps", "ind", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["cmpu", "ext", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["cmps", "ext", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"]
];

const opcodes_6809_p1 = [
// $00
["neg", "dir", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["com", "dir", "pc_nop"],
["lsr", "dir", "pc_nop"],
["ill", "nom", "pc_nop"],
["ror", "dir", "pc_nop"],
["asr", "dir", "pc_nop"],
["asl", "dir", "pc_nop"],
["rol", "dir", "pc_nop"],
["dec", "dir", "pc_nop"],
["ill", "nom", "pc_nop"],
["inc", "dir", "pc_nop"],
["tst", "dir", "pc_nop"],
["jmp", "dir", "pc_jmp"],
["clr", "dir", "pc_nop"],
// $10
["ill", opcodes_6809_p2, "pc_nop"],
["ill", opcodes_6809_p3, "pc_nop"],
["nop", "imp", "pc_nop"],
["sync", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["lbra", "rew", "pc_jmp"],
["lbsr", "rew", "pc_bra"],
["ill", "nom", "pc_nop"],
["daa", "imp", "pc_nop"],
["orcc", "imb", "pc_nop"],
["ill", "nom", "pc_nop"],
["andcc", "imb", "pc_nop"],
["sex", "imp", "pc_nop"],
["exg", "r1", "pc_nop"],
["tfr", "r1", "pc_nop"],
// $20
["bra", "reb", "pc_jmp"],
["brn", "reb", "pc_nop"],
["bhi", "reb", "pc_bra"],
["bls", "reb", "pc_bra"],
["bcc", "reb", "pc_bra"],
["bcs", "reb", "pc_bra"],
["bne", "reb", "pc_bra"],
["beq", "reb", "pc_bra"],
["bvc", "reb", "pc_bra"],
["bvs", "reb", "pc_bra"],
["bpl", "reb", "pc_bra"],
["bmi", "reb", "pc_bra"],
["bge", "reb", "pc_bra"],
["blt", "reb", "pc_bra"],
["bgt", "reb", "pc_bra"],
["ble", "reb", "pc_bra"],
// $30
["leax", "ind", "pc_nop"],
["leay", "ind", "pc_nop"],
["leas", "ind", "pc_nop"],
["leau", "ind", "pc_nop"],
["pshs", "r2", "pc_nop"],
["puls", "r2", "pc_pul"],
["pshu", "r3", "pc_nop"],
["pulu", "r3", "pc_pul"],
["ill", "nom", "pc_nop"],
["rts", "imp", "pc_end"],
["abx", "imp", "pc_nop"],
["rti", "imp", "pc_ret"],
["cwai", "imb", "pc_nop"],
["mul", "imp", "pc_nop"],
["reset", "imp", "pc_nop"],
["swi", "imp", "pc_nop"],
// $40
["nega", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["coma", "imp", "pc_nop"],
["lsra", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["rora", "imp", "pc_nop"],
["asra", "imp", "pc_nop"],
["asla", "imp", "pc_nop"],
["rola", "imp", "pc_nop"],
["deca", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["inca", "imp", "pc_nop"],
["tsta", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["clra", "imp", "pc_nop"],
// $50
["negb", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["comb", "imp", "pc_nop"],
["lsrb", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["rorb", "imp", "pc_nop"],
["asrb", "imp", "pc_nop"],
["aslb", "imp", "pc_nop"],
["rolb", "imp", "pc_nop"],
["decb", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["incb", "imp", "pc_nop"],
["tstb", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["clrb", "imp", "pc_nop"],
// $60
["neg", "ind", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["com", "ind", "pc_nop"],
["lsr", "ind", "pc_nop"],
["ill", "nom", "pc_nop"],
["ror", "ind", "pc_nop"],
["asr", "ind", "pc_nop"],
["asl", "ind", "pc_nop"],
["rol", "ind", "pc_nop"],
["dec", "ind", "pc_nop"],
["ill", "nom", "pc_nop"],
["inc", "ind", "pc_nop"],
["tst", "ind", "pc_nop"],
["jmp", "ind", "pc_jmp"],
["clr", "ind", "pc_nop"],
// $70
["neg", "ext", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["com", "ext", "pc_nop"],
["lsr", "ext", "pc_nop"],
["ill", "nom", "pc_nop"],
["ror", "ext", "pc_nop"],
["asr", "ext", "pc_nop"],
["asl", "ext", "pc_nop"],
["rol", "ext", "pc_nop"],
["dec", "ext", "pc_nop"],
["ill", "nom", "pc_nop"],
["inc", "ext", "pc_nop"],
["tst", "ext", "pc_nop"],
["jmp", "ext", "pc_jmp"],
["clr", "ext", "pc_nop"],
// $80
["suba", "imb", "pc_nop"],
["cmpa", "imb", "pc_nop"],
["sbca", "imb", "pc_nop"],
["subd", "imw", "pc_nop"],
["anda", "imb", "pc_nop"],
["bita", "imb", "pc_nop"],
["lda", "imb", "pc_nop"],
["ill", "nom", "pc_nop"],
["eora", "imb", "pc_nop"],
["adca", "imb", "pc_nop"],
["ora", "imb", "pc_nop"],
["adda", "imb", "pc_nop"],
["cmpx", "imw", "pc_nop"],
["bsr", "reb", "pc_bra"],
["ldx", "imw", "pc_nop"],
["ill", "nom", "pc_nop"],
// $90
["suba", "dir", "pc_nop"],
["cmpa", "dir", "pc_nop"],
["sbca", "dir", "pc_nop"],
["subd", "dir", "pc_nop"],
["anda", "dir", "pc_nop"],
["bita", "dir", "pc_nop"],
["lda", "dir", "pc_nop"],
["sta", "dir", "pc_nop"],
["eora", "dir", "pc_nop"],
["adca", "dir", "pc_nop"],
["ora", "dir", "pc_nop"],
["adda", "dir", "pc_nop"],
["cmpx", "dir", "pc_nop"],
["jsr", "dir", "pc_bra"],
["ldx", "dir", "pc_nop"],
["stx", "dir", "pc_nop"],
// $A0
["suba", "ind", "pc_nop"],
["cmpa", "ind", "pc_nop"],
["sbca", "ind", "pc_nop"],
["subd", "ind", "pc_nop"],
["anda", "ind", "pc_nop"],
["bita", "ind", "pc_nop"],
["lda", "ind", "pc_nop"],
["sta", "ind", "pc_nop"],
["eora", "ind", "pc_nop"],
["adca", "ind", "pc_nop"],
["ora", "ind", "pc_nop"],
["adda", "ind", "pc_nop"],
["cmpx", "ind", "pc_nop"],
["jsr", "ind", "pc_bra"],
["ldx", "ind", "pc_nop"],
["stx", "ind", "pc_nop"],
// $B0
["suba", "ext", "pc_nop"],
["cmpa", "ext", "pc_nop"],
["sbca", "ext", "pc_nop"],
["subd", "ext", "pc_nop"],
["anda", "ext", "pc_nop"],
["bita", "ext", "pc_nop"],
["lda", "ext", "pc_nop"],
["sta", "ext", "pc_nop"],
["eora", "ext", "pc_nop"],
["adca", "ext", "pc_nop"],
["ora", "ext", "pc_nop"],
["adda", "ext", "pc_nop"],
["cmpx", "ext", "pc_nop"],
["jsr", "ext", "pc_bra"],
["ldx", "ext", "pc_nop"],
["stx", "ext", "pc_nop"],
// $C0
["subb", "imb", "pc_nop"],
["cmpb", "imb", "pc_nop"],
["sbcb", "imb", "pc_nop"],
["addd", "imw", "pc_nop"],
["andb", "imb", "pc_nop"],
["bitb", "imb", "pc_nop"],
["ldb", "imb", "pc_nop"],
["ill", "nom", "pc_nop"],
["eorb", "imb", "pc_nop"],
["adcb", "imb", "pc_nop"],
["orb", "imb", "pc_nop"],
["addb", "imb", "pc_nop"],
["ldd", "imw", "pc_nop"],
["ill", "nom", "pc_nop"],
["ldu", "imw", "pc_nop"],
["ill", "nom", "pc_nop"],
// $D0
["subb", "dir", "pc_nop"],
["cmpb", "dir", "pc_nop"],
["sbcb", "dir", "pc_nop"],
["addd", "dir", "pc_nop"],
["andb", "dir", "pc_nop"],
["bitb", "dir", "pc_nop"],
["ldb", "dir", "pc_nop"],
["stb", "dir", "pc_nop"],
["eorb", "dir", "pc_nop"],
["adcb", "dir", "pc_nop"],
["orb", "dir", "pc_nop"],
["addb", "dir", "pc_nop"],
["ldd", "dir", "pc_nop"],
["std", "dir", "pc_nop"],
["ldu", "dir", "pc_nop"],
["stu", "dir", "pc_nop"],
// $E0
["subb", "ind", "pc_nop"],
["cmpb", "ind", "pc_nop"],
["sbcb", "ind", "pc_nop"],
["addd", "ind", "pc_nop"],
["andb", "ind", "pc_nop"],
["bitb", "ind", "pc_nop"],
["ldb", "ind", "pc_nop"],
["stb", "ind", "pc_nop"],
["eorb", "ind", "pc_nop"],
["adcb", "ind", "pc_nop"],
["orb", "ind", "pc_nop"],
["addb", "ind", "pc_nop"],
["ldd", "ind", "pc_nop"],
["std", "ind", "pc_nop"],
["ldu", "ind", "pc_nop"],
["stu", "ind", "pc_nop"],
// $F0
["subb", "ext", "pc_nop"],
["cmpb", "ext", "pc_nop"],
["sbcb", "ext", "pc_nop"],
["addd", "ext", "pc_nop"],
["andb", "ext", "pc_nop"],
["bitb", "ext", "pc_nop"],
["ldb", "ext", "pc_nop"],
["stb", "ext", "pc_nop"],
["eorb", "ext", "pc_nop"],
["adcb", "ext", "pc_nop"],
["orb", "ext", "pc_nop"],
["addb", "ext", "pc_nop"],
["ldd", "ext", "pc_nop"],
["std", "ext", "pc_nop"],
["ldu", "ext", "pc_nop"],
["stu", "ext", "pc_nop"]
];

const opcodes_6309_p2 = [
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["lbrn", "rew", "pc_nop"],
["lbhi", "rew", "pc_bra"],
["lbls", "rew", "pc_bra"],
["lbcc", "rew", "pc_bra"],
["lbcs", "rew", "pc_bra"],
["lbne", "rew", "pc_bra"],
["lbeq", "rew", "pc_bra"],
["lbvc", "rew", "pc_bra"],
["lbvs", "rew", "pc_bra"],
["lbpl", "rew", "pc_bra"],
["lbmi", "rew", "pc_bra"],
["lbge", "rew", "pc_bra"],
["lblt", "rew", "pc_bra"],
["lbgt", "rew", "pc_bra"],
["lble", "rew", "pc_bra"],
["addr", "r1", "pc_nop"],
["adcr", "r1", "pc_nop"],
["subr", "r1", "pc_nop"],
["sbcr", "r1", "pc_nop"],
["andr", "r1", "pc_nop"],
["orr", "r1", "pc_nop"],
["eorr", "r1", "pc_nop"],
["cmpr", "r1", "pc_nop"],
["pshsw", "imp", "pc_nop"],
["pulsw", "imp", "pc_nop"],
["pshuw", "imp", "pc_nop"],
["puluw", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["swi2", "imp", "pc_nop"],
["negd", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["comd", "imp", "pc_nop"],
["lsrd", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["rord", "imp", "pc_nop"],
["asrd", "imp", "pc_nop"],
["asld", "imp", "pc_nop"],
["rold", "imp", "pc_nop"],
["decd", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["incd", "imp", "pc_nop"],
["tstd", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["clrd", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["comw", "imp", "pc_nop"],
["lsrw", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["rorw", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["rolw", "imp", "pc_nop"],
["decw", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["incw", "imp", "pc_nop"],
["tstw", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["clrw", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["subw", "imw", "pc_nop"],
["cmpw", "imw", "pc_nop"],
["sbcd", "imw", "pc_nop"],
["cmpd", "imw", "pc_nop"],
["andd", "imw", "pc_nop"],
["bitd", "imw", "pc_nop"],
["ldw", "imw", "pc_nop"],
["ill", "nom", "pc_nop"],
["eord", "imw", "pc_nop"],
["adcd", "imw", "pc_nop"],
["ord", "imw", "pc_nop"],
["addw", "imw", "pc_nop"],
["cmpy", "imw", "pc_nop"],
["ill", "nom", "pc_nop"],
["ldy", "imw", "pc_nop"],
["ill", "nom", "pc_nop"],
["subw", "dir", "pc_nop"],
["cmpw", "dir", "pc_nop"],
["sbcd", "dir", "pc_nop"],
["cmpd", "dir", "pc_nop"],
["andd", "dir", "pc_nop"],
["bitd", "dir", "pc_nop"],
["ldw", "dir", "pc_nop"],
["stw", "dir", "pc_nop"],
["eord", "dir", "pc_nop"],
["adcd", "dir", "pc_nop"],
["ord", "dir", "pc_nop"],
["addw", "dir", "pc_nop"],
["cmpy", "dir", "pc_nop"],
["ill", "nom", "pc_nop"],
["ldy", "dir", "pc_nop"],
["sty", "dir", "pc_nop"],
["subw", "ind", "pc_nop"],
["cmpw", "ind", "pc_nop"],
["sbcd", "ind", "pc_nop"],
["cmpd", "ind", "pc_nop"],
["andd", "ind", "pc_nop"],
["bitd", "ind", "pc_nop"],
["ldw", "ind", "pc_nop"],
["stw", "ind", "pc_nop"],
["eord", "ind", "pc_nop"],
["adcd", "ind", "pc_nop"],
["ord", "ind", "pc_nop"],
["addw", "ind", "pc_nop"],
["cmpy", "ind", "pc_nop"],
["ill", "nom", "pc_nop"],
["ldy", "ind", "pc_nop"],
["sty", "ind", "pc_nop"],
["subw", "ext", "pc_nop"],
["cmpw", "ext", "pc_nop"],
["sbcd", "ext", "pc_nop"],
["cmpd", "ext", "pc_nop"],
["andd", "ext", "pc_nop"],
["bitd", "ext", "pc_nop"],
["ldw", "ext", "pc_nop"],
["stw", "ext", "pc_nop"],
["eord", "ext", "pc_nop"],
["adcd", "ext", "pc_nop"],
["ord", "ext", "pc_nop"],
["addw", "ext", "pc_nop"],
["cmpy", "ext", "pc_nop"],
["ill", "nom", "pc_nop"],
["ldy", "ext", "pc_nop"],
["sty", "ext", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["lds", "imw", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ldq", "dir", "pc_nop"],
["stq", "dir", "pc_nop"],
["lds", "dir", "pc_nop"],
["sts", "dir", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ldq", "ind", "pc_nop"],
["stq", "ind", "pc_nop"],
["lds", "ind", "pc_nop"],
["sts", "ind", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ldq", "ext", "pc_nop"],
["stq", "ext", "pc_nop"],
["lds", "ext", "pc_nop"],
["sts", "ext", "pc_nop"]
];

const opcodes_6309_p3 = [
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["band", "bt", "pc_nop"],
["biand", "bt", "pc_nop"],
["bor", "bt", "pc_nop"],
["bior", "bt", "pc_nop"],
["beor", "bt", "pc_nop"],
["bieor", "bt", "pc_nop"],
["ldbt", "bt", "pc_nop"],
["stbt", "bt", "pc_nop"],
["tfm", "t1", "pc_nop"],
["tfm", "t2", "pc_nop"],
["tfm", "t3", "pc_nop"],
["tfm", "t4", "pc_nop"],
["bitmd", "imb", "pc_nop"],
["ldmd", "imb", "pc_nop"],
["ill", "nom", "pc_nop"],
["swi3", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["come", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["dece", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["ince", "imp", "pc_nop"],
["tste", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["clre", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["comf", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["decf", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["incf", "imp", "pc_nop"],
["tstf", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["clrf", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["sube", "imb", "pc_nop"],
["cmpe", "imb", "pc_nop"],
["ill", "nom", "pc_nop"],
["cmpu", "imw", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["lde", "imb", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["adde", "imb", "pc_nop"],
["cmps", "imw", "pc_nop"],
["divd", "imb", "pc_nop"],
["divq", "imw", "pc_nop"],
["muld", "imw", "pc_nop"],
["sube", "dir", "pc_nop"],
["cmpe", "dir", "pc_nop"],
["ill", "nom", "pc_nop"],
["cmpu", "dir", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["lde", "dir", "pc_nop"],
["ste", "dir", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["adde", "dir", "pc_nop"],
["cmps", "dir", "pc_nop"],
["divd", "dir", "pc_nop"],
["divq", "dir", "pc_nop"],
["muld", "dir", "pc_nop"],
["sube", "ind", "pc_nop"],
["cmpe", "ind", "pc_nop"],
["ill", "nom", "pc_nop"],
["cmpu", "ind", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["lde", "ind", "pc_nop"],
["ste", "ind", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["adde", "ind", "pc_nop"],
["cmps", "ind", "pc_nop"],
["divd", "ind", "pc_nop"],
["divq", "ind", "pc_nop"],
["muld", "ind", "pc_nop"],
["sube", "ext", "pc_nop"],
["cmpe", "ext", "pc_nop"],
["ill", "nom", "pc_nop"],
["cmpu", "ext", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["lde", "ext", "pc_nop"],
["ste", "ext", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["adde", "ext", "pc_nop"],
["cmps", "ext", "pc_nop"],
["divd", "ext", "pc_nop"],
["divq", "ext", "pc_nop"],
["muld", "ext", "pc_nop"],
["subf", "imb", "pc_nop"],
["cmpf", "imb", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ldf", "imb", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["addf", "imb", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["subf", "dir", "pc_nop"],
["cmpf", "dir", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ldf", "dir", "pc_nop"],
["stf", "dir", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["addf", "dir", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["subf", "ind", "pc_nop"],
["cmpf", "ind", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ldf", "ind", "pc_nop"],
["stf", "ind", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["addf", "ind", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["subf", "ext", "pc_nop"],
["cmpf", "ext", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ldf", "ext", "pc_nop"],
["stf", "ext", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["addf", "ext", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"]
];

const opcodes_6309_p1 = [
["neg", "dir", "pc_nop"],
["oim", "bd", "pc_nop"],
["aim", "bd", "pc_nop"],
["com", "dir", "pc_nop"],
["lsr", "dir", "pc_nop"],
["eim", "bd", "pc_nop"],
["ror", "dir", "pc_nop"],
["asr", "dir", "pc_nop"],
["asl", "dir", "pc_nop"],
["rol", "dir", "pc_nop"],
["dec", "dir", "pc_nop"],
["tim", "bd", "pc_nop"],
["inc", "dir", "pc_nop"],
["tst", "dir", "pc_nop"],
["jmp", "dir", "pc_jmp"],
["clr", "dir", "pc_nop"],
// $10
["ill", opcodes_6309_p2, "pc_nop"],
["ill", opcodes_6309_p3, "pc_nop"],
["nop", "imp", "pc_nop"],
["sync", "imp", "pc_nop"],
["sexw", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["lbra", "rew", "pc_jmp"],
["lbsr", "rew", "pc_bra"],
["ill", "nom", "pc_nop"],
["daa", "imp", "pc_nop"],
["orcc", "imb", "pc_nop"],
["ill", "nom", "pc_nop"],
["andcc", "imb", "pc_nop"],
["sex", "imp", "pc_nop"],
["exg", "r1", "pc_nop"],
["tfr", "r1", "pc_nop"],
["bra", "reb", "pc_jmp"],
["brn", "reb", "pc_nop"],
["bhi", "reb", "pc_bra"],
["bls", "reb", "pc_bra"],
["bcc", "reb", "pc_bra"],
["bcs", "reb", "pc_bra"],
["bne", "reb", "pc_bra"],
["beq", "reb", "pc_bra"],
["bvc", "reb", "pc_bra"],
["bvs", "reb", "pc_bra"],
["bpl", "reb", "pc_bra"],
["bmi", "reb", "pc_bra"],
["bge", "reb", "pc_bra"],
["blt", "reb", "pc_bra"],
["bgt", "reb", "pc_bra"],
["ble", "reb", "pc_bra"],
["leax", "ind", "pc_nop"],
["leay", "ind", "pc_nop"],
["leas", "ind", "pc_nop"],
["leau", "ind", "pc_nop"],
["pshs", "r2", "pc_nop"],
["puls", "r2", "pc_pul"],
["pshu", "r3", "pc_nop"],
["pulu", "r3", "pc_nop"],
["ill", "nom", "pc_nop"],
["rts", "imp", "pc_end"],
["abx", "imp", "pc_nop"],
["rti", "imp", "pc_ret"],
["cwai", "imb", "pc_nop"],
["mul", "imp", "pc_nop"],
["reset", "imp", "pc_nop"],
["swi", "imp", "pc_nop"],
["nega", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["coma", "imp", "pc_nop"],
["lsra", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["rora", "imp", "pc_nop"],
["asra", "imp", "pc_nop"],
["asla", "imp", "pc_nop"],
["rola", "imp", "pc_nop"],
["deca", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["inca", "imp", "pc_nop"],
["tsta", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["clra", "imp", "pc_nop"],
["negb", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["ill", "nom", "pc_nop"],
["comb", "imp", "pc_nop"],
["lsrb", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["rorb", "imp", "pc_nop"],
["asrb", "imp", "pc_nop"],
["aslb", "imp", "pc_nop"],
["rolb", "imp", "pc_nop"],
["decb", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["incb", "imp", "pc_nop"],
["tstb", "imp", "pc_nop"],
["ill", "nom", "pc_nop"],
["clrb", "imp", "pc_nop"],
["neg", "ind", "pc_nop"],
["oim", "bi", "pc_nop"],
["aim", "bi", "pc_nop"],
["com", "ind", "pc_nop"],
["lsr", "ind", "pc_nop"],
["eim", "bi", "pc_nop"],
["ror", "ind", "pc_nop"],
["asr", "ind", "pc_nop"],
["asl", "ind", "pc_nop"],
["rol", "ind", "pc_nop"],
["dec", "ind", "pc_nop"],
["tim", "bi", "pc_nop"],
["inc", "ind", "pc_nop"],
["tst", "ind", "pc_nop"],
["jmp", "ind", "pc_jmp"],
["clr", "ind", "pc_nop"],
["neg", "ext", "pc_nop"],
["oim", "be", "pc_nop"],
["aim", "be", "pc_nop"],
["com", "ext", "pc_nop"],
["lsr", "ext", "pc_nop"],
["eim", "be", "pc_nop"],
["ror", "ext", "pc_nop"],
["asr", "ext", "pc_nop"],
["asl", "ext", "pc_nop"],
["rol", "ext", "pc_nop"],
["dec", "ext", "pc_nop"],
["tim", "be", "pc_nop"],
["inc", "ext", "pc_nop"],
["tst", "ext", "pc_nop"],
["jmp", "ext", "pc_jmp"],
["clr", "ext", "pc_nop"],
["suba", "imb", "pc_nop"],
["cmpa", "imb", "pc_nop"],
["sbca", "imb", "pc_nop"],
["subd", "imw", "pc_nop"],
["anda", "imb", "pc_nop"],
["bita", "imb", "pc_nop"],
["lda", "imb", "pc_nop"],
["ill", "nom", "pc_nop"],
["eora", "imb", "pc_nop"],
["adca", "imb", "pc_nop"],
["ora", "imb", "pc_nop"],
["adda", "imb", "pc_nop"],
["cmpx", "imw", "pc_nop"],
["bsr", "reb", "pc_bra"],
["ldx", "imw", "pc_nop"],
["ill", "nom", "pc_nop"],
["suba", "dir", "pc_nop"],
["cmpa", "dir", "pc_nop"],
["sbca", "dir", "pc_nop"],
["subd", "dir", "pc_nop"],
["anda", "dir", "pc_nop"],
["bita", "dir", "pc_nop"],
["lda", "dir", "pc_nop"],
["sta", "dir", "pc_nop"],
["eora", "dir", "pc_nop"],
["adca", "dir", "pc_nop"],
["ora", "dir", "pc_nop"],
["adda", "dir", "pc_nop"],
["cmpx", "dir", "pc_nop"],
["jsr", "dir", "pc_bra"],
["ldx", "dir", "pc_nop"],
["stx", "dir", "pc_nop"],
["suba", "ind", "pc_nop"],
["cmpa", "ind", "pc_nop"],
["sbca", "ind", "pc_nop"],
["subd", "ind", "pc_nop"],
["anda", "ind", "pc_nop"],
["bita", "ind", "pc_nop"],
["lda", "ind", "pc_nop"],
["sta", "ind", "pc_nop"],
["eora", "ind", "pc_nop"],
["adca", "ind", "pc_nop"],
["ora", "ind", "pc_nop"],
["adda", "ind", "pc_nop"],
["cmpx", "ind", "pc_nop"],
["jsr", "ind", "pc_bra"],
["ldx", "ind", "pc_nop"],
["stx", "ind", "pc_nop"],
["suba", "ext", "pc_nop"],
["cmpa", "ext", "pc_nop"],
["sbca", "ext", "pc_nop"],
["subd", "ext", "pc_nop"],
["anda", "ext", "pc_nop"],
["bita", "ext", "pc_nop"],
["lda", "ext", "pc_nop"],
["sta", "ext", "pc_nop"],
["eora", "ext", "pc_nop"],
["adca", "ext", "pc_nop"],
["ora", "ext", "pc_nop"],
["adda", "ext", "pc_nop"],
["cmpx", "ext", "pc_nop"],
["jsr", "ext", "pc_bra"],
["ldx", "ext", "pc_nop"],
["stx", "ext", "pc_nop"],
["subb", "imb", "pc_nop"],
["cmpb", "imb", "pc_nop"],
["sbcb", "imb", "pc_nop"],
["addd", "imw", "pc_nop"],
["andb", "imb", "pc_nop"],
["bitb", "imb", "pc_nop"],
["ldb", "imb", "pc_nop"],
["ill", "nom", "pc_nop"],
["eorb", "imb", "pc_nop"],
["adcb", "imb", "pc_nop"],
["orb", "imb", "pc_nop"],
["addb", "imb", "pc_nop"],
["ldd", "imw", "pc_nop"],
["ldq", "iml", "pc_nop"],
["ldu", "imw", "pc_nop"],
["ill", "nom", "pc_nop"],
["subb", "dir", "pc_nop"],
["cmpb", "dir", "pc_nop"],
["sbcb", "dir", "pc_nop"],
["addd", "dir", "pc_nop"],
["andb", "dir", "pc_nop"],
["bitb", "dir", "pc_nop"],
["ldb", "dir", "pc_nop"],
["stb", "dir", "pc_nop"],
["eorb", "dir", "pc_nop"],
["adcb", "dir", "pc_nop"],
["orb", "dir", "pc_nop"],
["addb", "dir", "pc_nop"],
["ldd", "dir", "pc_nop"],
["std", "dir", "pc_nop"],
["ldu", "dir", "pc_nop"],
["stu", "dir", "pc_nop"],
["subb", "ind", "pc_nop"],
["cmpb", "ind", "pc_nop"],
["sbcb", "ind", "pc_nop"],
["addd", "ind", "pc_nop"],
["andb", "ind", "pc_nop"],
["bitb", "ind", "pc_nop"],
["ldb", "ind", "pc_nop"],
["stb", "ind", "pc_nop"],
["eorb", "ind", "pc_nop"],
["adcb", "ind", "pc_nop"],
["orb", "ind", "pc_nop"],
["addb", "ind", "pc_nop"],
["ldd", "ind", "pc_nop"],
["std", "ind", "pc_nop"],
["ldu", "ind", "pc_nop"],
["stu", "ind", "pc_nop"],
["subb", "ext", "pc_nop"],
["cmpb", "ext", "pc_nop"],
["sbcb", "ext", "pc_nop"],
["addd", "ext", "pc_nop"],
["andb", "ext", "pc_nop"],
["bitb", "ext", "pc_nop"],
["ldb", "ext", "pc_nop"],
["stb", "ext", "pc_nop"],
["eorb", "ext", "pc_nop"],
["adcb", "ext", "pc_nop"],
["orb", "ext", "pc_nop"],
["addb", "ext", "pc_nop"],
["ldd", "ext", "pc_nop"],
["std", "ext", "pc_nop"],
["ldu", "ext", "pc_nop"],
["stu", "ext", "pc_nop"]
];
