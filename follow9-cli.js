#!/usr/bin/env node
// Copyright 2026 by tim lindner. See LICENSE.md.
const fs = require("node:fs");
const {disassembleBytes, defaultConfig} = require("./follow9.js");

const help = `Usage: node follow9-cli.js [options] FILE

Disassemble 6809/HD6309 binaries without a browser. Use FILE - for binary stdin.
Assembly goes to stdout; errors go to stderr with exit status 1.

  --file-type raw|decb|os9    Input format (default: raw)
  --offset ADDRESS          Load offset (default: 0)
  --entry ADDRESSES          Entry points, comma separated; repeatable
  --config FILE             Read a JSON configuration saved by the webpage
  --json                    Emit {disassembly, config} as JSON
  --describe                Emit configuration defaults and syntax as JSON
  --help                    Show this help

All webpage settings are available through --config. Additional flags:
  --transfer-list LIST       Same as --entry
  --transfer-table RANGES    Jump tables: address;byteLength,...
  --token-table RANGES       Token tables: address;tokenByteLength,...
  --fcs-list LIST            High-bit-terminated strings: address,...
  --fcz-list LIST            Zero-terminated strings: address,...
  --fcc-list RANGES          Fixed-length strings: address;byteLength,...
  --no-follow LIST           Addresses to exclude from code following
  --label-list TEXT          Assembler equates, e.g. 'start equ $4000'
  --hd6309 --all-caps --list-opcodes --print-address --gen-label
  --abs-ind-pc --hex-offset --os9-swi2
Boolean flags accept a --no- prefix (e.g. --no-list-opcodes).
Numbers accept decimal, $hex, or 0xhex. Quote shell arguments containing $ or ;.
Raw files need explicit entry points to decode code; otherwise they emit data.
DECB and OS-9 files supply entry points from their headers.
`;

function main(args)
{
    const names = {
        "file-type": "file_type", offset: "offset", "transfer-list": "transferList",
        "transfer-table": "transferTable", "token-table": "tokenTable",
        "fcs-list": "fcsList", "fcz-list": "fczList", "fcc-list": "fccList",
        "no-follow": "noFollow", "label-list": "labelList", hd6309: "hd6309",
        "all-caps": "allCaps", "list-opcodes": "listOpcodes", "print-address": "printAddress",
        "gen-label": "genLabel", "abs-ind-pc": "absIndPC", "hex-offset": "hexOffset", "os9-swi2": "os9SWI2"
    };
    let file, configFile, json = false, positional = false;
    const overrides = {};
    const entries = [];
    for(let i = 0; i < args.length; i++)
    {
        const arg = args[i];
        if(!positional && arg == "--") { positional = true; continue; }
        if(!positional && arg.startsWith("--"))
        {
            const name = arg.slice(2);
            if(name == "help") { process.stdout.write(help); return; }
            if(name == "describe")
            {
                process.stdout.write(JSON.stringify({
                    defaults: defaultConfig,
                    numbers: "Decimal, $hex, or 0xhex; addresses and lengths are 0..65535",
                    lists: "Comma-separated addresses",
                    ranges: "Comma-separated address;byteLength pairs",
                    rawEntryPoints: "Set transferList to follow code; empty means data only",
                    result: "--json emits {disassembly: string, config: object}",
                    usage: help
                }, null, 2) + "\n");
                return;
            }
            if(name == "json") { json = true; continue; }
            if(name == "config" || name == "entry" || Object.hasOwn(names, name) && typeof defaultConfig[names[name]] == "string")
            {
                if(i + 1 == args.length || args[i + 1].startsWith("--"))
                    throw new Error("Missing value for " + arg);
                const value = args[++i];
                if(name == "config") configFile = value;
                else if(name == "entry") entries.push(value);
                else overrides[names[name]] = value;
                continue;
            }
            const positive = Object.hasOwn(names, name) ? name : name.replace(/^no-/, "");
            if(Object.hasOwn(names, positive) && typeof defaultConfig[names[positive]] == "boolean")
            {
                overrides[names[positive]] = positive == name;
                continue;
            }
            throw new Error("Unknown option: " + arg);
        }
        if(file !== undefined) throw new Error("Expected one input file.");
        file = arg;
    }
    if(file === undefined) throw new Error("An input file is required. Use --help for usage.");
    const saved = configFile === undefined ? {} : JSON.parse(fs.readFileSync(configFile, "utf8"));
    if(!saved || typeof saved != "object" || Array.isArray(saved))
        throw new Error("Configuration must be an object.");
    const config = {...defaultConfig, ...saved, ...overrides};
    if(entries.length)
        config.transferList = [config.transferList, ...entries].filter(value => value !== "").join(",");
    const data = fs.readFileSync(file == "-" ? 0 : file);
    const disassembly = disassembleBytes(data, config).replace(/\r\n?/g, "\n");
    process.stdout.write(json ? JSON.stringify({disassembly, config}) + "\n" : disassembly);
}

try
{
    main(process.argv.slice(2));
}
catch(error)
{
    process.stderr.write("follow9: " + error.message + "\n");
    process.exitCode = 1;
}
