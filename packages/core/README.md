# @perde/core

TypeScript library for **Perde v1**: stealth-address payments on NEAR. A stealth public key `P` *is* a NEAR implicit account (`hex(P)`); a transfer to it creates an account whose only full-access key is `P`, and the recipient signs for it with the derived scalar `p = k_spend + h`.

Pure ESM, strict TypeScript, no Node-only APIs in library code (runs in Node ≥ 22 and modern browsers). Runtime dependencies: `@noble/curves`, `@noble/hashes`, `@scure/bip39`, `@scure/base`.

```sh
npm ci
npm run build          # tsc → dist/ (+ .d.ts)
npm test               # offline, deterministic (Vitest)
npm run test:testnet   # live testnet integration (faucet + real transactions)
npm run lint           # eslint (typescript-eslint strict, type-checked), zero warnings
npm run typecheck
npm run evidence:quote # one real 1Click dry quote → ../../evidence/oneclick-dry-quote.json (after build)
```

## Keys and encodings (PLAN §2)

```ts
import { generateMnemonic, keysFromMnemonic, encodeMetaAddress, encodeViewingKey, decodeMetaAddress, decodeViewingKey } from '@perde/core';

const keys = keysFromMnemonic(generateMnemonic()); // SpendKeys {spendPriv, viewPriv, spendPub, viewPub}
const meta = encodeMetaAddress(keys);              // "perde:…"      share publicly
const viewingKey = encodeViewingKey(keys);         // "perdeview:…"  read-only (auditor) access
```

Decoders check the prefix, base58, length, 4-byte sha256 checksum, and reject low-order, mixed-order and non-canonical points and zero scalars. They throw `PerdeError` with a typed `code` (`INVALID_PREFIX`, `INVALID_ENCODING`, `INVALID_LENGTH`, `BAD_CHECKSUM`, `INVALID_POINT`, `INVALID_SCALAR`, …).

## Stealth payments

```ts
import { deriveStealth, scanAnnouncement, recoverSpendScalar, signWithScalar } from '@perde/core';

const d = deriveStealth(meta);                 // {stealthAccountId, ephemeralPk, viewTag, r}
const match = scanAnnouncement(viewingKey, d); // view-tag fast path, then full check; null if not ours
const p = recoverSpendScalar(keys, d);         // p·G == P, checked
const sig = signWithScalar(p, message);        // standard ed25519 signature for P
```

Invoices (no announcement): `deriveInvoice(keysOrViewingKey, i)` and `recoverInvoiceScalar(keys, i)`.
Receipts: `createReceipt({meta, r, stealthAccountId, tx?})` → `"perdereceipt:…"`, `verifyReceipt(receipt, announcement?)`. A receipt links exactly one stealth account to the meta-address; it gives no spending power.

## NEAR client

