const assert = require("node:assert/strict");
const {test} = require("node:test");
const {fork} = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {disassembleBytes, defaultConfig} = require("../follow9.js");
const root = path.resolve(__dirname, "..");
const code = Buffer.from([0x20, 2, 0x41, 0x42, 0x86, 0x54, 0x39]);
const config = {offset: "$4000", transferList: "$4000"};

function cli(args, input = Buffer.alloc(0))
{
    return new Promise((resolve, reject) =>
    {
        const child = fork(path.join(root, "follow9-cli.js"), args, {silent: true});
        let stdout = "", stderr = "";
        child.stdout.on("data", data => stdout += data);
        child.stderr.on("data", data => stderr += data);
        child.on("error", reject);
        child.on("close", status => resolve({status, stdout, stderr}));
        child.stdin.on("error", error => { if(error.code != "EPIPE") reject(error); });
        child.stdin.end(input);
    });
}

test("follows branches around embedded data and resets options on repeated calls", () =>
{
    const output = disassembleBytes(code, config);
    assert.match(output, /4000 2002\s+bra\s+L4004/);
    assert.match(output, /4002\s+fcb\s+\$41,\$42/);
    assert.match(output, /4004 8654\s+lda\s+#\$54/);
    assert.match(output, /4006 39\s+rts/);
    assert.match(disassembleBytes(code, {...config, allCaps: true}), /LDA/);
    assert.equal(disassembleBytes(code, config), output);
    assert.doesNotMatch(disassembleBytes(code, {offset: 16384}), /\slda\s/);
    // Buffer slices must not expose bytes outside the view.
    assert.equal(disassembleBytes(Buffer.concat([Buffer.from([0]), code]).subarray(1), config), output);
});

test("DECB execution address and OS-9 module entry points", () =>
{
    const decb = Buffer.from([0, 0, 3, 0x40, 0, 0x86, 0x42, 0x39, 255, 0, 0, 0x40, 0]);
    assert.match(disassembleBytes(decb, {file_type: "decb"}), /4000 8642\s+lda/);
    const os9 = Buffer.from([0x87, 0xcd, 0, 14, 0, 0, 0x11, 0, 0, 0, 11, 0x86, 0x42, 0x39]);
    assert.match(disassembleBytes(os9, {file_type: "os9"}), /000b 8642\s+lda/);
    assert.match(disassembleBytes(Buffer.from([255, 0, 0, 0x40, 0]), {file_type: "decb"}), /end/);
    const emptyBlock = Buffer.concat([Buffer.from([0, 0, 0, 0, 0]), decb]);
    assert.equal(disassembleBytes(emptyBlock, {file_type: "decb"}), disassembleBytes(decb, {file_type: "decb"}));
});

test("HD6309 and data annotations", () =>
{
    assert.match(disassembleBytes(Buffer.from([0x11, 0x86, 0x42, 0x39]), {hd6309: true, transferList: "0"}), /lde\s+#\$42/);
    const strings = Buffer.from([0x41, 0xc2, 0x43, 0, 0x44, 0x45]);
    const output = disassembleBytes(strings, {fcsList: "0", fczList: "2", fccList: "4;2"});
    assert.match(output, /fcs\s+"AB"/);
    assert.match(output, /fcz\s+"C"/);
    assert.match(output, /fcc\s+"DE"/);
    const tokens = Buffer.from([0xc1, 0, 3, 0x39]);
    assert.match(disassembleBytes(tokens, {tokenTable: "0;1"}), /L0003_A/);
    assert.match(disassembleBytes(tokens, {tokenTable: "0;1"}), /0003 39\s+rts/);
    const jumps = Buffer.from([0, 2, 0x39]);
    assert.match(disassembleBytes(jumps, {transferTable: "0;2"}), /0002 39\s+rts/);
    assert.match(disassembleBytes(code, {...config, noFollow: "$4004"}), /fcb/);
    assert.doesNotMatch(disassembleBytes(code, {...config, noFollow: "$4004"}), /\slda\s/);
    assert.match(disassembleBytes(code, {...config, labelList: "start equ $4000"}), /start/);
});

test("rejects invalid configuration and malformed input", () =>
{
    for(const options of [{offset: "garbage"}, {offset: 65536}, {hd6309: "yes"}, {transferList: "1,"}, {transferTable: "0;3"}, {fccList: "65535;2"}, {unknown: true}])
        assert.throws(() => disassembleBytes(code, options));
    assert.throws(() => disassembleBytes(Buffer.alloc(0)), /empty/);
    assert.throws(() => disassembleBytes(Buffer.alloc(65537)), /64 KiB/);
    assert.throws(() => disassembleBytes(Buffer.from([0, 0, 3, 0, 0, 0x39]), {file_type: "decb"}), /Truncated/);
    assert.throws(() => disassembleBytes(Buffer.from([0, 0, 1, 0, 0, 0x39]), {file_type: "decb"}), /postamble/);
    assert.throws(() => disassembleBytes(Buffer.from([0x87, 0xcd]), {file_type: "os9"}), /short/);
});

test("browser adapter and API produce the same listing", () =>
{
    const elements = {};
    const options = {...defaultConfig, ...config};
    for(const [key, value] of Object.entries(options)) elements[key] = {value, checked: value};
    elements.disassembly = {};
    const context = vm.createContext({Uint8Array, ArrayBuffer, document: {
        getElementById: id => elements[id],
        querySelector: () => ({value: "raw"}),
        addEventListener: () => {}
    }});
    vm.runInContext(fs.readFileSync(path.join(root, "follow9.js"), "utf8"), context);
    context.buffer = code;
    vm.runInContext("disassemble()", context);
    assert.equal(elements.disassembly.value, disassembleBytes(code, config));
});

test("CLI stdin, JSON, options, and error exit status", async () =>
{
    const result = await cli(["--json", "--offset", "$4000", "--entry", "$4000", "-"], code);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.equal(JSON.parse(result.stdout).disassembly, disassembleBytes(code, config).replace(/\r/g, "\n"));
    const bad = await cli(["--offset", "bogus", "-"], code);
    assert.equal(bad.status, 1);
    assert.equal(bad.stdout, "");
    assert.match(bad.stderr, /Invalid address/);
    assert.equal((await cli(["--bogus", "-"])).status, 1);
    assert.equal((await cli(["--entry"])).status, 1);
    assert.equal((await cli(["missing-file.bin"])).status, 1);
    assert.equal((await cli(["--help"])).status, 0);
    assert.equal(JSON.parse((await cli(["--describe"])).stdout).defaults.file_type, "raw");
});


test("CLI reads saved web configurations and flags override them", async () =>
{
    const directory = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "follow9-test-"));
    try
    {
        const binary = path.join(directory, "input.bin");
        const settings = path.join(directory, "config.json");
        fs.writeFileSync(binary, code);
        fs.writeFileSync(settings, JSON.stringify({...config, allCaps: true}));
        const result = await cli(["--config", settings, "--no-all-caps", "--no-list-opcodes", "--json", binary]);
        assert.equal(result.status, 0, result.stderr);
        const parsed = JSON.parse(result.stdout);
        assert.match(parsed.disassembly, /lda/);
        assert.doesNotMatch(parsed.disassembly, /8654/);
        assert.equal(parsed.config.allCaps, false);
        assert.equal(parsed.config.listOpcodes, false);
    }
    finally
    {
        fs.rmSync(directory, {recursive: true, force: true});
    }
});
