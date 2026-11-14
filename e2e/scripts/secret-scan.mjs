/**
 * Secret scan for the repo (run from the repo root: `npm run audit:secrets`).
 *
 *  1. Collects the REAL secrets this machine holds for the project (values in
 *     .env, secret keys / mnemonics in .cache/*.json, the core testnet funder
 *     cache, video-take states, ~/.near-credentials/testnet) — in memory only.
 *  2. Searches for them, and for secret-shaped strings (NEAR ed25519 secret
 *     keys, BIP-39 phrases, common API-token formats, PEM keys), in:
 *       - every tracked or untracked-but-not-ignored file of the working tree,
 *       - the full git history of every ref (`git log --all -p`),
 *       - the built bundles (apps/web/dist, e2e/.app-dist).
 *  3. Checks that .env, .cache/ and the funder cache are not tracked.
 *
 * Prints counts and locations only — never a secret value. Exit 1 on any
 * real secret found or any tracked secret file.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const root = resolve(process.cwd());
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 1 << 30, encoding: 'utf8' });

/* ---------- 1. real secrets (memory only) ---------- */
const real = new Map(); // value -> label
function addSecret(value, label) {
  if (typeof value === 'string' && value.length >= 12) real.set(value, label);
}
function walkJson(x, label) {
  if (Array.isArray(x)) x.forEach((v) => walkJson(v, label));
  else if (x && typeof x === 'object') {
    for (const [k, v] of Object.entries(x)) {
      if (/secret|private|mnemonic|seed|phrase|key/i.test(k) && typeof v === 'string' && !/^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(v)) addSecret(v, `${label}:${k}`);
      else walkJson(v, label);
    }
  }
}
function jsonFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true }).map((f) => join(dir, String(f))).filter((f) => f.endsWith('.json') && statSync(f).isFile());
}
if (existsSync(join(root, '.env'))) {
  for (const line of readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/.exec(line);
    // Only values of secret-named variables (URLs, network names etc. are not secrets).
    if (m && /KEY|SECRET|TOKEN|PASS|MNEMONIC|PRIVATE|SEED/i.test(m[1])) addSecret(m[2].replace(/^["']|["']$/g, ''), `.env:${m[1]}`);
  }
}
const secretSources = [
  ...jsonFiles(join(root, '.cache')),
  ...jsonFiles(join(root, 'packages', 'core', 'node_modules', '.cache')),
  ...jsonFiles(join(root, 'scripts', 'video', '.state')),
  ...jsonFiles(join(homedir(), '.near-credentials', 'testnet')),
];
for (const f of secretSources) {
  try {
    walkJson(JSON.parse(readFileSync(f, 'utf8')), f.replace(homedir(), '~').replace(root, '.'));
  } catch {
    /* not JSON */
  }
}

/* ---------- 2. patterns ---------- */
const require = createRequire(join(root, 'packages', 'core', 'package.json'));
const { wordlist } = require('@scure/bip39/wordlists/english.js');
const WORDS = new Set(wordlist);
const PUBLIC_TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const PATTERNS = [
  ['near-secret-key', /ed25519:[1-9A-HJ-NP-Za-km-z]{80,90}/g],
  ['github-token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g],
  ['openai/anthropic-style key', /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}\b/g],
  ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['slack-token', /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/g],
  ['pem-private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
];
function mnemonicHits(text) {
  const hits = [];
  const re = /\b(?:[a-z]{3,8}\s+){11}[a-z]{3,8}\b/g;
  for (const m of text.matchAll(re)) {
    const words = m[0].split(/\s+/);
    if (!words.every((w) => WORDS.has(w)) || m[0] === PUBLIC_TEST_MNEMONIC) continue;
    // Consecutive entries of the BIP-39 list itself (bundled by @scure/bip39) are not a phrase.
    const idx = words.map((w) => wordlist.indexOf(w));
    if (idx.every((v, i) => i === 0 || v === idx[i - 1] + 1)) continue;
    hits.push(m[0]);
  }
  return hits;
}
const findings = [];
function scanText(text, where) {
  for (const [value, label] of real) if (text.includes(value)) findings.push({ where, kind: `REAL SECRET (${label})`, real: true });
  for (const [kind, re] of PATTERNS)
    for (const m of text.matchAll(re)) {
      // 64-byte ed25519 *signatures* (transactions, 1Click quotes) have the same shape as secret keys; they are public.
      if (kind === 'near-secret-key' && /signature"?\s*[:=]\s*"?$/i.test(text.slice(Math.max(0, m.index - 24), m.index))) {
        findings.push({ where, kind: 'ed25519 signature (public, not a key)', real: real.has(m[0]), info: true });
        continue;
      }
      findings.push({ where, kind, real: real.has(m[0]) });
    }
  for (const m of mnemonicHits(text)) findings.push({ where, kind: 'bip39-phrase', real: real.has(m) });
}

const tree = git('ls-files', '-co', '--exclude-standard', '-z').split('\0').filter(Boolean);
let scannedFiles = 0;
for (const f of tree) {
  const p = join(root, f);
  if (!existsSync(p) || statSync(p).size > 5_000_000) continue;
  const buf = readFileSync(p);
  if (buf.includes(0)) continue; // binary
  scannedFiles++;
  scanText(buf.toString('utf8'), `tree:${f}`);
}
const refs = git('rev-list', '--all', '--count').trim();
const history = git('log', '--all', '-p', '--no-color', '--no-ext-diff', '--text');
scanText(history, `history (${refs} commits)`);
let bundleFiles = 0;
for (const dir of ['apps/web/dist', 'e2e/.app-dist']) {
  const d = join(root, dir);
  if (!existsSync(d)) continue;
  for (const f of readdirSync(d, { recursive: true })) {
    const p = join(d, String(f));
    if (!statSync(p).isFile() || !/\.(js|css|html|json|svg|txt|map)$/.test(p)) continue;
    bundleFiles++;
    scanText(readFileSync(p, 'utf8'), `bundle:${dir}/${String(f).replace(/\\/g, '/')}`);
  }
}

/* ---------- 3. tracked secret files ---------- */
const tracked = git('ls-files', '--', '.env', '.cache', 'packages/core/node_modules', 'scripts/video/.state').split('\n').filter(Boolean);
const ignored = ['.env', '.cache/demo-account.json', 'packages/core/node_modules/.cache/perde-testnet/funder.json'].map((f) => {
  try {
    git('check-ignore', '-q', f);
    return [f, true];
  } catch {
    return [f, false];
  }
});

console.log(`real secrets known on this machine: ${real.size} (values not shown) from .env + ${secretSources.length} key files`);
console.log(`scanned: ${scannedFiles} working-tree files, full history of ${refs} commits, ${bundleFiles} bundle files`);
console.log(`tracked secret files: ${tracked.length ? tracked.join(', ') : 'none'}`);
for (const [f, ok] of ignored) console.log(`git-ignored ${f}: ${ok ? 'yes' : 'NO'}`);
const grouped = new Map();
for (const f of findings) grouped.set(`${f.kind} @ ${f.where}${f.real ? ' [MATCHES A REAL SECRET]' : ''}`, (grouped.get(`${f.kind} @ ${f.where}${f.real ? ' [MATCHES A REAL SECRET]' : ''}`) ?? 0) + 1);
console.log(`findings: ${findings.length}`);
for (const [k, n] of grouped) console.log(`  ${n}× ${k}`);
const unexplained = findings.filter((f) => !f.info && !f.real && !f.kind.startsWith('REAL'));
if (unexplained.length) console.log(`secret-shaped strings that match no real secret on this machine: ${unexplained.length} (review the locations above)`);
const bad = findings.some((f) => f.real || f.kind.startsWith('REAL')) || tracked.length > 0 || ignored.some(([, ok]) => !ok);
console.log(bad ? 'RESULT: FAIL' : 'RESULT: clean (no real secret in tree, history or bundle; secret files untracked)');
process.exit(bad ? 1 : 0);