- `NearRpc({urls, methodUrls?, fetch?, timeoutMs?, finality?, cooldownMs?, cache?, confirmTimeoutMs?, confirmIntervalMs?})`: `viewAccount`, `viewAccountOrNull`, `accountExists`, `getBalance`, `viewFunction`, `getAccessKey`, `latestBlock`, `latestBlockHash`, `gasPrice`, `protocolConfig`, `sendTransaction(stx, waitUntil)`, `txStatus`, `waitForTransaction(hash, signerId, {waitUntil?, timeoutMs?, intervalMs?})`, `endpointOrder(method)`, `clearCache()`.
  - **Failover:** anything that is not a node's JSON-RPC answer fails over to the next URL: transport errors, HTTP 429, any other non-2xx status without a nearcore error body (rate limiters, proxies, a free tier's 408), unparseable bodies, and node-sync errors. Errors a node reports about the request (`UNKNOWN_ACCOUNT`, `PARSE_ERROR`, …) are thrown as `RpcError` without trying other endpoints.
  - **Adaptive order:** an endpoint that failed goes to the back for `cooldownMs` (default 30 s), so calls stick to the endpoint that answered; `methodUrls` gives a method its own order (e.g. `{ send_tx: [...] }`).
  - **Cache (opt-in, `cache: true`):** identical concurrent reads share one request; `query` results are reused for 1 s, `gas_price` 30 s, the final block 10 s, the protocol config 10 min. Access-key queries and `tx` lookups are only de-duplicated. `sendTransaction` clears the cache before and after, so read-after-write polling always reaches the network.
  - **Lost responses:** `send_tx` waits for execution; after a server timeout, or when every endpoint failed after the broadcast may have arrived, the transaction is looked up by hash (`tx` with `wait_until: "NONE"`, answered immediately, so no endpoint's request-time cap is hit) for `confirmTimeoutMs` (30 s). If it still can't be confirmed, `RPC_UNAVAILABLE` carries `details.hash`. `waitForTransaction` returns failed outcomes instead of throwing.
  - `hasReached(raw, waitUntil)` tells whether a `tx`/`send_tx` result shows execution to that level.
- Transactions: `transfer`, `functionCall`, `deleteAccount`, `serializeTransaction` (borsh `TransactionV0`, byte-identical to near-api-js 7.5.3 — tested), `signTransaction(tx, signer)`, `sendActions({rpc, signer, signerId, receiverId, actions})`.
- Signers (`Signer` interface: `publicKey`, `sign(msg)`): `ScalarSigner(p)` for stealth accounts, `SeedSigner.fromSecretKey("ed25519:…")` / `SeedSigner.generate()` for ordinary accounts.
- Units: `parseNear("1.5")`, `formatNear(yocto, {maxDecimals})`, `tgas(n)` — bigint only, no floats.
- Links: `explorerTxUrl(network, hash)`, `explorerAccountUrl(network, id)` (testnet → `testnet.nearblocks.io`).
- `sendActions({…, onTxHash?})` reports the hash right after signing, before the broadcast.
- Defaults: testnet `https://test.rpc.fastnear.com` → `https://near-testnet.drpc.org`; mainnet `https://free.rpc.fastnear.com` → `https://rpc.mainnet.near.org`. Measured 2026-11-14: FastNEAR answers in ~80 ms with no request-time cap but rate-limits after a burst of ~200 requests (HTTP 429 without CORS headers); dRPC took 400 requests at 10 concurrent without a 429 and sends CORS headers on every answer, but its free tier ends any request after ~2 s (HTTP 408, which a waiting `send_tx` can hit). `rpc.testnet.near.org` is deprecated (every answer throttled to ~3 s). Browser apps should read from dRPC first and broadcast through FastNEAR (see `apps/web/src/lib/perde.ts`).

## High-level client

```ts
import { PerdeClient, SeedSigner } from '@perde/core';

const perde = new PerdeClient({ network: 'testnet', contractId: 'perde-pay.testnet' });
await perde.register(signer, 'alice.testnet', meta);
const sent = await perde.send(signer, 'bob.testnet', 'alice.testnet' /* or "perde:…" */, 10n ** 23n);
// sent.txHash, sent.explorerUrl, sent.receipt, sent.stealthAccountId
await perde.sendBatch(signer, 'bob.testnet', [{ to: metaA, amountYocto: 10n ** 23n }, { to: 'carol.testnet', amountYocto: 5n * 10n ** 22n }]); // ONE tx
const { payments, nextIndex } = await perde.scan(viewingKey, { fromIndex: 0 }); // live balances
await perde.claim(keys, payments[0], 'alice.testnet');                           // sweep, signed by the stealth scalar
await perde.claim(keys, payments[1], 'alice.testnet', { mode: 'deleteAccount' });
// Pay onward from a stealth account without claiming: it signs with its own derived key.
await perde.send(new ScalarSigner(recoverSpendScalar(keys, payments[2])), payments[2].stealthAccountId, 'perde:…', 10n ** 22n);
const invoices = await perde.scanInvoices(viewingKey, { gapLimit: 20 });
await perde.claim(keys, { invoiceIndex: 0 }, 'alice.testnet');
```

Also: `getConfig`, `announcementCount`, `getMetaAddress`, `unregister`, `resolveRecipient`, `fetchAnnouncements({fromIndex, limit})` (cursor `nextIndex`, `hasMore`), `iterateAnnouncements`, `estimateClaimFee`, `verifyReceipt` (on-chain), `maxBatchSize`, `transactionOutcome(hash, signerId)`, `claimStatus(hash, stealthAccountId)`.

Options (all optional, backward compatible):

- `new PerdeClient({…, rpc})` shares one `NearRpc` (endpoint health, cache); `SputnikDao` takes `rpc` too and passes it to its inner client.
- `send(signer, senderId, to, amount, { stealth, onTxHash })`: `stealth` is a derivation made earlier with `deriveStealth(meta)`, so a UI can show the exact one-time account before signing; it is checked against the recipient (`KEY_MISMATCH` otherwise). `sendBatch(signer, senderId, items, { onTxHash })` accepts `stealth` per item and rejects two items with the same stealth account.
- `claim(keys, payment, destination, { mode, amountYocto, onTxHash })`: the result has `txHash`; `onTxHash` reports it before the broadcast, and if the response is lost the thrown error carries `details.hash`. `claimStatus(hash, stealthAccountId)` recovers the outcome (`success`, `failure`, `tokensBurnt`, `outcome`).
- **Pay onward:** any signer works with `send`, including a stealth account's own `ScalarSigner(recoverSpendScalar(keys, payment))`: `perde.send(stealthSigner, payment.stealthAccountId, meta, amount)` moves funds stealth → fresh stealth with a new announcement, without touching a named account.

`send(…, amountYocto)`: `amountYocto` is what the stealth account receives; the contract's `announce_fee` is added to the attached deposit. Each `send` action carries 20 Tgas (≈10 Tgas used: contract ≈2.4 Tgas plus ≈7.5 Tgas for the transfer receipt that creates the implicit account; NEAR's 0.007 NEAR account-creation charge is paid from that prepaid gas). Unused gas is refunded, so a batch holds at most 15 sends.

