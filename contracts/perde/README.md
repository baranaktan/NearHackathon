# Perde contract

Announcement registry for Perde stealth-address payments on NEAR. Rust, `near-sdk` 5.30.2.

The contract is **not a pool**. `send` records a public announcement and, in the same call, forwards
`attached_deposit − announce_fee` to the stealth account with a Transfer promise. The stealth account is a
NEAR implicit account (64 lowercase hex characters = an ed25519 public key), and the Transfer creates it if
it does not exist. The contract also keeps a public directory `account_id → meta_address`, so a sender can
pay `alice.testnet` privately.

There is no owner, no admin method, no upgrade method and no `#[init]`: the state is created on the first call
(`Default`).

Testnet deployment: [`perde-pay.testnet`](https://testnet.nearblocks.io/address/perde-pay.testnet). Details are in
[`deployments/testnet.json`](../../deployments/testnet.json), and the live smoke test is in
[`evidence/contract-testnet-smoke.md`](../../evidence/contract-testnet-smoke.md).

## Interface

| Method | Kind | Args (JSON) | Returns | Notes |
| --- | --- | --- | --- | --- |
| `send` | call, payable | `{stealth_account: string, ephemeral_pk: string, view_tag: number}` | `number` (announcement index) | `stealth_account` and `ephemeral_pk` must each be exactly 64 lowercase hex chars. `view_tag` must be 0..=255. Requires `deposit ≥ announce_fee + min_amount` (0.012 NEAR). Stores the announcement, emits an `announce` event and transfers `deposit − announce_fee` to `stealth_account`. |
| `get_announcements` | view | `{from_index: number, limit: number}` | `[{index: number, stealth_account: string, ephemeral_pk: string, view_tag: number, amount: string, timestamp_ms: number}]` | `limit` is silently capped at 200. Returns `[]` when `from_index ≥ count` or `limit = 0`. `amount` is the yoctoNEAR the stealth account received, as a decimal string. |
| `announcement_count` | view | `{}` | `number` | |
| `register` | call, payable | `{meta_address: string}` | nothing | `meta_address` must start with `perde:` and be at most 128 chars. The caller pays the exact storage cost of the bytes added. Any excess, including storage freed by a shorter overwrite, is refunded in the same call. Overwriting is allowed. Emits a `register` event. |
| `unregister` | call | `{}` | nothing | Deletes the caller's entry and refunds the storage it occupied. Panics if the caller has no entry. Emits an `unregister` event. |
| `get_meta_address` | view | `{account_id: string}` | `string \| null` | |
| `get_config` | view | `{}` | `{announce_fee: string, min_amount: string, version: string}` | Currently `{"announce_fee":"2000000000000000000000","min_amount":"10000000000000000000000","version":"1.0.0"}` |

Events use NEP-297 and are logged as `EVENT_JSON:{...}`:

```json
{"standard":"perde","version":"1.0.0","event":"announce","data":[{"index":0,"stealth_account":"<64 hex>","ephemeral_pk":"<64 hex>","view_tag":123,"amount":"48000000000000000000000","timestamp_ms":1794615450624}]}
{"standard":"perde","version":"1.0.0","event":"register","data":[{"account_id":"alice.testnet","meta_address":"perde:..."}]}
{"standard":"perde","version":"1.0.0","event":"unregister","data":[{"account_id":"alice.testnet"}]}
```

Error messages from failed calls (`Smart contract panicked: ...`):
- `stealth_account must be exactly 64 lowercase hex characters`
- `ephemeral_pk must be exactly 64 lowercase hex characters`
- `view_tag must be in 0..=255`
- `attached deposit must be at least 12000000000000000000000 yoctoNEAR (announce_fee + min_amount)`
- `meta_address must start with 'perde:'`
- `meta_address must be at most 128 characters`
- `attached deposit must be at least <n> yoctoNEAR to cover storage`
- `account has no registered meta_address`

If a call panics, the protocol refunds its attached deposit to the caller.

### Gas (measured on testnet)

| Call | Gas burnt (total, all receipts) | Recommended prepaid gas |
| --- | --- | --- |
| `send` to a new implicit account | 10.66 Tgas: 2.37 for the function call, 7.53 for the Transfer that creates the account, plus refunds | **30 Tgas** for a single call. Use 15 Tgas per `send` action when batching (the protocol limit is 1 PGas prepaid per transaction) |
| `register` | 2.72–2.78 Tgas | 30 Tgas |
| `unregister` | ≈2.4 Tgas | 30 Tgas |

Unused prepaid gas is refunded.

## Storage and fee reasoning

NEAR charges storage staking at 10¹⁹ yoctoNEAR (0.00001 NEAR) per byte, and every stored key/value record
adds 40 bytes of overhead.

**Announcement.** Each announcement is stored in compact form in a `near_sdk::store::Vector`, so appends
are O(1) and `get_announcements` does one storage read per returned item.

| Part | Bytes |
| --- | --- |
| key: prefix (1) + u32 index (4) | 5 |
| value: stealth pk 32 + ephemeral pk 32 + view tag 1 + amount u128 16 + timestamp u64 8 | 89 |
| record overhead | 40 |
| **total** | **134 bytes = 0.00134 NEAR** |

This figure is asserted in the unit test `announce_fee_covers_storage_of_one_announcement` and was measured on
chain: the contract's `storage_usage` went up by exactly 134 bytes per `send`. The `announce_fee` of 0.002 NEAR
covers that with **0.00066 NEAR (49%) to spare**. The fee stays in the contract account and pays for the
storage stake. The surplus is unlocked balance on the contract account (see the security notes).

`min_amount` is 0.01 NEAR, so the stealth account can pay its own sweep transaction later (a transfer costs well
under 0.001 NEAR of gas). An implicit account with one full-access key uses 182 bytes. Since zero-balance
accounts (NEP-448), an account that small needs no storage stake.

**Directory entry.** The stored entry is `key = 1 + 4 + len(account_id)` plus `value = 4 + len(meta_address)`,
plus 40 bytes of overhead. A typical meta-address is 99 chars, so for a 17-char account the entry is 165 bytes
(0.00165 NEAR). The maximum (64-char account, 128-char meta) is 241 bytes (0.00241 NEAR). **Clients should
attach 0.0025 NEAR**, and the excess is refunded in the same call. The contract measures the exact change in
`env::storage_usage()`, so it charges or refunds exactly the bytes added or freed on an overwrite. `unregister`
refunds exactly what is currently stored.

**Code.** The optimized wasm is about 140.7 KB, which is about 1.41 NEAR staked on the contract account.

### Why there is no refund callback on the Transfer

`send` checks that `stealth_account` is exactly 64 lowercase hex characters, which is always a valid NEAR
implicit account id. A Transfer to an implicit account either credits the existing account or creates the
account with that ed25519 key as its full-access key. No minimum balance applies, so the Transfer cannot fail
for a validated id. The only theoretical failure is a protocol-level issue. In that case NEAR refunds the
deposit to the predecessor of the failed receipt, which is the contract, and not the original sender.

A callback that refunds the sender would add about 5–10 Tgas to every `send` to guard a path that cannot
happen for valid input, so it was left out on purpose. If the hex is not a valid curve point, the Transfer
still succeeds, but nobody can sign for that account. Perde clients always derive `P` as a real curve point
(see `PLAN.md` §2).

The announcement and the Transfer are scheduled in the same function call. If the call panics (bad input or
too small a deposit), neither happens and the deposit returns to the sender. This was verified on testnet in
step 7 of the smoke test.

## Build, test, deploy

Requirements:
- Rust via rustup. `rust-toolchain.toml` pins **1.95.0**, because near-sdk 5.30.2 needs rustc ≥ 1.95. rustup
  installs it automatically on first use.
- The `wasm32-unknown-unknown` target, which the toolchain file adds.
- Node ≥ 22.22.2 for the scripts.

No Docker is needed. On Windows you also need the MSVC build tools (needed by the Rust toolchain anyway).

### Test

```sh
cd contracts/perde
cargo test
```

The unit tests use `near_sdk::test_utils` and `testing_env!`. There are 36 tests: the happy path, every
validation failure, fee math, pagination boundaries including the 200 cap, register/overwrite/unregister
storage accounting, and the exact event JSON. `.cargo/config.toml` sets `AWS_LC_SYS_PREBUILT_NASM=1`, so
the `aws-lc-sys` test dependency builds on Windows without NASM installed. Other platforms ignore it.

### Build (works on Windows, Linux and macOS, no Docker, no cargo-near)

```sh
cd scripts/contract
npm install
npm run build        # -> contracts/perde/target/near/perde.wasm (+ prints size and sha256)
```

`npm run build` runs `cargo build --target wasm32-unknown-unknown --release`. The rustflags
`-C link-arg=-s --cfg near` come from `contracts/perde/.cargo/config.toml` and are the same flags
`cargo near build` passes. The script then runs `wasm-opt -Oz --enable-bulk-memory
--enable-nontrapping-float-to-int` from the npm `binaryen` package, the same post-step cargo-near runs.

rustc ≥ 1.87 emits bulk-memory and non-trapping float-to-int opcodes. The nearcore VM accepts them from
protocol version 84 onwards, and testnet was on protocol version 88 when this was deployed.

If you have `cargo-near` ≥ 0.23, `cargo near build non-reproducible-wasm --no-abi` produces a byte-identical
pre-`wasm-opt` wasm. On this Windows machine:
- Installing it from source failed because vendored OpenSSL needs a native Perl.
- The prebuilt binary's built-in wasm-opt cannot open paths containing non-ASCII characters.
- ABI generation does not link on Windows/MSVC.

That is why the npm script is the documented path.

### Deploy (testnet only)

```sh
cd scripts/contract
npm run deploy         # first run: creates a faucet-funded account, saves its key to ../../.env, deploys
npm run deploy         # later runs: redeploys the code to the account in .env (state is kept)
npm run deploy:fresh   # new account (use when the state layout changes incompatibly)
npm run smoke          # live smoke test -> evidence/contract-testnet-smoke.md
```

The deploy script works as follows:
- It creates the account through the testnet faucet helper: `POST https://helper.nearprotocol.com/account`
  with `{newAccountId, newAccountPublicKey}`. Accounts start with 10 testnet NEAR.
- It tries `perde-pay.testnet` first, then `perde-pay-<random>.testnet`.
- It writes `NEAR_TESTNET_ACCOUNT_ID` and `NEAR_TESTNET_PRIVATE_KEY` only to the root `.env`, which is
  gitignored, and leaves all other variables untouched.
- It deploys with near-api-js 7.5.3 over `https://test.rpc.fastnear.com`, with `https://rpc.testnet.near.org`
  as failover.
- It checks the on-chain code hash, then writes `deployments/testnet.json`.

## Security notes and limitations

- **Unaudited.** This is hackathon code. It has unit tests and a live testnet smoke test, but no external
  review. Do not use it on mainnet with real value.
- **Announcements are public by design.** Anyone can read the stealth account, ephemeral public key, view tag,
  **amount** and timestamp of every payment. Perde hides *who the recipient is*, not *that a payment happened*
  or *how much was paid*.
- **The sender is visible.** The sender's account is the signer of the `send` transaction. Unlinkability
  protects only the recipient side.
- **The directory is public.** A registered `account_id → meta_address` mapping is public. That is its
  purpose, but it reveals that the account uses Perde.
- **The deployer key can control the contract account.** The account was created with one full-access key
  held by the deployer, stored in the local `.env`. That key can redeploy different code, which replaces the
  logic for future calls, and can transfer out the contract's unlocked balance (the accumulated
  `announce_fee` surplus). It cannot touch funds already sent to stealth accounts, because those never stay in
  the contract. The contract has no admin or upgrade methods, but it is **not immutable** until that key is
  deleted. To make it immutable, delete the full-access key with a `DeleteKey` action after the final deploy.
  This was not done on testnet, so the code can still be fixed during the hackathon.
- **No refund callback on the Transfer.** The reasons are above.
- **The pagination cap is 200.** A full scan from index 0 costs `ceil(count / 200)` view calls. There is no
  server-side filtering by view tag, so clients download announcements and filter locally, which is the
  privacy-preserving choice.
- **There is a capacity limit.** The `Vector` index is `u32`, so there can be at most 4,294,967,295
  announcements. After that, `send` panics with `announcement log is full`.
