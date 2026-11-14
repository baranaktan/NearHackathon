// Builds contracts/perde to an optimized wasm without Docker and without cargo-near:
//   1. cargo build --target wasm32-unknown-unknown --release
//      (rustflags `-C link-arg=-s --cfg near` come from contracts/perde/.cargo/config.toml,
//       the same flags `cargo near build` passes)
//   2. wasm-opt -Oz from the npm `binaryen` package (same post-step cargo-near runs)
// Output: contracts/perde/target/near/perde.wasm
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { CONTRACT_DIR, WASM_PATH } from './lib/common.mjs';

const require = createRequire(import.meta.url);

function run(cmd, args, cwd) {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    console.error(`command failed with exit code ${res.status}`);
    process.exit(res.status ?? 1);
  }
}

run('cargo', ['build', '--target', 'wasm32-unknown-unknown', '--release'], CONTRACT_DIR);

const rawWasm = join(CONTRACT_DIR, 'target', 'wasm32-unknown-unknown', 'release', 'perde.wasm');
mkdirSync(dirname(WASM_PATH), { recursive: true });

// binaryen's package.json maps the `wasm-opt` bin to bin/wasm-opt (a Node script).
const binaryenDir = dirname(require.resolve('binaryen/package.json'));
const wasmOpt = join(binaryenDir, 'bin', 'wasm-opt');
run(
  process.execPath,
  [
    wasmOpt,
    '-Oz',
    '--enable-bulk-memory',
    '--enable-nontrapping-float-to-int',
    '--enable-sign-ext',
    '--enable-mutable-globals',
    '--strip-debug',
    '--strip-producers',
    rawWasm,
    '-o',
    WASM_PATH,
  ],
  CONTRACT_DIR,
);

const bytes = readFileSync(WASM_PATH);
const sha = createHash('sha256').update(bytes).digest('hex');
console.log(`\nraw wasm:       ${statSync(rawWasm).size} bytes`);
console.log(`optimized wasm: ${bytes.length} bytes -> ${WASM_PATH}`);
console.log(`sha256:         ${sha}`);