### Claim fee math (measured on testnet, protocol 88, gas price 1e8 yocto/gas)

`estimateClaimFee({config, gasPrice, mode, createsDestination})`, where `config` comes from `EXPERIMENTAL_protocol_config` (built-in fallback: `FALLBACK_FEE_CONFIG`):

- A Transfer claim uses 446,365,125,000 gas and burns 0.0000446365125 NEAR. The node rejects it with `NotEnoughBalance` unless the balance also covers the receipt's execution gas at `min_gas_purchase_price` (1e9 yocto/gas). The reserve is `gas × max(gasPrice, min_gas_purchase_price) × 1.5` = **0.0006695476875 NEAR**. The unused part comes back to the stealth account as dust (≈0.000625 NEAR).
- `mode: 'deleteAccount'` sends the whole balance to an existing beneficiary. It used 0.00028 NEAR in total in our run (0.000051 NEAR burnt, plus the gas refund, which is lost because the account is gone) and leaves nothing behind.
- Sweeping to a *new* implicit account adds the creation costs (7.7 Tgas plus the 0.007 NEAR account-creation charge) to the reserve. Prefer existing destinations.

## Private payments from a DAO treasury (SputnikDAO v2)

A DAO pays a contributor through a normal SputnikDAO `FunctionCall` proposal that calls `perde.send(...)`. Everyone sees that the treasury paid a fresh implicit account; nobody can tell who it belongs to. No multisig of our own: this works with any existing Sputnik DAO whose policy lets members approve `call` proposals.

```ts
import { SputnikDao, describeProposal } from '@perde/core';

const dao = new SputnikDao({ network: 'testnet', daoId: 'perde-demo.sputnikv2.testnet', perdeContractId: 'perde-pay.testnet' });
const p = await dao.proposeStealthPayment(signer, 'alice.testnet', { recipient: 'perde:…' /* or a registered name */, amountYocto: 5n * 10n ** 22n });
// p.proposalId, p.txHash, p.stealthAccountId, p.receipt (keep private), p.bondYocto
const v = await dao.vote(signer2, 'carol.testnet', p.proposalId, 'approve'); // executes when the vote reaches the threshold
// v.status === 'Approved', v.executed === true; the recipient finds it with perde.scan(viewingKey)
```

