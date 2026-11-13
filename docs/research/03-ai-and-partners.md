# 03 - NEAR AI + Partner Ecosystem Reference (verified 2026-11-14)

Kaynak: canli dokumanlar (docs.near.ai, docs.market.near.ai, app.outlayer.ai, docs.near.org, GitHub) + dogrudan `GET` ile gercek API cevaplari (anahtarsiz, sadece okuma). Hicbir hesap acilmadi, odeme yapilmadi, hicbir anahtar kullanilmadi.

> **KRITIK TARIH:** `nearai/near-hackathon-prompt-examples` README'sine gore hackathon: basla 2026-11-01 00:00 UTC, **gelistirme/submission biter 2026-11-14 23:59 UTC**, judging 16-18 Kasim. Oduller NEAR ile. 13 track: defi, thesis, privacy, business, swarms, security, agents, realworld, games, nfts, memecoins, social, open. README'ye gore **Claude Code ve Codex AI juri**; README'yi makine okuyucu icin ("do X, see Y") yaz. Canli kurallar: nearhackathon.com / HACKATHON.md (okunmadi, bkz. Okunamadi). "~20 saat" varsayimini submission saatiyle dogrula.

---

## 1. NEAR AI Cloud

- Docs: https://docs.near.ai/ (llms.txt: https://docs.near.ai/llms.txt; sayfalar `https://docs.near.ai/cloud/<sayfa>.md`). Dashboard: https://cloud.near.ai (GitHub/Google login).
- **OpenAI uyumlu: EVET.** Base URL: `https://cloud-api.near.ai/v1`. Auth: `Authorization: Bearer <API_KEY>`.
- OpenAPI: `https://cloud-api.near.ai/api-docs/openapi.json` (indirdim, ~350KB), interaktif: `https://cloud-api.near.ai/docs`.
- Endpointler (OpenAPI'den dogrulandi): `POST /v1/chat/completions`, `POST /v1/responses` (stateless, `store:false` zorunlu), `GET /v1/models` (**anahtarsiz herkese acik**), `GET /v1/attestation/report`, `GET /v1/signature/{chat_id}`, `GET /v1/attestation/pins`, `GET /v1/attestation/ita-token`; ayrica embeddings/rerank/image/audio/messages (Anthropic Messages) vb. (~200 endpoint). Streaming, tool calling, structured outputs: `supported_features` ile model basina ilan ediliyor.
- Quickstart (Python, dokumandan):
```python
import openai
client = openai.OpenAI(base_url="https://cloud-api.near.ai/v1", api_key=KEY)
r = client.chat.completions.create(model="z-ai/glm-5.3-flash",
    messages=[{"role":"user","content":"Hello, NEAR AI!"}])
print(r.choices[0].message.content)
```
  Reasoning modellerde cevapta `reasoning_content` alani var; `usage.completion_tokens_details.reasoning_tokens`. Cevapta `X-Request-Id` header'i.
  JS: `new OpenAI({baseURL:"https://cloud-api.near.ai/v1", apiKey:process.env.NEARAI_API_KEY})` (standart openai paketi).

### Model listesi (canli `GET /v1/models`, 2026-11-14, fiyat USD / 1M token in/out)
`is_ready:false` olanlar listede ama hazir degil - KULLANMA. Asil "TEE'de ozel (NEAR fleet)" modeller = acik agirlikli olanlar (GLM/Qwen/DeepSeek/Kimi/gpt-oss tarzi); `anthropic/*`, `openai/*`, `google/*`, `x-ai/*` gateway uzerinden proxy (SDK bunlar icin `e2ee=False` diyor; TEE-icinde calistigi iddia edilmemeli - gateway imzasi sadece "gateway'in gordugu byte'lari" kanitlar).

| id | in/out $ | ctx | features |
|---|---|---|---|
| z-ai/glm-5.3-flash | 0.08 / 0.5 | 1.05M | tools, structured, reasoning, json |
| z-ai/glm-5.3 | 1.8 / 5.75 | 1.05M | tools, reasoning |
| Qwen/Qwen3.8-27B | 0.04 / 1.35 | 262k | tools, structured, reasoning |
| Qwen/Qwen3.6-35B-A3B-FP8 | 0.17 / 1.1 | 262k | tools, json, structured, logprobs, reasoning |
| Qwen/Qwen3-VL-30B-A3B-Instruct | 0.15 / 0.55 | 16k | structured (vision) |
| Qwen/Qwen3-Embedding-0.6B, Qwen3-Reranker-0.6B | 0.01 | 41k | embed/rerank |
| deepseek-ai/DeepSeek-V4.1-Flash-1017 (+ deepseek/deepseek-v4.1-flash) | 0.3 / 1.2 | 1.05M | tools, reasoning |
| moonshotai/kimi-k3 | 3.3 / 16.5 | 1.05M | tools, json, structured, reasoning |
| moonshotai/kimi-k2.6 | 0.81 / 3.85 | 262k | tools, structured |
| moonshotai/kimi-k3.1-pro | 2 / 10 | 1M | (feature listesi bos) |
| x-ai/grok-4.6, grok-4.7 | 2 / 6 | 500k | tools, structured, reasoning |
| anthropic/claude-haiku-5-5 | 0.1 / 0.5 | 1M | tools, structured, reasoning |
| anthropic/claude-sonnet-5 / sonnet-5-5 | 2 / 10 | 1M | tools, structured, reasoning |
| anthropic/claude-opus-5 / opus-5-5 | 5/25 ; 4/20 | 1M | tools, structured, reasoning |
| anthropic/claude-fable-5, -5-1, -5-2 | 10/50, 10/50, 8/40 | 1M | tools, structured, reasoning |
| openai/gpt-5.6-luna / gpt-5.6-sol | 0.2/1.2 ; 4/20 | 1.05M | tools, json, structured, logprobs, reasoning |
| openai/gpt-6-luna, gpt-6-sol, gpt-6.1-sol, gpt-6-astra | 0.1/0.5 ; 2/10 ; 2/10 ; 10/50 | 1.05M | structured, json, reasoning (tools: yok ilan) |
| google/gemini-3.8-flash | 0.75 / 3.75 | 1M | (bos) |
| black-forest-labs/FLUX.2-klein-4B | 1/1 | | image gen |
| openai/whisper-large-v3 | 0.01 | | audio transcription |
| openai/privacy-filter | 0.01 | 128k | PII classify/redact |
| typesafe/jev-1.13 | 0.042 | 32k | "System One" structured decisions |

Dokuman ornekleri: `zai-org/GLM-5.1-FP8` (quickstart; canli listede YOK - eski), `z-ai/glm-5.3-flash` (SDK ornegi, en ucuz tool-destekli TEE modeli). Her zaman `GET /v1/models` ile dogrula; ids buyuk/kucuk harfe duyarli (`Qwen/...`).

### Fiyat / kredi
- Pay-as-you-go; dashboard > Credits > Add credits. Staking ile kredi de var (https://docs.near.ai/cloud/staking-for-inference/overview.md) - saatler icinde pratik degil.
- **"$10 kredi / nearbuilders.org/join": DOGRULANAMADI.** nearbuilders.org/join sayfasi kredi/talimat icermiyor (sadece Connect/login). Bulunan: docs.near.org hackathon sayfasi "request NEAR AI Cloud credits" Notion formuna yonlendiriyor (https://www.notion.so/Requesting-NEAR-AI-Cloud-Credits-2deda22d7b6481aea8e1e30282efcb5e - icerik fetch ile okunamadi, JS-render); gecmis bir hackathon icin kupon yontemi: cloud.near.ai login (GitHub/Google) > Credits > Add credits > coupon (onceki etkinlikte $5). Adimlar: (1) cloud.near.ai'ye GitHub ile gir, (2) Credits sekmesi, (3) Notion formundaki/Discord'daki kupon kodunu gir, (4) API Keys > olustur, (5) `.env` icine `NEARAI_API_KEY`. Kupon icin NEAR Discord/hackathon kanalina yaz; onay gerekebilir (kullanabilirligi dogrulayamadim).
- Kredi gelmezse en ucuz yol: `z-ai/glm-5.3-flash` ($0.08/$0.5) - birkac dolar yeter.

### TEE attestation / dogrulanabilir inference
Mimari (docs.near.ai/cloud/private-inference): Istek -> `cloud-api.near.ai` gateway (kendi TEE'sinde, Intel TDX/dstack) -> model TEE (Intel TDX + NVIDIA confidential GPU H100/H200). Imza yoksa cevap "response-verified" sayilmaz.

**Endpointler (OpenAPI'den):**
- `GET /v1/attestation/report` - API key OPSIYONEL. Query: `model`, `signing_algo` (`ecdsa`|`ed25519`), `nonce` (64 hex), `signing_address`, `include_tls_fingerprint` (bool), `provider` (`near`|`chutes`|`tinfoil`; verilmezse ilk basarili kaynak). Faturalanmaz.
  Cevap: `gateway_attestation` {`signing_address`, `signing_algo`, `intel_quote` (hex TDX quote), `event_log`, `report_data`, `request_nonce`, `info`(dstack app info), `tls_cert_fingerprint?`, `vpc?`}, `model_attestations[]` (model basina: quote, gpu_evidence, e2e_pubkey, nonce...), `ohttp_key_config`, `ohttp_attestation`. `report_data` son 32 byte = nonce; `include_tls_fingerprint=true` ise ilk 32 byte = SHA256(signing_address || tls_cert_fingerprint).
  **Canli test:** `GET /v1/attestation/report?signing_algo=ecdsa` (anahtarsiz) 200 dondu, gateway_attestation geldi (signing_address 0xb98a...). `?model=z-ai/glm-5.3-flash&provider=near...` ve `Qwen/Qwen3.8-27B` cagrilarinda **503 "count_timeout"** aldim (flaky/yuk altinda) -> demo icin retry + onceden cache'le.
- `GET /v1/signature/{chat_id}?model=...&signing_algo=...` (chat completion id veya `resp_*`). Cevap: `{text, signature, signing_address, signing_algo, signature_kind}`. `signature_kind="provider_tee"`: `text = "{model_id}:{request_hash}:{response_hash}"` (model TEE'sinde imzali). `"gateway"`: `text = "{request_hash}:{response_hash}"` (gateway TEE'si imzaladi; **modelin TEE'de calistigini KANITLAMAZ**). Imza chat bittikten ~3 sn sonra hazir olabilir (resmi test script'i 3sn bekliyor); stream kopmussa "unavailable".
- Dogrulama adimlari (docs/cloud/verification): (1) once gateway attestation al (taze nonce), TDX quote'u dogrula (dcap-qvl / Intel Trust Authority `GET /v1/attestation/ita-token`), report_data baglamasini (signing key + nonce) kontrol et; (2) model icin `model=<canonical id>&provider=near` ile attestation al, DONEN HER aday icin dogrula (NVIDIA NRAS GPU kaniti: GPU challenge = SHA256(nonce + e2e_pubkey)); (3) completion'i ayni canonical model id ve `x-no-aliasing: true` header ile gonder, istek/cevap byte'larini AYNEN sakla; (4) `/v1/signature/{id}` cek, `request_hash`/`response_hash` = byte'larin SHA256'sini hesapla ve `text` ile karsilastir, ECDSA imzasindan signer'i recover et (== attestation'daki signing_address); (5) policy: kabul edilen Intel TCB durumlari (varsayilan UpToDate+OutOfDate), compose hash == quote mr_config, Sigstore provenance. **Tum raporlarda ve imzada ayni `signing_algo`'yu acikca ver** (default'a guvenme).
- **Hazir kutuphaneler:**
  - JS: `@nearai/inference-sdk` (npm, **v0.3.0**, 2026-11-08; Node >= 24.22.1 isteniyor!). 
```js
import { InferenceClient } from '@nearai/inference-sdk/node';
const client = new InferenceClient({ baseUrl:'https://cloud-api.near.ai/v1', apiKey:process.env.NEARAI_API_KEY, e2ee:true });
const c = await client.chat.completions.create({ model:'z-ai/glm-5.3-flash', messages:[{role:'user',content:'Hello'}] });
const receipt = await client.verifyResponse(c.id);   // streaming: once tum stream'i tuket
console.log(receipt.signatureKind, c.choices[0].message.content);
```
    `/node` girisi gateway TLS peer'i dogrular; tarayici girisi dogrulayamaz (fetch TLS cert'i okuyamaz). Kayitlar 60 dk sonra expire. E2EE sadece NEAR vLLM modelleri icin (GLM/Qwen/DeepSeek...), anthropic/openai icin `e2ee:false`. `ohttp:true` opsiyonel.
  - Python: `pip install nearai-inference-sdk` (Python 3.12+): `async with InferenceClient(key, e2ee=True) as c: comp = await c.chat.completions.create(model="z-ai/glm-5.3-flash", messages=[...]); v = await c.verify_response(comp.id)`. Ayrica Rust, Go SDK.
  - Referans dogrulayici: https://github.com/nearai/nearai-cloud-verifier (Python 3.10+/TS Node 20+): `py/model_verifier.py --model ...`, `py/chat_verifier.py`, `pnpm run model|chat|tls|domain`. GPU (NRAS), TDX (dcap-qvl), report-data, compose, signature, TLS, Sigstore dogruluyor. Env: `API_KEY`.
  - Tarayici UI: https://cloud.near.ai/verify (Verification Center) ve gomulebilir widget (`nearai/inference-widget`, docs: cloud/inference-sdk/widget/embedded.md). Hackathon demosu icin en hizli "verified" rozeti.
  - Direct completions (`{slug}.completions.near.ai`) deneysel, onerilmiyor.
- Kisit/tuzaklar: model attestation 503'leri; proxy modeller TEE degil; `/v1/responses` stateless; yonetim endpointlerinin bir kismi "cloud-platform base URL'ine tasiniyor"; `is_ready:false` modeller; SDK'nin Node 24.22.1 sarti (yerel Node surumunu kontrol et; yoksa ham `fetch` + elle hash/recover yaz).
- Ek: `near-ai-cloud` agent skill (`npx skills add near/agent-skills --skill near-ai-cloud`), `nearai/near-hackathon-prompt-examples` (track prompt'lari).
- Hemen kullanilabilir mi: EVET (kredi sartiyla). Onay/waitlist yok; login + kredi.

---

## 2. Agent Market (market.near.ai)

- Docs: https://docs.market.near.ai/ (llms.txt mevcut), OpenAPI: https://market.near.ai/openapi.json, API ref: https://market.near.ai/docs/, agent-readable guide: https://market.near.ai/skill/SKILL.md.
- Model: USD veya USDC ile (birbirine donusmez) is ilanlari. Is turleri: **Instant** (belirli ajan, aninda atama), **Standard** (acik bid; alici bir veya daha cok bid'i award eder), **Competition** (odul havuzu, 80+ puan alan girislere bolunur). Award -> butce alicinin bakiyesinden **escrow**'a gider. Teslim -> alici accept / request changes / dispute. Sessizlik = 3 gun (max 7) sonra otomatik accept. Dispute reddedilirse iade. Platform ucreti **%5**. Dispute deposit %5 (min 0.01).
- Durumlar: job `open, filling, in_progress, completed, closed`; assignment `in_progress, submitted, accepted, disputed, dispute_resolved, cancelled`.
- **Ajan listeleme (list-your-agent, ~10 dk):** gereken: market.near.ai hesabi + onayli e-posta (Google girisi sayilir). (1) Building > Your agents > New agent: ad, handle, tagline, Hosting=**Self-hosted**, webhook bos; (2) fiyat/hire + Delivery SLA (fiyatsiz live olmaz); (3) "Create token" -> `aat_...` (bir kez gorunur); (4) is dongusu; (5) **Test run (ucretsiz, para hareketi yok)** `market.near.ai/a/<handle>` > Test run; (6) Listing status = Live -> `<handle>.market.near.ai`.
- API (base `https://market.near.ai`, `Authorization: Bearer aat_...`):
  - `GET /v1/agents/me/assignments` (yeni hire: `startedAt:null`, brief `job.description`)
  - `POST /v1/assignments/{id}/start` (isten ONCE cagir; yoksa alici tam iade ile iptal edebilir; idempotent)
  - `POST /v1/assignments/{id}/messages` `{"body":"..."}` (1-4000 kar.)
  - `POST /v1/assignments/{id}/submit` `{"deliverableMarkdown":"..."}` (<=256KiB; buyuk dosya icin `POST /v1/files`)
  - Bid: `GET /v1/jobs/board?kind=standard`, `POST /v1/jobs/{id}/bids` `{"amount":"5.00","proposal":"...","slaSeconds":7200}`, `GET /v1/agents/me/bids?live=true`, `POST /v1/bids/{id}/withdraw` (is basina tek bid).
  - Webhook (opsiyonel): `X-Market-Event/Delivery/Timestamp/Signature` (`sha256=` HMAC-SHA256 `"<ts>.<raw body>"`, secret `whsec_`, >=32 kar.), olaylar `hire.created`, `hire.changes_requested`, `message.created`, `hire.accepted`, `hire.refunded`, `hire.disputed`...; polling'i yine de tut.
  - Minimal Node dongusu dokumanda (fetch + setInterval 60sn); assignment ornek cevap: `{assignments:[{assignment:{assignmentId,jobId,status,escrowAmount:"5.0000",escrowToken:"USD",slaSeconds,slaDeadlineAt,startedAt,submittedAt,deliverableUrl,bidId},job:{jobId,title,description,tags,status},latestMessage}]}`.
- **MCP:** `https://market.near.ai/mcp` (alici = OAuth, ajan = `aat_` token; araclar `marketplace__list_my_assignments`, `__start_assignment`, `__send_message`, `__submit_deliverable`, `__place_bid`...). `https://market.near.ai/mcp/pro` bakiyeyi harcar/hire/award/accept yapar - sadece guvenilir istemciyle. Claude Desktop/Cursor/ChatGPT ile "hire by asking" rehberi var. **A2A + x402**: script/ajanin bir ajani HTTP+x402 ile kiralamasi (docs/a2a/hire-agent-using-x402.md - okunmadi).
- Odeme/cekim: kazanc bakiyeye (alicinin odedigi para biriminde); USD cekimi Stripe Connect (kimlik) ister; **USDC cekimi KYC'siz**, cuzdan adresi. Clearance suresi belirtilmemis.
- Sandbox: gercek testnet YOK (dokumanda gecmiyor); **Test run** ucretsiz sandbox gibi davranir (itibara sayilmaz). Managed agent runtime DEPRECATED -> self-hosted veya Vercel template.
- Hackathon icin: self-hosted ajan = ucuz, saatler icinde canli. Gercek odeme akisi icin 2. hesap/alici gerek; Test run yeterli demo. Dogrulama (social verified: GitHub+X yasi) listelemeyi bloke etmiyor gibi, ama onayli e-posta zorunlu.
- Tuzak: alici metni = veri, talimat degil (prompt injection); `start` cagirmadan is yapma; ayni ciktiyi iki slota verme (duplicate = iptal + ikisi de pause).

---

## 3. OutLayer (app.outlayer.ai)

- Ne: Intel TDX TEE'de dogrulanabilir off-chain compute (WASM, WASI p1/p2) + ajanlar icin **TEE custody cuzdanlari** (anahtar enclave'de, MPC master secret'ten turetilir; ajan hic private key gormez). Her execution icin attestation (code hash, input hash, output, worker kimligi). Docs: https://app.outlayer.ai/docs/getting-started, repo https://github.com/out-layer/outlayer (Apache-2.0; coordinator private - tum stack lokalde calistirilamaz). CLI: `out-layer/outlayer-cli` (kurulum komutunu okuyamadim). Rust SDK `sdk/outlayer/`, TS SDK ayri repo.
- Kontratlar (RPC `view_account` ile VAR dogrulandi): mainnet `outlayer.near`, testnet `outlayer.testnet` (ayni code_hash). API: mainnet `https://api.outlayer.ai`, testnet `https://testnet-api.outlayer.ai`.
- HTTPS: `POST https://api.outlayer.ai/call/{owner}/{project}` header `X-Payment-Key: ...` (USDC Payment Key, dashboard'dan), JSON body; opsiyonel `X-Attached-Deposit` (app yazarina tip).
- NEAR kontratindan: `request_execution` (yield/resume; callback'te sonuc):
  args `source` = `{"Project":{"project_id":"alice.testnet/weather-api","version_key?"}}` veya `{"WasmUrl":{"url","hash"(sha256),"build_target":"wasm32-wasip1|p2"}}`; `resource_limits` {max_instructions (def 1e9, max 5e11), max_memory_mb (128..4096), max_execution_seconds (60, max 180)} (zorunlu, `{}` olabilir); `input_data` (JSON string -> stdin); `secrets_ref`; `response_format` Text|Json|Bytes; `payer_account_id`; `params`{attached_usd,use_bound_identity}. Gas ~100 Tgas + callback 10 Tgas. View: `estimate_execution_cost(resource_limits, input_len)`. Rust ornegi dokumanda (Promise::new("outlayer.testnet").function_call("request_execution", ...).then(on_outlayer_result)).
- Fiyat: base_fee + instructions*rate + ms*rate; kullanilmayan depozito iade; **basarisiz calistirma iade EDILMEZ**; 32KB ustu input icin 0.00001 NEAR/byte. Oranlar sayfada yok (Stats sayfasi). Testnet: execution ve custody testnet'te var; **Intents (swap/deposit/withdraw) mainnet-only, testnet 503**.
- Agent Custody API (base `https://api.outlayer.ai`): `POST /register` (-> `wk_...` API key, bir kez; auth'suz tek endpoint - **hesap acar, ben cagirmadim**), `GET /wallet/v1/address|balance?chain=near|tokens|policy|audit`, `POST /wallet/v1/transfer {to,amount(yocto)}`, `/call`, `/intents/{swap,deposit,withdraw,transfer}`, `/evm/*`, `/solana/*`, `/sign-message` (NEP-413), `/limit-orders`, `/confidential/*`. Policy motoru (TEE'de zorlanir): islem basi limit, saatlik/gunluk/aylik cap, whitelist/blacklist, zaman penceresi, multisig onay esigi, freeze. Uyari: kumulatif cap'ler eszamanli isteklerde delinebilir; kisitlar sadece "dogrulanabilir" olanlar tek-islem limiti/whitelist/freeze.
- Hackathon: "AI ajan cuzdani + policy" icin en NEAR-native, anahtarsiz ajan hikayesi. Saatler icinde: `POST /register` (testnet) -> balance/transfer. WASM yazmak (Rust wasm32-wasip2) daha uzun surer. Onay/waitlist belirtilmemis; Payment Key icin USDC gerekebilir (mainnet).

---

## 4. Shade Agents / NEAR agent tooling

- **Shade Agent Framework DEPRECATED:** docs.near.org: "Do not use the Shade Agent Framework... not maintained since April 19, 2026." Eski repo `NearDeFi/shade-agent-js` ARSIVLI + "bilinen kritik zafiyetler, mainnet/prod'da kullanma". `NearDeFi/shade-agent-framework` repo'su archived DEGIL (son push 2026-10-14) ve README'sinde deprecation notu goremedim - docs.near.org ile celisiyor; **yeni projede kullanma**. Paketler: `@neardefi/shade-agent-js` (npm 2.5.1!), `@neardefi/shade-agent-cli`, `shade-attestation` crate; TEE icin Phala Cloud (`PHALA_API_KEY`) + Docker (macOS'ta kontrat build'i `pivortex/near-builder` konteynerinde), "local vs TEE modu" template'te var. Docker'siz tam akis = pratik degil; kontrat build'i + TEE deploy saatlerce.
- Guncel docs.near.org onerisi (https://docs.near.org/getting-started/tools-for-ai.md): `near-cli-rs` (`npm i -g near-cli-rs@latest` - **global kurulum yasak, `npx`/cargo binary kullan**), Agent Skills `npx skills add near/agent-skills` (near-ai-cloud, near-api-js, near-cli-rs, near-contract-audit, near-dapp, near-intents, near-kit, near-smart-contracts), Docs MCP `https://docs.near.org/mcp`, NEAR MCP server `github.com/nearai/near-mcp` (yerelde calisir, private key tutar; public hosted yok), testnet faucet (5 NEAR, tarayici).
- Chain Signatures (MPC): https://docs.near.org/chain-abstraction/chain-signatures.md ; `chainsig.js`, `omni-transaction-rs`. NEAR Intents: https://docs.near.org/chain-abstraction/intents/overview.md , https://docs.near-intents.org, 1Click API, ornek repo `near-examples/near-intents-examples`, x402 1Click gateway (pilot, "battle-tested degil").
- IronClaw: `nearai/ironclaw` (Rust agent OS, WASM sandbox; installer .msi/PS script; kaynak build Rust 1.96+, Node 22+; Postgres test icin). NEAR AI Cloud'da host edilen ajan. Worker: `nearai/openclaw-nearai-worker`.
- npm surumleri (bugun): near-api-js 7.5.3, @near-js/client 2.2.0, @near-js/accounts 2.5.1, @nearai/inference-sdk 0.3.0.
- Docker'siz yerelde: NEAR AI Cloud + OutLayer + Agent Market + near-api-js hepsi Docker'siz calisir. Shade agent'in TEE kismi calismaz (Phala + Docker).

---

## 5. Trezu + SputnikDAO

- **Trezu** (trezu.org, uygulama trezu.app; docs https://docs.trezu.org, repo `NEAR-DevHub/trezu-docs` = sadece docs sitesi; ayni icerik `docs.business.near.com` = "NEAR Business"): NEAR uzerinde non-custodial multisig hazine; roller **Governance / Requestor (teklif acar, oy veremez) / Finance (oy)**; public ve **confidential** (private shard) hazine; toplu odeme (payroll), 35+ zincir/150+ token swap (%0.70 ucret), Ledger, stake delegation, ucretsiz plan 1000 gas-sponsorlu islem/ay. Eski `*.sputnikdao.near` DAO'lar o hesapla login olunca acilabiliyor. **Public API/SDK dokumani YOK** (docs.trezu.org ve docs.business.near.com llms.txt'de yalnizca kullanici rehberleri). Entegrasyon = altindaki SputnikDAO kontratina dogrudan konusmak.
- **SputnikDAO v2** (`near-daos/sputnik-dao-contract`): RPC ile dogrulandi:
  - Mainnet factory: **`sputnik-dao.near`** (DAO'lar `<ad>.sputnik-dao.near`; `get_dao_list` calisiyor, cok sayida DAO). Ayrica `sputnikdao.near` hesabi var (eski/ayri kontrat).
  - Testnet factory: **`sputnikv2.testnet`** (kontrat kodu var, DAO'lar `<ad>.sputnikv2.testnet`, `get_number_daos` = 5664). `sputnik-dao.testnet` testnet'te KONTRATSIZ (code_hash 111..).
  - DAO olusturma: factory'de `create {name, args: base64(JSON{config:{name,purpose,metadata:""}, policy:[council hesaplari]})}`, ~6-10 NEAR attach (README ornegi `--amount 10`, gas 150 Tgas):
```bash
ARGS=$(echo '{"config":{"name":"mydao","purpose":"demo","metadata":""},"policy":["alice.testnet"]}' | base64 -w0)
near call sputnikv2.testnet create "{\"name\":\"mydao\",\"args\":\"$ARGS\"}" --accountId alice.testnet --amount 6 --gas 150000000000000
```
  - Teklif: `add_proposal {proposal:{description, kind:{Transfer:{token_id:"",receiver_id,amount}}}}` min deposit = `proposal_bond` (1 NEAR); `act_proposal {id, action:"VoteApprove"|"VoteReject"|"VoteRemove"|"Finalize"}`; views `get_proposal {id}`, `get_proposals {from_index,limit}`, `get_policy`, `get_last_proposal_id`. JS: `near-api-js`/`@near-js/accounts` `account.functionCall({contractId:"mydao.sputnikv2.testnet", methodName:"add_proposal", args:{...}, attachedDeposit: 1e24, gas: 100e12})`.
  - Teklif turleri (17): ChangeConfig, ChangePolicy, AddMemberToRole, RemoveMemberFromRole, FunctionCall, Transfer, SetStakingContract, UpgradeSelf, UpgradeRemote, FactoryInfoUpdate, AddBounty, BountyDone, Vote, ChangePolicy* (4 varyant).
  - Policy/rol modeli: roller `kind` = `Everyone | Group([...]) | Member(token)`; izinler `"<proposalKind>:<Action>"` joker destekli (`transfer:*`, `*:*`); actions AddProposal, RemoveProposal, VoteApprove, VoteReject, VoteRemove, Finalize, MoveToHub; `vote_policy` per proposal kind: `RoleWeight` esik `[1,2]` (%50) veya Weight; varsayilan roller `all` (`*:AddProposal`) ve `council` (hepsi). Varsayilan `proposal_period` 7 gun, `proposal_bond` 1 NEAR, `bounty_bond` 1 NEAR. Yani **bir ajan/AI "Requestor" gibi sadece AddProposal yetkisiyle** bir DAO'ya takilabilir, insanlar onaylar - guzel "human-in-the-loop" hikayesi.
- Saatler icinde: testnet'te DAO kur + ajan hesabini Requestor-benzeri role ekle (AddMemberToRole) + AI'nin Transfer teklifi acmasi. Yerel `near-cli-rs` veya near-api-js yeterli.

---

## 6. NEAR Business (docs.business.near.com)

Trezu ile ayni urun/dokuman: "cross-chain multisig for confidential digital assets", non-custodial, coklu uye. Sayfalar: Treasury, Confidential Treasuries, Login, Members & Roles, Voting Rules, Payments (single/bulk), Swap, Ledger, near.com ile fonlama. **API/SDK/programlanabilir yuzey YOK** (llms.txt'de gelistirici sayfasi yok). Programlanabilirlik = alttaki SputnikDAO + NEAR Intents. Hackathonda sadece kullanici olarak (tarayicida DAO kurup demo) veya SputnikDAO uzerinden entegre.

---

## 7. Kisa partner notlari

- **HOT (hotdao.ai):** Docs https://docs.hotdao.ai/ (llms.txt). **HOT Kit** `npm i @hot-labs/kit`: tarayicida `new HotConnector({connectors: defaultConnectors, apiKey})` (ucretsiz API key pay.hot-labs.org/admin/api-keys; Vite icin `vite-plugin-node-polyfills`), Node'da `@hot-labs/kit/core` + `@hot-labs/kit/near`: `NearWallet.fromPrivateKey(Buffer.from(PK,'hex'), SIGNER_ID)`, `wallet.fetchBalances()`, omni token transfer/withdraw, Google ile baglanma (WIP). HOT Omni Balance, HOT Bridge (omni tokenlar, `calculate-token-omni-address`), MPC wallet + MPC API (imza uretimi), OmniBridge + NEAR Intents uzerinde. Birkac saatte: cok zincirli bakiye/omni transfer UI'si veya MPC imzali islem. Dikkat: bircok sayfa WIP.
- **Rhea (rhea-finance/rhea-sdk-docs):** Ref SDK `@ref-finance/ref-sdk` (`init_env('testnet')`, `fetchAllPools`, `estimateSwap`, `instantSwap`, `getSignedTransactionsByMemoryKey`, `sendTransactionsByMemoryKey`; token-in kontratinda storage deposit sart, yoksa tutar kaybolur). SmartRouterV2 (AMM/Stable/ALMM/CLMM agregator) SDK'ya dahil degil, ayri entegre edilir. Cross-Chain lending SDK, Lending API (REST; endpointler listelenmemis, `burrow-sdk-python`). Swap API/CLI detayi okunamadi. Saatler icinde: `estimateSwap` ile quote + ajanin swap yapmasi (testnet ref.fakes token'lari). Rhea swap icin testnet/mainnet pool derinligini dogrula.
- **Aurora:** EVM (mainnet RPC `https://mainnet.aurora.dev`, chain id `1313161554`; testnet RPC/chain id okunamadi), Hardhat/MetaMask ile standart Solidity; **Aurora Virtual Chains** AuroraCloud.dev uzerinden ~30 sn'de kendi zincirin (gas/izin ozellestirme, Intents destegi); Aurora blog'u Shade Agents + Virtual Chains'i anlatiyor. Saatler icinde: Solidity kontrati Aurora'ya at, NEAR hesabiyla cross-contract cagri (Aurora<->NEAR bridge). Docs `https://doc.aurora.dev/` (docs.aurora.dev yonlendiriyor).
- **meme.cooking:** Fair-launch memecoin launchpad (NEAR). Gelistirici dokumani/API/repo BULAMADIM (site JS-render; arama sonuc vermedi). Entegrasyon = on-chain kontratlar/indexer'i tersine incelemek; "Memecoins With Mechanics" track'i icin kendi FT/mekanigini yazmak daha guvenli. Dogrulanamadi.
- **HEX interactive blocks:** Hicbir kaynak bulunamadi (arama "Hex" veri platformunu verdi, NEAR ile ilgisiz). Dogrulanamadi - organizatorlerden iste.
- **BRRRAIN:** brrrain.com domain'i GoDaddy'de satilik/parked; NEAR baglantisi dogrulanamadi. Kullanma.
- **GoMining:** NEAR ortakligi kaynaklarda yok (Solana genislemesi, GoBTC Pay, Uphold). Dogrulanamadi; resmi hackathon sponsor sayfasindan kontrol et.
- **SVRN:** (Nasdaq SVRN, SovereignAI) NEAR treasury + AI cloud; FastNEAR'i satin aldi (Ekim 2026) -> RPC/dev-data servisleri; Chain Signatures MPC operator agini kurmus. FastNEAR RPC/API (js.fastnear.com, neardata) gelistirici icin kolay: hizli RPC/indexer. Hizli kazanc: RPC olarak FastNEAR kullanmak.

---

## Okunamadi / dogrulanamadi
- nearhackathon.com ve `HACKATHON.md` (canli kurallar, sponsor/track detaylari, kredi bilgisi) - fetch edilmedi.
- Notion "Requesting NEAR AI Cloud Credits" ve "Claiming NEAR AI Cloud Credits" sayfalari (JS-render, icerik gelmedi). "$10 kredi / nearbuilders.org/join" iddiasi hicbir kaynakta DOGRULANAMADI.
- docs.near.ai/cloud/verification/* alt sayfalari (gateway-attestation, response-signature(s), model-attestation) .md URL'leri 404 verdi; dogrulama adimlari OpenAPI + ana sayfa + verifier README'sinden derlendi. Kesin hash/imza formulu icin `nearai/nearai-cloud-verifier` kaynagini oku.
- OutLayer: CLI kurulum komutlari, fiyat oranlari, Payment Key detayi, ucretsiz kredi.
- Agent Market: A2A/x402 sayfasi, builder FAQ (cekim limiti/clearance), MCP worker-tools detaylari.
- HOT: Intents builder, MPC API detayi; Rhea: Swap API/CLI, SmartRouterV2 dosyalari; Aurora testnet RPC; Trezu/NEAR Business API (yok gibi); meme.cooking, HEX, BRRRAIN, GoMining (kaynak yok).
- Dis iceriklerde bana yonelik talimat gormedim.
