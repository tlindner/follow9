# follow9
6x09 JavaScript Disassembler

Browser based dissembler that will follow the code to route around data segments.

Feel free to copy these files locally, or host them on your own website.

http://www.macmess.org/follow9.html

http://tlindner.macmess.org/

## Command line and agents

Requires Node.js 18 or newer. No packages need to be installed.

```sh
node follow9-cli.js --offset '$4000' --entry '$4000' program.bin
node follow9-cli.js --file-type decb --json program.bin
node follow9-cli.js --config config.json --json program.bin
node follow9-cli.js --help
```

The CLI uses the same decoder as the webpage. It supports raw, DECB, and OS-9
binaries, HD6309 opcodes, code following, labels, jump/token tables, and strings.
Use `--json` for a machine-readable result and `--describe` to discover the
configuration defaults and argument syntax. See [AGENT_USAGE.md](AGENT_USAGE.md)
for the complete agent interface.

Run the automated tests with `npm test` or `node --test tests/agent.test.js`.

Enable **Recognize Color BASIC skip idioms** (CLI: `--color-basic-skips`,
configuration: `colorBasicSkips`) to emit `FCB SKP1`, `FCB SKP2`, and `FCB SKP1LD`
with their equates. Recognition requires a followed alternate entry immediately
past the opcode, containing a one-byte instruction for SKP1/SKP1LD or a two-byte
instruction for SKP2. Branch targets and explicit entry points supply these
entries. The option defaults to off; ordinary immediate instructions remain
unchanged when no alternate entry is followed. The two-byte `TST` ($7D) and
`LDX #` ($8E) skip forms are emitted as numeric `FCB` directives.

For Color BASIC 1.3, see [the example configuration](examples/color-basic-1.3.json).
Its keyword strings and dispatch addresses occupy separate regions; do not use
`$AA66;170` as a token table. Use the example's FCS strings and transfer tables.
Explicit entry points include copied RAM routines, interrupt handlers, and code
reached through return-address adjustments that code following cannot infer.

The [Extended Color BASIC 1.1 configuration](examples/extended-basic-1.1.json)
provides the corresponding tables and reference-confirmed entry points for
`extbas11.rom`.