- Also: `getPolicy`, `getConfig`, `getVersion`, `getBalance` (`{total, storageLocked, available}`), `getLastProposalId` (= number of proposals), `getProposal(id)`, `getProposals(from, limit)`, `addProposal`, `finalize`, `describe(p)`, static `SputnikDao.create(...)`.
- Pure helpers: `buildStealthPaymentProposal({contractId, announceFee, payments, description?})` (one `send` action per payment, deposit = amount + announce fee, 30 Tgas for one payment / 15 Tgas each for several), `describeProposal(p, {contractId?, announceFee?})` (recognises Perde payments and extracts stealth accounts and amounts; never throws), `openDemoPolicy(...)`, `encodeDaoCreateArgs(config, policy)`, `actProposalGas(kind)`.
- Privacy guard: `proposeStealthPayment` refuses a description that contains the recipient's name or meta-address. The default description says nothing about the recipient.
- Interface of the version the testnet factory `sputnikv2.testnet` deploys (`version()` 2.3.1, code `AA4nA45vauiac3jdVwJTzSdUP3oj2r1fDaPAb2mHdgcH`): `add_proposal({proposal: {description, kind: {FunctionCall: {receiver_id, actions: [{method_name, args: base64(JSON), deposit, gas}]}}}})` with **exactly** `policy.proposal_bond` attached (`ERR_MIN_BOND` otherwise), returns the id; `act_proposal({id, action: "VoteApprove" | "VoteReject" | "VoteRemove" | "Finalize", memo?})`. Upstream `main` also requires `proposal: <kind>` (and rejects unknown arguments); the client always sends the current kind, which the testnet version ignores.
- `act_proposal` executes the proposal inside the vote transaction, so the voter attaches the proposal's action gas + 10 Tgas callback + 40 Tgas (80 Tgas for one payment). Prepaid gas is reserved at 1e9 yocto/gas on testnet, so the voter needs ≈ 0.08 NEAR of headroom. The vote transaction succeeds even if the inner call fails; `VoteResult.executed` / `status` (`Approved` vs `Failed`) tell the difference.
- Read-after-write: testnet RPC endpoints are load-balanced and a node can lag the block that holds your transaction (a view right after `add_proposal` may panic with `ERR_NO_PROPOSAL`). `addProposal` and `vote` poll (bounded, 20 s) until the proposal reflects the write; use `waitForProposal(id, ok?)` and the exported `pollUntil(fn, ok, {timeoutMs})` / `isReadLagError` for your own reads. `NearRpc` turns nearcore's legacy `result: {error: "..."}` query responses into `RpcError` (`CONTRACT_EXECUTION_ERROR`, `UNKNOWN_ACCESS_KEY`) and rejects incomplete transaction outcomes with `PerdeError("RPC_ERROR")` after polling `tx`.
- Sputnik does not count votes from `Everyone` roles when it decides a proposal (they have no size). `openDemoPolicy` therefore gives the public a `Member("0")` role with quorum 1 (one approve vote passes), limited to `call` proposals; the creator keeps a `council` role with `*:*`.

## Faucet (testnet)

`createFaucetAccount({accountId?, signer?})` → `{accountId, secretKey, publicKey, txHash, balance, rateLimit}`. It POSTs to `https://helper.nearprotocol.com/account` and waits until the account is visible over RPC. Observed: 10 NEAR, ≈3.5 s, limit 10 accounts per ~12 h window per client IP (`x-ratelimit-*` headers). A 429 response becomes `FAUCET_ERROR` with the reset time. Transport errors and 5xx responses are retried.

## NEAR Intents 1Click

`OneClickClient({apiKey?, baseUrl?, fetch?})`: `listTokens()`, `quote(params)` (defaults to `dry: true`), `status(depositAddress, memo?)`. The optional key is sent as `X-API-Key`; without a key, 1Click adds its own fee.
`quoteToStealth(client, {originAsset, amountOutYocto | amountIn, stealthAccountId, refundTo, dry})` asks for NEAR on the NEAR chain (`NEAR_ASSET_ID = "nep141:wrap.near"`, the only NEAR-side asset in `/v0/tokens`) with `recipientType: DESTINATION_CHAIN`. The API accepts 64-hex implicit recipients.

## Security notes

- Scalar arithmetic uses JS `bigint` and is **not constant-time**. Keys are used only in the owner's own process or browser, so timing side channels are out of scope.
- `signWithScalar` derives its nonce deterministically (`H512s("perde/nonce/v1", p ‖ M)`), so no RNG is needed when signing.
- Malformed announcements are ignored during scanning; they never throw.
