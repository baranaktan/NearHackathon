# NEAR Core Tech Reference (dogrulanmis, 2026-11-14)

Kaynak turleri: [CANLI] = bu makineden canli endpoint/registry cagrisi ile dogrulandi; [DOC] = resmi dokumandan okundu; [ONERI] = benim yorumum.
Hicbir islem imzalanmadi, token harcanmadi, global kurulum yapilmadi. Sadece public read-only GET/dry-quote cagrilari yapildi.

---------------------------------------------------------------------
## A. NEAR Intents / 1Click API
---------------------------------------------------------------------

### A.1 Temel bilgiler
- Docs: https://docs.near-intents.org/ (LLM index: https://docs.near-intents.org/llms.txt, her sayfanin `.md` surumu var)
- Base URL (1Click): `https://1click.chaindefuser.com` (prefix `/v0`)
- OpenAPI (CANLI okundu, 1.9 MB): https://1click.chaindefuser.com/docs/v0/openapi.yaml
- Explorer API base: `https://explorer.near-intents.org/api/v0` ; OpenAPI: https://explorer.near-intents.org/api/v0/openapi.yaml
- Partner dashboard (API key): https://partners.near-intents.org
- Verifier kontrati: `intents.near` (mainnet). Repo: https://github.com/near/intents
- **Testnet YOK** ("There is no testnet version of NEAR Intents" - SDK sayfasi).
- Agent skill (LLM'e 1Click ogretir): `npx skills add near/agent-skills --skill near-intents` (repo near/agent-skills, `skills/near-intents`). [DOC] Henuz calistirmadim; bu bir 3. parti prompt/skill indirir, kurmadan once icerigi oku.

### A.2 Auth - ONEMLI DUZELTME
- OpenAPI guvenlik semalari: `X-API-Key` header ("recommended"), `Authorization: Bearer <JWT>` ("legacy, use X-API-Key instead"). Partner dashboard'dan alinan ayni token iki sekilde de calisiyor [DOC authentication.md].
- **Anahtar OLMADAN da calisiyor** (dry quote ve /tokens test edildi) ama:
  - Anahtarsiz: her non-ANY_INPUT quote'a **+0.25% (25 bps)** eklenir (senin dedigin 0.2% degil; 0.2% = anahtarli standart partner ucreti).
  - Anahtarli, appFees yok: 0.20% (20 bps); USDC/USDT/DAI ciftleri ve ayni-asset multichain rotalarinda 0.01% (1 bp).
  - `appFees` ile: 1Click payi min 20 bps, geri kalani 50/50 bolusum. Ornek `fee: 40` -> sen 20 bps.
  - Protokol ucreti 0.0001% `intents.near` tarafindan; near-intents.org UI'si +0.2%. Cekim ucreti: NEAR/ZEC/STRK->Solana 0.1%. [DOC fees.md]
- Authenticated sadece su endpointler anahtar ister: Explorer API (JWT zorunlu, **partner basina 5 sn'de 1 istek**, 429), kullanici bakiye/gecmis endpointleri (User-Session token: cuzdanin bos intent imzalamasi).
- `/v0/tokens` anahtarsiz. `/v0/quote`, `/v0/status`, `/v0/deposit/submit` OpenAPI'de security: X-API-Key veya JWT listeli; anahtarsiz dry quote 201 dondu [CANLI].

### A.3 Endpointler (OpenAPI'den)
| Method | Path | Amac |
|---|---|---|
| GET | `/v0/tokens` (`?ondoTokens=`) | Desteklenen token listesi |
| POST | `/v0/quote` | Quote (dry:true = deposit adresi uretmez) |
| POST | `/v0/deposit/submit` | Yatirma tx hash'i bildir (opsiyonel, hizlandirir) |
| GET | `/v0/status?depositAddress=...&depositMemo=...` | Swap durumu (404: adres bulunamadi) |
| GET | `/v0/any-input/withdrawals` | ANY_INPUT cekimleri (sadece yetkili partner) |
| POST | `/v0/generate-intent` | Imzalanacak intent payload uret (type `swap_transfer`; standard nep413/erc191/...) |
| POST | `/v0/submit-intent` | Imzali intent'i gonder (`signedData`) |
| POST | `/v0/auth/authenticate`, `/v0/auth/refresh` | Kullanici oturumu (User-Session JWT) |
| GET | `/v0/account/balances`, `/v0/account/history` | Kullanici verisi (User-Session) |
| POST/GET | `/v0/orders`, `/v0/orders/{id}/cancel` ... | Limit orders |
| GET | Explorer: `/api/v0/transactions` (cursor pagination), `/api/v0/partner-any-quotes` | Isleme gecmisi (JWT, 1 req/5sn) |

IntentStandardEnum: `nep413, erc191, raw_ed25519, webauthn, ton_connect, sep53, tip191`.

### A.4 Token listesi [CANLI]
```
curl -s https://1click.chaindefuser.com/v0/tokens
```
231 token, su an. Zincir basina adet: near 36, eth 29, sol 23, base 18, bsc 16, aptos 13, arb 7, op 6, avax 6, hood 6, pol 9, gnosis 9, ... + btc, doge, xrp, zec, ltc, bch, dash, sui, ton, tron, stellar, cardano, starknet, aleo, monad, plasma, bera, xlayer, scroll, adi, fogo, movement, miden, hypercore vb.
Ornek (trimmed):
```json
[{"assetId":"nep141:wrap.near","decimals":24,"blockchain":"near","symbol":"wNEAR","price":3.41,"priceUpdatedAt":"2026-11-13T23:27:30.799Z","contractAddress":"wrap.near","coingeckoId":"wrapped-near"},
 {"assetId":"nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1","decimals":6,"blockchain":"near","symbol":"USDC","price":0.999466,"contractAddress":"1720862...133a1"}]
```
Asset id formati: `nep141:<token-contract>` (NEAR yerli) ya da `nep141:<chain>-<contract>.omft.near` (bridge'lenmis, ornek `nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near` = USDC ETH, `nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near` = USDC SOL, `nep141:usdt.tether-token.near` = USDT NEAR). Her zaman `/v0/tokens`'dan `assetId`'yi kopyala; tahmin etme. Miktarlar en kucuk birim (integer string; "0.01" gecersiz).

### A.5 Quote istegi - alanlar
Zorunlu: `dry, swapType, slippageTolerance (bps; 100=1%), originAsset, depositType, destinationAsset, amount, refundTo, refundType, recipient, recipientType, deadline (ISO)`.
Opsiyonel: `depositMode (SIMPLE|MEMO; Stellar vb. MEMO), appFees [{recipient, fee(bps)}], referral, quoteWaitingTimeMs, connectedWallets, sessionId, confidentiality (public|basic|advanced), insured (+0.02%), customRecipientMsg (deneysel, fon kaybi riski), virtualChain*`.
- depositType: `ORIGIN_CHAIN` (orijin zincirde deposit adresi), `INTENTS` (intents icindeki hesaba), `CONFIDENTIAL_INTENTS`.
- recipientType: `DESTINATION_CHAIN | INTENTS | CONFIDENTIAL_INTENTS`. refundType: `ORIGIN_CHAIN | INTENTS | CONFIDENTIAL_INTENTS`.

### A.6 Swap tipleri
- `EXACT_INPUT`: amount = girdi. Deposit < amountIn -> deadline'da iade; deposit fazlaysa swap yapilir, fazla `refundTo`'ya iade.
- `EXACT_OUTPUT`: amount = cikti sabit; slippage girdi tarafina uygulanir (`amountIn` > `minAmountIn`); fazla girdi iade. Deposit < minAmountIn -> iade.
- `FLEX_INPUT`: kismi/degisken deposit kabul; slippage hem in hem out'a.
- `ANY_INPUT`: sadece yetkili partnerlar (fee aggregation).

### A.7 GERCEK dry quote [CANLI, anahtarsiz, HTTP 201]
Istek (1 wNEAR -> NEAR-USDC):
```bash
curl -s -X POST https://1click.chaindefuser.com/v0/quote -H 'Content-Type: application/json' -d '{
 "dry":true,"swapType":"EXACT_INPUT","slippageTolerance":100,
 "originAsset":"nep141:wrap.near","depositType":"ORIGIN_CHAIN",
 "destinationAsset":"nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
 "amount":"1000000000000000000000000",
 "refundTo":"example.near","refundType":"ORIGIN_CHAIN",
 "recipient":"example.near","recipientType":"DESTINATION_CHAIN",
 "deadline":"2026-11-15T00:00:00Z"}'
```
Yanit (trimmed):
```json
{"quote":{"amountIn":"1000000000000000000000000","amountInFormatted":"1.0","amountInUsd":"3.41",
  "minAmountIn":"1000000000000000000000000","amountOut":"3400287","amountOutFormatted":"3.400287",
  "amountOutUsd":"3.398529","minAmountOut":"3366284","timeEstimate":22,"refundFee":"0","withdrawFee":"4265"},
 "quoteRequest":{"dry":true,"depositMode":"SIMPLE","swapType":"EXACT_INPUT", "...":"...",
  "appFees":[{"recipient":"5880ad2b...47dd","fee":20}]},
 "signature":"ed25519:27L94as...","timestamp":"2026-11-13T23:29:17.604Z","correlationId":"d5ddaf3a-..."}
```
Dry yanitta `depositAddress`, `deadline`, `timeWhenInactive` YOK. Gozlem: anahtarsiz istekte sunucu `appFees` icine kendi 20 bps kaydini koymus (toplam kesinti bu ucret tablosuna gore).
**Gercek (dry:false) yanit** ek alanlar: `quote.depositAddress`, `depositMemo` (varsa), `deadline`, `timeWhenInactive`. `signature` ve tum quote'u sakla (anlasmazlik cozumu icin).

### A.8 Deposit akisi
1. `GET /v0/tokens` -> assetId sec.
2. `POST /v0/quote` (`dry:false`) -> `depositAddress` (+`depositMemo`).
3. Orijin zincirde o adrese `amount` kadar gercek transfer yap (cuzdan/agent). Swap deposit gelince baslar.
4. (Opsiyonel) `POST /v0/deposit/submit` `{"txHash":"...","depositAddress":"...","nearSenderAccount":"(NEAR ise)","memo":"(varsa)"}`.
5. `GET /v0/status?depositAddress=...` poll. Durumlar: `PENDING_DEPOSIT, KNOWN_DEPOSIT_TX, PROCESSING, SUCCESS, INCOMPLETE_DEPOSIT, REFUNDED, FAILED`. Yanit: `status, updatedAt, swapDetails{intentHashes, nearTxHashes, originChainTxHashes, destinationChainTxHashes, amountIn/Out, refundedAmount, refundReason, depositedAmount}`.
Alternatif (agent icin cok temiz): `depositType: INTENTS` + `/v0/generate-intent` -> NEP-413 imzala -> `/v0/submit-intent` (deposit adresine zincir tx'i gerekmez; fonlar zaten intents.near icinde).

### A.9 Iade / zaman
- `deadline`: "kullanici iadesinin basladigi an" - swap o zamana kadar bitmezse iade baslar. Orijin zincirin tx suresinden uzun olmali (BTC ~1 saat).
- `timeWhenInactive`: adres "soguk" olur, sonra isleme daha uzun surer. `deadline` sonrasi adrese yatirirsan **fon kaybi riski** (OpenAPI: "funds may be lost").
- Tavsiye: cross-chain icin 15 dk'ya kadar bekle [DOC going-live]. `quote.timeEstimate` (sn) ornekte 22.
- Iade: `refundTo` adresine, `refundFee` kesilerek. Eksik deposit -> `INCOMPLETE_DEPOSIT` -> deadline'da `REFUNDED`.
- Minimumlar: BNB Chain $1000 (orijin veya hedef), Tron $100 (orijin); digerleri yok. Altinda HTTP 400 "Temporary swap limits". Bazen "Amount is too low for bridge". Intents'e/den deposit-withdraw muaf. [DOC swap-limits]
- Rate limit 1Click icin yayinlanmamis.

### A.10 SDK'lar (npm, [CANLI] versiyonlar)
- `@defuse-protocol/one-click-sdk-typescript` **0.1.26** (2026-09-22). Go: `github.com/defuse-protocol/one-click-sdk-go`. Rust: `one-click-sdk-rs` (git).
  Akis: `OpenAPI.BASE='https://1click.chaindefuser.com'; OpenAPI.TOKEN=<key>` -> `OneClickService.getTokens()`, `getQuote({...})`, `submitDepositTx`, `getExecutionStatus(depositAddress)`. (Sinif/isim detaylari docs sayfasinda tam verbatim yoktu; repo README'den dogrula.) HTTP ile dogrudan fetch de cok kolay.
- `@defuse-protocol/intents-sdk` **0.98.0** (2026-11-12). `new IntentsSDK({referral, intentSigner: createIntentSignerNearKeyPair({signer: KeyPair.fromString(...), accountId})})`, `sdk.signAndSendIntent({intents:[...]})` -> `intentHash`; `sdk.processWithdrawal({withdrawalParams:{assetId, amount: 1000000n, destinationAddress, feeInclusive:false}})`. Deposit desteklemez.
- React widget: https://docs.near-intents.org/integration/devkit/react-widget.md (okunmadi).

### A.11 Verifier kontrati `intents.near` ve NEP-413
- Intent turleri: `add_public_key, remove_public_key, transfer, ft_withdraw, nft_withdraw, mt_withdraw, native_withdraw, storage_deposit, token_diff` (+ `swap/transfer` tipleri 1Click tarafindan uretilir).
- Payload: `{signer_id, verifying_contract, deadline(ISO), nonce, intents[]}`; imza sarmali (NEP-413):
```json
{"standard":"nep413","payload":{"recipient":"intents.near","nonce":"<base64 32 byte>",
 "message":"{\"deadline\":\"2025-05-21T10:34:04.254392Z\",\"intents\":[{\"intent\":\"transfer\",\"receiver_id\":\"bob.near\",\"tokens\":{\"nep141:usdc.near\":\"10\"}}],\"signer_id\":\"alice.near\"}"},
 "public_key":"ed25519:...","signature":"ed25519:..."}
```
- Nonce: 32 bayt base64; ilk 4 bayt = kontratin guncel **salt**'i (`current_salt` view method, ornek "252812b3"; periyodik doner), kalan 28 bayt hesap basina benzersiz, tekrar kullanma.
- `execute_intents` imzali intent dizisi alir (tam arg semasi docs'ta verilmemis); `simulate_intents` ile once simule et (https://docs.near-intents.org/integration/verifier-contract/simulating-intents.md - okunmadi).
- NEP-413 imzalama (agent): tam dokuman NEP-413 spec'te: payload = borsh({message, nonce[32], recipient, callback_url?}) ; imzalanacak = sha256( u32_le(2147484061) prefix [= 2^31+413] || borsh payload ); ed25519 ile imzala. [ONERI: elle yazmak yerine `near-api-js` `signMessage` veya intents-sdk `createIntentSignerNearKeyPair` kullan.] Agent anahtari `add_public_key` ile hesaba kayitli olmali ya da implicit hesabin kendi anahtari olmali.

### A.12 Explorer/status
- Swap durumu: `/v0/status` (yukarida). Genel: Explorer API (JWT + 1 req/5sn). UI: https://explorer.near-intents.org

### A.13 Testnet yok -> en ucuz guvenli demo [ONERI]
1. `GET /v0/tokens` + **`dry:true` quote** (anahtarsiz, bedava, calisiyor) -> UI'da fiyat/cikti/slippage/sure goster. Hackathon demosu icin %90 yeterli.
2. Gercek akis gerekiyorsa: NEAR-ici bir cift (wNEAR->USDC, ayni zincir, `nep141:...`), ~$0.1-1; BNB ($1000) ve Tron ($100) minimumlarindan kacin. Kisa `deadline` (10-15 dk), `refundTo` kendi hesabin.
3. Non-dry quote bile para harcamaz (sadece adres uretir); para sadece sen gonderince gider.
4. Agent'a harcama tavani kodla (max amount, allowlist asset/recipient), manuel onay modu.

---------------------------------------------------------------------
## B. Chain Signatures (MPC)
---------------------------------------------------------------------
- Docs: https://docs.near.org/chain-abstraction/chain-signatures , impl: .../implementation
- Kontratlar: **mainnet `v1.signer`**, **testnet `v1.signer-prod.testnet`**. [CANLI] ikisi de RPC'de yanit veriyor; kontrat surumu `version` view: mainnet 3.18.0 (rpc.mainnet.near.org) / testnet 3.19.0. `public_key` view testnet'te `secp256k1:...` donuyor.
- `sign` cagrisi (chainsig.js kaynak kodundan dogrulandi):
```js
functionCall('sign', { request: { payload_v2: { Ecdsa: "<32-byte hash hex>" } /* veya { Eddsa: hex } */, path: "ethereum-1", domain_id: 0 /* 0=secp256k1, 1=ed25519 */ } },
             300_000_000_000_000n /* 300 Tgas */, 1n /* 1 yoctoNEAR */)
```
  Yanit: tx'in son sonucu (imza; `responseToMpcSignature` ile r,s,v). Deposit: **1 yoctoNEAR** (`getCurrentSignatureDeposit()` = 1). Eski dokumanlardaki "0.25 NEAR" artik gecerli degil; ama kendi kontratindan cagiriyorsan callback gas'i ve MPC ucreti icin ~0.1 NEAR ekle (docs tutorial).
  Eski `key_version`/`payload` alan adlari chainsig.js README ornegindedir; kontrat artik `payload_v2` + `domain_id` kullaniyor (chainsig.js kodu).
- Egriler: secp256k1 (`domain_id 0`, keyType `Ecdsa`: EVM, Bitcoin, XRP, Cosmos), ed25519 (`domain_id 1`, `Eddsa`: Solana, Sui, Aptos, TON, Stellar).
- Derivation: adres = f(NEAR account id, `path` string (orn. `ethereum-1`), MPC master pubkey). Ayni hesap+path hep ayni adres. Zincir basina farkli path kullan (replay izolasyonu). Chain Signatures **sadece giden** (outbound); dis zincir durumunu okumak icin Omnibridge/Read RPC.
- JS: **`chainsig.js` 1.1.16** (2026-05-12; CommonJS projesi! ESM'de sorun cikarabilir; bagimliliklar `@near-js/*` 2.2.x, viem, bitcoinjs-lib, @solana/web3.js...). `near-ca` 0.12.1 (2025-10, eski, bakimsiz gorunuyor). Docs ornegi wallet baglantisi icin `@hot-labs/near-connect` + chainsig.js kullaniyor. Ornek repo: https://github.com/near-examples/near-multichain
```ts
import { chainAdapters, contracts } from "chainsig.js";
const contract = new contracts.near.ChainSignatureContract({ networkId:"testnet", contractId:"v1.signer-prod.testnet", accountId, keypair });
const evm = new chainAdapters.evm.EVM({ publicClient, contract });
const { address } = await evm.deriveAddressAndPublicKey(accountId, "ethereum-1");
const { transaction, hashesToSign } = await evm.prepareTransactionForSigning({ from, to, value: 1n });
const sigs = await contract.sign({ payloads: hashesToSign, path: "ethereum-1", keyType: "Ecdsa", signerAccount });
```
  (Docs'taki iki varyant: wallet ile `signerAccount:{accountId, signAndSendTransactions}`; README keypair varyantinda eski `payload/key_version` imzasi gorunuyor - 1.1.16 ile `payloads/keyType` kullan, gerekirse .d.ts'e bak.)
- Testnet guvenilirligi: kontrat canli ve surum guncel; dis-zincir testnetleri (Sepolia faucet vb.) asil darbogaz. Imza gecikmesi tipik birkac sn - dakika; kesin SLA yayinlanmamis. https://mpc.nearone.org canli operator durumu.

---------------------------------------------------------------------
## C. Hesap modeli ve JS kutuphaneleri
---------------------------------------------------------------------
### C.1 Access key'ler [DOC access-keys]
- Function-call key: `receiver_id` (tek kontrat), `method_names` (opsiyonel, bos=hepsi), `allowance` (opsiyonel; bos = sinirsiz gas!). NEAR transfer/deposit **ekleyemez**. Allowance bitince key olur; allowance sonradan degistirilemez (yeni key ekle). `AddKey` ile allowance 0 -> her tx `NotEnoughAllowance`.
- Sadece FC key'li hesap NEAR gonderemez, key yonetemez. Full-access key = tam yetki (asla paylasma).
- Agent icin desen [ONERI]: ana hesap (full access, soguk) + agent'a kendi uretilmis FC key (receiver = senin kontratin, method allowlist, kucuk allowance); degeri hareket ettiren isler kontrat icinde limitli.
- Alt hesaplar: `agent.alice.testnet` - ust hesap olusturur; named account testnet'te faucet ile ucretsiz. Implicit hesap = 64 hex pubkey.
- Meta tx (NEP-366): istemci `SignedDelegate` imzalar (gas harcamaz), relayer `Action::Delegate` ile gonderir ve gas oder; deposit istemciden. near-api-js >=7.4 ile `account.createSignedMetaTransaction({receiverId, actions, blockHeightTtl})` ve `relayer.relayMetaTransaction(signedDelegate)`; wire format: borsh+base64. Cuzdanlar delegate imzalamayi desteklemeli (normal tx/NEP-413 yerine gecmez). Detay: https://docs.near.org/web3-apps/tutorials/meta-transactions.md
- Global contracts: kodu bir kez yayinla, hesaplar referansla kullanir. `near contract deploy-as-global use-file X.wasm as-global-account-id <acc> network-config testnet sign-with-keychain send`; kullanim `near contract deploy <acc> use-global-account-id <id> without-init-call ...` veya `use-global-hash`. Maliyet: yayin **10 NEAR / 100KB (yakilir)**; kullanan hesap <0.001 NEAR. Hackathon icin gereksiz.

### C.2 JS SDK durumu [CANLI npm]
| Paket | Surum | Not |
|---|---|---|
| `near-api-js` | **7.5.3** (2026-11-11) | Saf ESM (`"type":"module"`), **Node >=22.22.2**, bagimliliklar borsh 2, @noble/* 2.x, @scure/base 2.x. Docs "API Libraries" sayfasinda ilk sirada. v7 ile `provider.callFunction`, `account.callFunction({contractId, methodName, args, gas, deposit})`, `account.transfer({token: NEAR, amount: NEAR.toUnits("0.1"), receiverId})`, `teraToGas`, `nearToYocto` yardimcilari. Senin Node 24.11 uygun. |
| `@near-js/*` (accounts, signers, providers, client, crypto...) | 2.5.1 (2025-11-06) | Modular paketler; `@near-js/client` artik ayri guncellenmiyor gorunuyor; chainsig.js hala 2.2.x'e bagli. Yeni projede near-api-js 7'yi kullan. `@near-js/wallet-account` 1.3.3 eski. |
| `near-kit` | 0.20.2 (CANLI; docs `near-api-js` ile yan yana gosteriyor) | Topluluk (r-near) ama docs'ta resmi olarak listelenmis; cok kisa API: `new Near({network:"testnet"})`, `near.view(c,m,args)`, `near.call(c,m,args,{gas:"30 Tgas"})`, `near.send(to,"0.1 NEAR")`, `near.transaction(id).addKey(pk,{type:"fullAccess"}).send()`. Hizli prototip icin cazip. |
| `near-api-ts` | 0.13.0 (2026-11-09) | Yeni TS kutuphanesi, 0.x, riskli. |
| `near-api` (Rust) 0.8.7, `near-kit` (Rust) | | Rust tarafi. |
| `@near-wallet-selector/*` | core 10.1.4 (2025-12) | **Docs artik "DEPRECATED, kullanma" diyor**. |
| `@hot-labs/near-connect` | **0.12.0** (2026-10-26) | **Docs'un onerdigi**; sifir bagimlilik, sandbox iframe cuzdanlar (HOT, Meteor, Nightly, WalletConnect, +10). Repo: https://github.com/azbang/near-connect |
- Breaking (v6->v7 pratikte): ESM-only, Node 22.22.2+, borsh 2, yeni `Account`/`provider.callFunction` API'si, `KeyPair` `@near-js/crypto`'dan; eski `connect()/keyStores` ornekleri cogunlukla gecersiz. Eski blog/StackOverflow kodlarina guvenme.
- Wallet baglantisi (docs verbatim ozet):
```ts
import { NearConnector } from "@hot-labs/near-connect";
const connector = new NearConnector({ network: "testnet" });
connector.on("wallet:signIn", ({wallet, accounts}) => {});
const wallet = await connector.connect();               // modal
const [{accountId}] = await wallet.getAccounts();
await (await connector.wallet()).signAndSendTransaction({ receiverId:"hello.near-examples.testnet",
  actions:[{ type:"FunctionCall", params:{ methodName:"set_greeting", args:{greeting:"Hi"}, gas:"30000000000000", deposit:"0" } }] });
await wallet.signMessage({ message:"login", recipient:"your-app.near", nonce: Buffer.from(crypto.randomUUID()) }); // NEP-413
```
  Kurulum: `npm install @hot-labs/near-connect near-api-js`. (nonce NEP-413 icin 32 bayt olmali; docs ornegi UUID ile - gercek kullanimda 32 rastgele bayt uret.) Sunucu tarafi dogrulama icin docs: https://docs.near.org/web3-apps/backend/backend.md (okunmadi).

---------------------------------------------------------------------
## D. Akilli kontrat toolchain'i (Windows odakli)
---------------------------------------------------------------------
Bu makinede (CANLI): Node v24.11.0, npm 11.6.1, rustc/cargo 1.91.1, hedefler `wasm32-unknown-unknown` + `wasm32v1-none` + `x86_64-pc-windows-msvc` kurulu, git var, **Docker YOK**, `near` CLI YOK, `cargo-near` YOK.

- **near-sdk (Rust)** crates.io **5.30.2** (2026-11-13). **cargo-near 0.23.0**. `near-workspaces` 0.24.0, `near-sandbox` 0.4.1.
- **near-sdk-js: DEPRECATED** (repo arsivlendi, README "DEPRECATED - DO NOT USE", son npm 2.0.0 Haziran 2024). JS ile kontrat yazma; Rust kullan. (Windows'ta build'i zaten test etmeye deger degil.)
- **cargo-near build:** `cargo near build non-reproducible-wasm` Docker GEREKTIRMEZ (varsayilan; yerel rustc kullanir). `reproducible-wasm` ve `cargo near deploy` Docker ister -> Windows'ta Docker'siz kullanma. Cikti: `target/near/<name>.wasm`.
- Kurulum yollari (guvenlik kurallarina uygun, `iwr|iex` YOK):
  - `cargo install --locked cargo-near` (kaynaktan derler, ~birkac dk; MSVC build tools gerekir - rust-msvc hedefi kurulu oldugundan buyuk olasilikla var). Cargo bin dizini kullanici profilinde; arac onbellegi sayilir. [ONERI: bu yol]
  - veya proje icine: `npm install cargo-near` (README'de "prebuilt binaries into Node.js app"; postinstall binary indirir) -> `npx cargo-near ...`.
  - Docs'un `cargo-near-installer.ps1 | iex` yontemini KULLANMA (kural 4).
- **near CLI:** `near-cli-rs` npm **0.31.1** (2026-11-05); `bin: near`, postinstall GitHub release'ten binary indirir. Proje-ici: `npm i -D near-cli-rs` ve `npx near ...`. (Docs sayfasi `npm install -g` + `irm|iex` onerir; global kurma.) Henuz bu makinede calistirip Windows'ta dogrulamadim -> "dogrulanmadi".
- Testnet hesap + faucet (tarayicisiz):
  `near account create-account sponsor-by-faucet-service <ad>.testnet autogenerate-new-keypair save-to-keychain network-config testnet create` (kisa: `near create-account <ad>.testnet --useFaucet --networkId testnet`). Docs not: headless/WSL'de keychain kaydi basarisiz olabilir. Windows'ta `save-to-keychain` = Credential Manager (kayit defteri degil ama sistem deposu); `save-to-legacy-keychain` ise `~/.near-credentials` (proje DISI dosya) yazar. Kural 1/2 icin [ONERI]: `autogenerate-new-keypair print-to-terminal` secenegiyle anahtari al, `.env`'e koy ve JS tarafinda `KeyPair.fromString` ile imzala; ya da hesabi near-kit/near-api-js ile faucet hesabindan olustur. (`print-to-terminal` secenegi near-cli-rs menusunde var; tam sozdizimini `near account create-account sponsor-by-faucet-service --help` ile dogrula.)
  Faucet alternatifleri: https://near-faucet.io/ , https://faucet.circle.com/ (20 USDC / 2 saat, NEAR testnet), docs sayfasindaki dahili faucet (`/getting-started/faucet`).
- Deploy: `near contract deploy <acc> use-file ./target/near/x.wasm with-init-call init json-args '{...}' prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send` (veya `--networkId testnet` kisa form). `sign-with-keychain` yerine `sign-with-private-key` secenegi vardir (CLI help'ten dogrula).
- **Sandbox/test:** `near-sandbox-rs` README: "MacOS (ARM64) or Linux (x86) for sandbox execution" ve near-workspaces-rs: "MacOS (x86 and M1) or Linux (x86)". **Native Windows'ta sandbox calismaz** (WSL gerekir). JS `near-workspaces` 5.0.0 (2025-03) ve `near-sandbox` npm 0.3.5 de ayni kisit. -> Windows'ta `cargo test` ile sandbox entegrasyon testi YAPMA; unit test (saf Rust) + dogrudan testnet'e deploy.
- `cargo near new <ad>` iskelet olusturur (reproducible metadata ile geliyor; `non-reproducible-wasm` ile build et).

### RPC [DOC providers + CANLI]
- Mainnet: `https://free.rpc.fastnear.com` (CANLI calisiyor, limit yayinlanmamis), `https://rpc.mainnet.near.org` (CANLI calisiyor, surum 3.18.0), `https://rpc.ankr.com/near` (~30 rps), `https://near.drpc.org`, `https://rpc.intea.rs`, `https://api.zan.top/near-mainnet` (~20 rps). Archival: `https://archival-rpc.mainnet.near.org` ("severely rate limited").
- Testnet: `https://test.rpc.fastnear.com` (CANLI), `https://rpc.testnet.near.org` (CANLI calisiyor, 3.19.0), `https://near-testnet.drpc.org`, `https://testnet-rpc.intea.rs`, `https://api.zan.top/near-testnet`.
- **rpc.testnet.near.org / rpc.mainnet.near.org**: docs provider tablosundan cikarilmis (sadece archival listeli), ama bugun hala yanit veriyor; guvenme, FastNEAR'i birincil, digerini failover yap. nearcore JSON-RPC batch desteklemez. FastNEAR docs: tek API key RPC+REST icin (Bearer veya `?apiKey=`); anahtarsiz free endpoint calisiyor ama limit belirsiz.

---------------------------------------------------------------------
## E. Veri / indexer API'leri (anahtarsiz)
---------------------------------------------------------------------
- **FastNEAR API** (CANLI): `GET https://api.fastnear.com/v1/account/{id}/full` (NEAR bakiye, FT, NFT, staking tek yanit), `/v1/account/{id}/ft`, `/nft`, `/staking`; public-key -> hesap; docs: https://docs.fastnear.com/api . Anahtarsiz 200 dondu. Tx API (`/tx/...`: account, transactions, receipt, blocks) ve neardata (`/neardata/last-block-final` vb.) docs'ta; host adlarini https://docs.fastnear.com sayfalarindan dogrula (okunmadi). Limit yayinlanmamis; anahtar dashboard'dan.
- **NearBlocks API**: **v1/v2, 22 Kasim 2026'da KAPANIYOR** (response header `sunset: Sun, 22 Nov 2026`, `deprecation` basligi, link: https://api.nearblocks.io/api-docs/migration). **v3'u kullan**: `https://api.nearblocks.io/v3/stats`, `/v3/accounts/{id}` (CANLI, anahtarsiz 200). v3 sema: sonuc `data` altinda, cursor pagination (`limit`, `next/prev`), `signer/receiver`. Testnet sadece v3. Auth: `Authorization: Bearer <key>` (anahtarsiz kullanimin rate limiti yayinlanmamis; migration notu "key stays the same"). Intents aktivite ve chain-signature verisi v3'te yeni. Docs: https://api.nearblocks.io/api-docs/
- **Pikespeak**: https://api.pikespeak.ai/docs (docs'ta listeli; anahtar gerektirir, `api.pikespeak.ai/` 404 verdi - bu tur kullanmadim). Anahtarsiz seçenek degil [ONERI: atla].
- Diger: Goldsky, The Graph, Indexer.xyz, BigQuery Public Lakehouse, SubQuery (docs data-services listesi; hepsi hesap/anahtar ister). NEAR Intents icin ayrica Explorer API (JWT).
- Hizli yol: bakiye/pozisyon -> FastNEAR API; tx gecmisi -> NearBlocks v3; canli swap durumu -> 1Click `/v0/status`.

---------------------------------------------------------------------
## Okunamadi / dogrulanamadi
---------------------------------------------------------------------
- https://docs.near-intents.org/integration/distribution-channels/1click-api/swap-types.md , `reusable-deposit-addresses.md`, `confidential-swaps.md`, `signed-intent-execution.md`, `quickstart/making-a-request.md`, `verify-quote-signature.md`, `simulating-intents.md`, `account-abstraction.md`, `resources/chain-support.md`, `faqs.md`: acilmadi (OpenAPI'den esdegeri okundu). SDK sayfasinin tam kod bloklari ozetlendi, birebir degil -> repo README'sine bak.
- `one-click-sdk-typescript` sinif/metot adlari repo'dan dogrulanmadi.
- NEP-413 imza algoritmasi spec'ten okunmadi (hafizadan, "ONERI" etiketli); https://github.com/near/NEPs/blob/master/neps/nep-0413.md ile dogrula.
- near-cli-rs / cargo-near'in bu Windows makinesinde gercekten kurulup calistigi dogrulanmadi (kurulum yasak degil ama gorev "yalniz arastirma"). `near-sdk` 5.x surum notlari / breaking degisiklikler okunmadi.
- docs.near.org/tools/near-api.md sayfasinin son 25k karakteri (function-call key ekleme, delegate ornekleri) okunamadi.
- Chain Signatures docs'unda "sign deposit" acik yazilmiyor; 1 yoctoNEAR chainsig.js kaynak kodundan; testnet'te gercek `sign` cagrisi YAPILMADI. `experimental_signature_deposit` view'i her iki aginda yok (MethodNotFound).
- Pikespeak, FastNEAR tx/neardata host adlari ve limitleri; 1Click rate limitleri yayinlanmamis.
- docs.near.org/web3-apps/backend/backend.md (NEP-413 sunucu dogrulama) okunmadi.
