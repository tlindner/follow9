# Using follow9 from an agent

Run `node follow9-cli.js --help` for flags or `node follow9-cli.js --describe`
for JSON describing the configuration. Requires Node.js 18 or later; no npm
installation, browser, server, or network connection is required.

## Disassemble a binary

```sh
node follow9-cli.js --offset '0x4000' --entry '0x4000' --json program.bin
node follow9-cli.js --file-type decb --json program.bin
node follow9-cli.js --file-type os9 --os9-swi2 --json module.bin
cat program.bin | node follow9-cli.js --offset '0x4000' --entry '0x4000' --json -
```

Output goes to stdout. With `--json`, the result is one JSON object with:

- `disassembly`: the assembly listing, with LF line endings.
- `config`: the configuration used, including defaults and overrides.

Without `--json`, stdout contains only the assembly listing. Failures write a
message to stderr, leave stdout empty, and exit with status 1. Success exits 0.
Use shell redirection to save output. For filenames starting with `--`, put `--`
before the filename. Input files and configurations are read, never modified.

For raw files, specify the load address using `--offset` and code entry points
using `--entry`. Without entry points, raw bytes are emitted as data. DECB and
OS-9 inputs supply execution addresses from their headers. Additional entry
points can be supplied with `--entry '0x4000,0x4100'` or repeated `--entry` flags.
Addresses refer to loaded memory, after applying the offset. Memory addresses
wrap at 64 KiB, matching the webpage. Raw and OS-9 files larger than 64 KiB are
rejected; DECB can contain multiple records.

## Reuse a webpage configuration

Save the JSON object from the webpage's “Include configuration in output” option
as `config.json`, then run:

```sh
node follow9-cli.js --config config.json --json program.bin
```

The JSON file must contain only the configuration object, without the listing.
CLI flags override saved settings. `--entry` appends to the configured
`transferList`. Unknown configuration keys and invalid option types are errors.

Example configuration:

```json
{
    "file_type": "raw",
    "offset": "$4000",
    "transferList": "$4000,$4100",
    "transferTable": "$4200;16",
    "fccList": "$4300;12",
    "noFollow": "$ff00",
    "labelList": "start equ $4000\nPOLCAT equ $a000",
    "hd6309": false,
    "listOpcodes": true,
    "printAddress": true,
    "genLabel": true
}
```

Configuration keys match the webpage:

| Key | Type / syntax | Default |
| --- | --- | --- |
| `file_type` | `"raw"`, `"decb"`, or `"os9"` | `"raw"` |
| `offset` | Address string or integer | `"0"` |
| `transferList` | Comma-separated entry addresses | `""` |
| `transferTable` | Comma-separated `address;byteLength` pairs; even lengths | `""` |
| `tokenTable` | `address;byteLength` pairs; length covers token bytes, followed by two-byte addresses | `""` |
| `fcsList` | Comma-separated addresses of high-bit-terminated strings | `""` |
| `fczList` | Comma-separated addresses of zero-terminated strings | `""` |
| `fccList` | `address;byteLength` pairs for fixed-length strings | `""` |
| `noFollow` | Comma-separated addresses to stop following | `""` |
| `labelList` | Newline-separated assembler equates | `""` |
| `hd6309`, `allCaps`, `absIndPC`, `hexOffset`, `os9SWI2` | Boolean | `false` |
| `listOpcodes`, `printAddress`, `genLabel` | Boolean | `true` |
| `colorBasicSkips` | Recognize overlapping Color BASIC skip instructions | `false` |
| `json` | Append saved configuration JSON to the assembly listing | `false` |

Numbers in strings accept decimal, `$hex`, or `0xhex`, in the range 0–65535.
Quote shell arguments containing `$` or `;`. Table/string ranges must fit within
memory. The configuration key `json` retains its webpage meaning; the CLI flag
`--json` controls the structured output envelope independently.

## JavaScript API

```js
const fs = require("node:fs");
const {disassembleBytes, defaultConfig} = require("./follow9.js");

const listing = disassembleBytes(fs.readFileSync("program.bin"), {
    offset: "$4000",
    transferList: "$4000",
    hd6309: false
});
```

`disassembleBytes(data, options)` accepts an `ArrayBuffer`, `Uint8Array`, or Node
`Buffer`, and returns a listing string. Options use the configuration keys above;
missing options use `defaultConfig`. Errors throw. Calls are synchronous and
reset decoder state on each invocation. The API preserves the webpage's original
CR line separators; the CLI normalizes them to LF.
