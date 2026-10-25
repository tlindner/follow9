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
