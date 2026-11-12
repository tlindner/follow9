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
    // Drivr and FMgr modules have a dispatch table of three-byte entries at exec.
    const dispatchModule = (type, entries) =>
    {
        const bytes = [0x87, 0xcd, 0, 0, 0, 0, type, 0x81, 0, 0, 13, 0, 0];
        for(let i = 0; i < entries; i++) bytes.push(0x86, 0x40 + i, 0x39);
        bytes[3] = bytes.length;
        return Buffer.from(bytes);
    };
    assert.match(disassembleBytes(dispatchModule(0xe1, 6), {file_type: "os9"}), /001c 8645\s+lda/);
    assert.doesNotMatch(disassembleBytes(dispatchModule(0xe1, 7), {file_type: "os9"}), /001f 8646\s+lda/);
    assert.match(disassembleBytes(dispatchModule(0xd1, 13), {file_type: "os9"}), /0031 864c\s+lda/);
    assert.doesNotMatch(disassembleBytes(dispatchModule(0x11, 2), {file_type: "os9"}), /0010 8641\s+lda/);
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

test("Color BASIC skip idioms preserve alternate entries in either traversal order", () =>
{
    for(const [opcode, bytes, name] of [
        [0x21, [0x5f], "skp1"],
        [0x8c, [0xc6, 0x60], "skp2"],
        [0x86, [0x5f], "skp1ld"]
    ])
    {
        const binary = Buffer.from([opcode, ...bytes, 0x39]);
        for(const transferList of ["$4000,$4001", "$4001,$4000"])
        {
            const options = {...config, transferList, colorBasicSkips: true};
            const output = disassembleBytes(binary, options);
            assert.match(output, new RegExp(name + " equ \\$" + opcode.toString(16)));
            assert.match(output, new RegExp("4000 " + opcode.toString(16) + "\\s+fcb\\s+" + name));
            assert.match(output, /4001 .*\s(clrb|ldb)/);
            assert.match(output, /\srts/);
            assert.doesNotMatch(disassembleBytes(binary, {...options, colorBasicSkips: false}), /skp/);
        }
        // Without an alternate entry, these are ordinary instructions.
        assert.doesNotMatch(disassembleBytes(binary, {...config, colorBasicSkips: true}), /skp/);
    }
});

test("Color BASIC detection rejects entries inside ordinary instruction operands", () =>
{
    const binary = Buffer.from([0xc6, 0xff, 0xbd, 0xa2, 0xaa, 0x0f, 0x39]);
    const output = disassembleBytes(binary, {
        offset: "$a444", transferList: "$a445,$a444", colorBasicSkips: true
    });
    assert.match(output, /a444 c6ff\s+ldb\s+#\$ff/);
    assert.match(output, /a446 bda2aa\s+jsr/);
    assert.doesNotMatch(output, /a445 ffbda2\s+stu/);
    assert.doesNotMatch(output, /a448 aa0f\s+ora/);
    assert.doesNotMatch(output, /fcb\s+skp/);
});

test("Color BASIC overlap resolution removes bogus paths regardless of entry order", () =>
{
    const binary = Buffer.from([
        0x26, 0x0c, 0x96, 0x79, 0x27, 0x03, 0xbd, 0xa2, 0xa8,
        0xc6, 0xff, 0xbd, 0xa2, 0xaa, 0x0f, 0x78, 0x39
    ]);
    for(const transferList of ["$a43b,$a445", "$a445,$a43b"])
    {
        const output = disassembleBytes(binary, {
            offset: "$a43b", transferList, colorBasicSkips: true
        });
        assert.match(output, /a444 c6ff\s+ldb\s+#\$ff/);
        assert.match(output, /a446 bda2aa\s+jsr/);
        assert.match(output, /a449 0f78\s+clr/);
        assert.match(output, /a44b 39\s+rts/);
        assert.doesNotMatch(output, /\sstu\s|\sora\s|\sasl\s/);
        assert.doesNotMatch(output, /LBDA2|L39BD/);
    }
});

test("Color BASIC TST and LDX skip forms preserve alternate entries", () =>
{
    for(const [opcode, bytes, mnemonic] of [[0x7d, [0x1a, 1], "orcc"], [0x8e, [0x8d, 0], "bsr"]])
    {
        for(const transferList of ["$4000,$4001", "$4001,$4000"])
        {
            const output = disassembleBytes(Buffer.from([opcode, ...bytes, 0x39]), {
                ...config, transferList, colorBasicSkips: true
            });
            assert.match(output, new RegExp("4000 .*fcb\\s+\\$"+opcode.toString(16)));
            assert.match(output, new RegExp("4001 .*\\s"+mnemonic+"\\s"));
            assert.match(output, /4003 39\s+rts/);
        }
    }
});

test("labels inside operands retain their addresses as equates", () =>
{
    const output = disassembleBytes(Buffer.from([0xc6, 0xff, 0x39]), {
        ...config, colorBasicSkips: true, labelList: "inside equ $4001"
    });
    assert.match(output, /inside equ \$4001/);
    assert.doesNotMatch(output, /inside\r/);
});

test("extended addressing preserves its width at direct-page addresses", () =>
{
    for(const [opcode, mnemonic] of [[0xb6, "lda"], [0xbe, "ldx"], [0xbf, "stx"]])
    {
        const output = disassembleBytes(Buffer.from([opcode, 0, 0x8d, 0x39]), config);
        assert.match(output, new RegExp(mnemonic+"\\s+>L008D"));
    }
});

test("indirect indexed addressing preserves register, displacement, and bracket syntax", () =>
{
    for(const [bytes, operand] of [
        [[0xa6, 0x99, 0x12, 0x34], "[>4660,x]"],
        [[0xa6, 0xb9, 0xff, 0xfe], "[>-2,y]"],
        [[0xa6, 0x98, 0xfe], "[<-2,x]"],
        [[0xa6, 0x9f, 0x00, 0x88], "[>L0088]"],
        [[0xa6, 0x9c, 0x00], "[<L4003,pcr]"],
        [[0xa6, 0x9d, 0x00, 0x00], "[>L4004,pcr]"]
    ])
    {
        const output = disassembleBytes(Buffer.from([...bytes, 0x39]), config);
        assert.ok(output.includes("lda     "+operand), output);
    }
});
