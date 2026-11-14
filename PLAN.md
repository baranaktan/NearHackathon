# PLAN — Perde: private payments on NEAR

Son tarih: 2026-11-14 23:59 UTC. İç hedef: 18:00 UTC.

## 1. Ürün

Perde, NEAR'da alıcının kimliğini gizleyen ödemeler sağlar. Alıcı tek bir **meta-adres** yayınlar; her ödeme, yalnızca alıcının bulup harcayabildiği taze bir **stealth hesaba** gider. Stealth hesap sıradan bir NEAR implicit account'tur (64 hex = ed25519 açık anahtar), bu yüzden havuz, relayer ve indexer gerekmez.

Akışlar:
1. **Receive**: anahtar üret (12 kelime), meta-adresi paylaş, isteğe bağlı olarak `alice.testnet` adına kaydet.
2. **Send**: meta-adrese ya da kayıtlı hesap adına gönder → kontrat `send` çağrısı (duyuru + transfer atomik).
3. **Scan & claim**: duyuruları tara, bulunan stealth hesapları listele, istenen adrese süpür (işlemi stealth anahtar tarayıcıda imzalar, gas'ı kendi öder).
4. **Invoice**: duyurusuz tek kullanımlık adres + ödeme linki; "herhangi bir zincirden öde" paneli NEAR Intents 1Click `dry` quote gösterir.
5. **Auditor / receipt**: viewing key ile salt-okunur görünüm; gönderenin ödeme kanıtı (receipt) tarayıcıda zincire karşı doğrulanır.
6. **Batch (payroll)**: CSV → tek işlemde çok sayıda `send` action'ı.
7. **Demo modu**: faucet ile geçici testnet hesapları; cüzdan gerekmez.

## 2. Protokol (Perde v1)

Eğri ed25519; `L` grup mertebesi; `G` baz nokta; skalerler little-endian 32 bayt; noktalar sıkıştırılmış 32 bayt. `H512s(tag, ...)` = SHA-512(tag ‖ veri) → 64 bayt → mod L.

- Mnemonic: BIP-39 12 kelime → `seed` (64 bayt, boş parola).
- `k_spend = H512s("perde/spend/v1", seed)`, `k_view = H512s("perde/view/v1", seed)`; `K_* = k_* · G`.
- Meta-adres: `"perde:" + base58(K_spend ‖ K_view ‖ sha256(K_spend ‖ K_view)[0..4])`.
- Viewing key: `"perdeview:" + base58(K_spend ‖ k_view ‖ checksum4)`.
- Gönderim: rastgele `r`; `R = r·G`; `S = r·K_view`; `h = H512s("perde/stealth/v1", S)`; `P = K_spend + h·G`; `view_tag = sha256("perde/tag/v1" ‖ S)[0]`; stealth hesap = `hex(P)`.
- Tarama: `S = k_view·R`; tag eşleşirse `P` hesaplanır ve duyurudaki hesapla karşılaştırılır.
- Harcama anahtarı: `p = (k_spend + h) mod L`. İmza: skalerle EdDSA (`nonce = H512s("perde/nonce/v1", p ‖ M)`, `Rsig = nonce·G`, `k = SHA512(Rsig ‖ P ‖ M) mod L`, `s = nonce + k·p`) → standart ed25519 doğrulamasından geçer.
- Fatura `i`: `r_i = H512s("perde/invoice/v1", k_view ‖ u32be(i))`, sonrası gönderimle aynı (alıcı kendi kendine "gönderir"). Tarama `i = 0..` gap limit 20.
- Receipt: `"perdereceipt:" + base64url(JSON{v:1, meta, r(hex), stealth, tx?})`; doğrulama: `r·G` ve türetilen `P` duyuruyla/hesapla eşleşir.

## 3. Kontrat arayüzü (`contracts/perde`, Rust near-sdk 5)

Sahipsiz, admin metodu yok.

| Metod | Tür | Argümanlar (JSON) | Davranış |
| --- | --- | --- | --- |
| `send` | payable | `{stealth_account: string(64 hex), ephemeral_pk: string(64 hex), view_tag: number}` | `deposit ≥ announce_fee + min_amount` olmalı; duyuruyu kaydeder, `deposit − announce_fee` kadarını stealth hesaba transfer eder; NEP-297 olayı yayar. |
| `get_announcements` | view | `{from_index: number, limit: number}` (limit ≤ 200) | `[{index, stealth_account, ephemeral_pk, view_tag, amount: string(yocto), timestamp_ms: number}]` |
| `announcement_count` | view | — | `number` |
| `register` | payable | `{meta_address: string}` | Çağıranın hesabına meta-adres yazar (depolama için küçük depozito, fazlası iade). |
| `unregister` | call | — | Kaydı siler, depozitoyu iade eder. |
| `get_meta_address` | view | `{account_id: string}` | `string \| null` |
| `get_config` | view | — | `{announce_fee: string, min_amount: string, version: string}` |

Dağıtım bilgisi: `deployments/testnet.json` → `{ "network": "testnet", "contractId": "...", "deployTx": "...", "deployedAt": "..." }`.

## 4. Klasör yapısı

```
contracts/perde/        Rust kontrat + unit testler
packages/core/          @perde/core: kripto, kodlamalar, NEAR RPC/tx, 1Click istemcisi (saf TS, Vitest)
apps/web/               Vite + React + TS SPA
scripts/                deploy, demo-testnet, demo video kaydı
e2e/                    Playwright testleri (masaüstü + mobil), axe
deployments/            testnet.json
evidence/               gerçek çıktı örnekleri (tx linkleri, dry quote JSON)
demo/                   demo.webm, demo.mp4, ekran görüntüleri
docs/                   notlar, araştırma, JURY_LOG, SUBMISSION_DRAFT
```

npm workspaces (`packages/*`, `apps/*`). Node ≥ 22.

## 5. Milestone'lar

### M1 — Uçtan uca iskelet (paralel)

| Görev | Model | Kabul kriterleri | Test |
| --- | --- | --- | --- |
| T1 `packages/core` kripto + kodlamalar + skaler imzalayıcı + NEAR tx/RPC + kontrat istemcisi + 1Click istemcisi | opus | Bölüm 2'deki bütün türetmeler; gönder→tara→harca özelliği testle kanıtlı; skaler imza `@noble` standart doğrulamasından geçer; typecheck + lint temiz | Vitest (birim + özellik testleri), testnet entegrasyon testi ayrı komut |
| T2 Kontrat + testnet deploy | opus | Bölüm 3 arayüzü birebir; unit testler; wasm build; testnet'e deploy; `deployments/testnet.json`; gerçek bir `send` tx'i ve view çıktısı `evidence/` altında | `cargo test`, testnet smoke |
| T3 Web kabuğu + tasarım sistemi + landing | opus | Vite app derlenir; marka (logo SVG, renk, tipografi), layout, landing, sayfa iskeletleri; mobil uyumlu; lint/typecheck temiz | build + ekran görüntüsü |

### M2 — Temel özellikler

| Görev | Model | Kabul kriterleri |
| --- | --- | --- |
| T4 Web akışları: demo modu, anahtar yönetimi, send, scan, claim, register | opus | Demo modunda faucet hesabıyla gerçek testnet üzerinde gönder→tara→claim tarayıcıda çalışır; tx explorer linkleri; hata durumları |
| T5 `scripts/demo-testnet.mjs` + testnet entegrasyon testi | sonnet | `npm run demo:testnet` sırsız çalışır, tx linkleri basar |

### M3 — "Vay" detayları

| Görev | Model | Kabul kriterleri |
| --- | --- | --- |
| T6 Invoice + 1Click "pay from any chain" paneli (dry quote) | opus | Fatura linki; gerçek dry quote; QR; açık "preview" etiketi |
| T7 Auditor görünümü + receipt doğrulama | sonnet | Viewing key ile salt-okunur liste; receipt doğrulama sayfası |
| T8 Batch payroll (CSV, tek işlemde çok action) | sonnet | CSV → tek tx, satır başına sonuç |
| T10 DAO'dan gizli ödeme (SputnikDAO `sputnikv2.testnet`): demo DAO oluştur, `FunctionCall` önerisi kontratın `send` metodunu çağırır, oylama sonrası ödeme stealth hesaba düşer | opus | Testnet'te gerçek DAO + öneri + onay tx linkleri; arayüzde "Pay from a DAO" akışı; `social` track kanıtı |
| T9 Cüzdan bağlama (`@hot-labs/near-connect`) | sonnet | Gerçek testnet cüzdanıyla send; çalışmazsa kaldırılır (stub bırakılmaz) |

### M4 — Test, doküman, demo, jüri

Bağımsız test ajanı (temiz klon), Playwright E2E (masaüstü + mobil), axe, Lighthouse, `npm audit`, sır taraması, README / DEMO.md / demo videosu, jüri turları (`docs/JURY_LOG.md`), push.

## 6. Test stratejisi

- `npm test`: çevrimdışı, deterministik (core Vitest + web bileşen testleri).
- `cargo test`: kontrat unit testleri.
- `npm run test:testnet`: canlı testnet entegrasyonu (faucet + kontrat).
- `npm run test:e2e`: Playwright; zincir çağrıları gerçek testnet'e gider, 1Click dry quote gerçek API'ye.
- `npm run lint`, `npm run typecheck`, `npm run build`.
