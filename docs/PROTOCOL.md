# Perde protocol v1 and threat model

The reference implementation is `packages/core/src/crypto/`. Where this document and the code disagree, the code and its tests (`packages/core/test/`) are authoritative.

## 1. Primitives

- Curve: ed25519. `G` is the base point, `L` the group order.
- Scalars are 32-byte little-endian; points are 32-byte compressed encodings.
- `H512s(tag, data)` = SHA-512(`tag ‖ data`), interpreted as a little-endian integer, reduced mod `L`.
- A NEAR **implicit account id** is the lowercase hex of a 32-byte ed25519 public key (64 characters). Transferring NEAR to an implicit account that does not exist creates it with that public key as its only full-access key.

## 2. Keys and encodings

| Item | Definition |
| --- | --- |
| Seed | BIP-39 mnemonic (12 words) → 64-byte seed, empty passphrase |
| Spend key | `k_spend = H512s("perde/spend/v1", seed)`, `K_spend = k_spend·G` |
| View key | `k_view = H512s("perde/view/v1", seed)`, `K_view = k_view·G` |
| Meta-address | `"perde:" + base58(K_spend ‖ K_view ‖ sha256(K_spend ‖ K_view)[0..4])` |
| Viewing key | `"perdeview:" + base58(K_spend ‖ k_view ‖ checksum4)` |
| Receipt | `"perdereceipt:" + base64url(JSON{v, meta, r, stealth, tx?})` |

## 3. Paying a meta-address

Sender:

1. Pick a random scalar `r`; `R = r·G` (the ephemeral public key).
2. `S = r·K_view`.
3. `h = H512s("perde/stealth/v1", S)`.
4. `P = K_spend + h·G`. The stealth account id is `hex(P)`.
5. `view_tag = sha256("perde/tag/v1" ‖ S)[0]`.
6. Call `perde-pay.testnet.send({stealth_account: hex(P), ephemeral_pk: hex(R), view_tag})` with deposit `amount + announce_fee`. The contract stores the announcement and transfers `amount` to `hex(P)` in the same transaction.

Recipient (or anyone holding the viewing key):

1. For each announcement compute `S = k_view·R`; skip if the view tag differs (255 of 256 foreign announcements are rejected after one scalar multiplication and one hash).
2. Compute `P` as above and compare with the announced stealth account.

Spending (recipient only): `p = (k_spend + h) mod L`, and `p·G = P`. `p` is a raw scalar, not an ed25519 seed, so transactions are signed with scalar EdDSA: `nonce = H512s("perde/nonce/v1", p ‖ M)`, `R_sig = nonce·G`, `k = SHA-512(R_sig ‖ P ‖ M) mod L`, `s = nonce + k·p`. The signature `(R_sig, s)` verifies under standard ed25519, which is what NEAR validators run.

## 4. Invoices (no announcement)

`r_i = H512s("perde/invoice/v1", k_view ‖ u32be(i))`, then steps 2–4 of §3. The recipient derives invoice account `i` alone and hands the 64-hex account id to the payer. The payer needs no Perde software: any wallet, exchange withdrawal or cross-chain swap that can pay a NEAR account works. The recipient finds payments by checking balances of invoice accounts `0, 1, 2, …` with a gap limit of 20.

## 5. Receipts

A sender who kept `r` can prove a payment went to a given meta-address: the verifier recomputes `R = r·G` and `P` from the meta-address and checks them against the on-chain announcement. A receipt reveals that one stealth account belongs to that meta-address. It grants no spending power.

## 6. What is and is not private

| Hidden from a public observer | Public |
| --- | --- |
| Which meta-address (or registered name) was paid | The paying account |
| That two payments went to the same recipient | The amount and the time |
| The recipient's other accounts and balances | That the Perde contract was used |
| | The destination of a claim |

Perde hides the **recipient**, not the flow of funds. It is weaker than shielded pools or confidential transfers, which also hide amounts.

## 7. Threat model

| Threat | Outcome |
| --- | --- |
| Observer tries to link a payment to a recipient | Requires solving a Diffie–Hellman problem on ed25519 without `k_view` or `r`. |
| Recipient claims to their named account | Links the stealth account to that name. The app warns before this. Claim to a fresh account, or pay onward from the stealth account, to avoid it. |
| Timing and amount correlation | Claiming immediately, or claiming a distinctive amount to a known account, can deanonymise a payment. This is user behaviour the protocol cannot prevent. |
| Viewing key leaks | The holder sees every past and future incoming payment and invoice. They cannot spend. There is no rotation; a new identity is required. |
| Sender misbehaves | The sender knows whom they paid and can publish a receipt. Perde does not protect the recipient from the sender. |
| Malicious or buggy contract | The contract never custodies funds: `send` forwards the amount in the same transaction. It has no owner or admin methods. The deployer still holds a full-access key on `perde-pay.testnet` and could redeploy code; funds already in stealth accounts are out of the contract's reach. |
| Announcement spam | Each announcement costs the sender at least `announce_fee + min_amount` (0.012 NEAR). Spam slows scanning linearly; view tags keep the per-announcement cost low. |
| Malicious RPC node | Can censor or lie about announcements and balances (a payment may appear missing). Cannot forge signatures or redirect a claim. The client supports several RPC URLs. |
| Browser compromise / XSS | Keys live unencrypted in `localStorage` in this prototype. Anyone with access to the browser profile controls the funds. |
| Side channels | Scalar arithmetic in the JavaScript implementation is not constant-time. |
| DAO payouts | The proposal and vote are public; the proposer knows the recipient. The demo DAO lets anyone approve and exists only for demonstration. |

## 8. Status

Research prototype. Unaudited. Testnet only. NEAR Intents quotes are dry runs; no cross-chain payment has been executed with real funds by this project, and whether the 1Click route delivers native NEAR or wNEAR to an implicit account is unverified.
