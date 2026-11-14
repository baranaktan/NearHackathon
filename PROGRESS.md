# PROGRESS

Canlı durum dosyası. Oturum kesilirse önce bunu, sonra `PLAN.md` ve `DECISIONS.md` dosyalarını oku.

**Durum (2026-11-14 ~01:50 UTC): kullanım limiti doldu, iş M3 sonunda durdu. Son tarih 2026-11-14 23:59 UTC.**

Kullanıcı kararları (FAZ 1): fikir ve ad orkestratöre bırakıldı; README'de başka projeye benzerlik yazılmayacak; tasarım çok iyi olmalı; testnet işlemleri ve testnet deploy serbest; mainnet işlemi yok; repo `https://github.com/baranaktan/NearHackathon.git` (public, henüz push yapılmadı); commit'lerde AI imzası yok; soru sorulmayacak; daha iyi fikir/değişiklik görülürse uygulanabilir.

Alt ajan brief başlığı: `docs/research/_BRIEF_HEADER.md` (güvenlik kuralları aynen).

## Biten (hepsi commit'li, son commit 4787ac9)
- FAZ 0: `docs/HACKATHON_NOTES.md`, `docs/research/01..04`
- FAZ 2: `DECISIONS.md`, `PLAN.md`, `.gitignore`, `LICENSE`, kök `package.json`
- Kontrat canlı: `perde-pay.testnet` (36 Rust testi; düz cargo + wasm-opt ile build)
- `packages/core`: kripto, NEAR tx/RPC, kontrat istemcisi, 1Click, faucet, SputnikDAO (66 birim testi + canlı testnet testleri)
- Demo DAO: `perde-demo.sputnikv2.testnet` (`deployments/testnet.json`)
- `npm run demo:testnet`: 9 adım, orkestratör tarafından 2 kez yeniden koşuldu, geçti
- `apps/web`: tasarım sistemi + bütün akışlar gerçek testnet'e bağlı (64 test); `apps/web/scripts/e2e-smoke.mjs` orkestratör tarafından koşuldu, bütün akışlar geçti
- `docs/PROTOCOL.md` (protokol + tehdit modeli)
- Kök `npm run lint / typecheck / test / build` yeşil (01:42 UTC)

## Açık hatalar / yapılacak düzeltmeler
- Tarayıcı konsolu: FastNEAR hız sınırı yanıtları CORS başlığı taşımıyor → konsol hataları (akışlar dRPC'ye geçip başarıyla bitiyor). RPC çağrı sayısı azaltılmalı ya da birincil sağlayıcı değiştirilmeli.
- Core istekleri (T4 raporu): `NETWORKS.testnet.rpcUrls` içindeki `rpc.testnet.near.org` yerine `https://near-testnet.drpc.org`; RPC'de beklenmeyen HTTP durumlarında (422) failover; `send`/`sendBatch` için önceden türetilmiş stealth kabulü; `claim` tx hash'i.
- `apps/web/screenshots/wired/zz-failure.png` var: neyin hatası olduğu incelenmedi.
- Orkestratör, bağlanmış arayüzün ekran görüntülerini henüz gözle incelemedi.

## Sıradaki
- (İsteğe bağlı) stealth hesaptan doğrudan başka meta-adrese ödeme ("pay onward") arayüzü
- (İsteğe bağlı) T9 cüzdan bağlama
- FAZ 4: bağımsız test ajanı (temiz klon), Playwright E2E test paketi (masaüstü + mobil), axe, Lighthouse, `npm audit`, sır taraması (git geçmişi dahil)
- README (do X – see Y, mimari şeması, teknolojiler, ekran görüntüleri, AI yardımı ve kütüphane listesi), `DEMO.md`, `demo/demo.webm` (+ mp4), `docs/SUBMISSION_DRAFT.md` (X gönderisi taslağı + başvuru alanları)
- FAZ 5: jüri ajanı turları, `docs/JURY_LOG.md`
- `git push origin main` (kullanıcı izin verdi; force yok)

## Önemli kısıtlar
- Testnet faucet: IP başına ~12 saatte 10 hesap; ~3 kaldı. Testler önbellekteki hesapları kullanır (`packages/core/node_modules/.cache/perde-testnet/funder.json` ≈5 NEAR, `.cache/demo-account.json` ≈9.9 NEAR). `packages/core` içinde `npm ci` çalıştırma: funder önbelleğini siler.
- 1Click teslim varlığı `nep141:wrap.near`; yerel NEAR mı wNEAR mı geldiği doğrulanamadı → arayüzde ve dokümanda belirtiliyor.
- Deployer `perde-pay.testnet` ≈4.2 NEAR; kontrat depolaması için ≥3 NEAR kalmalı.

## Bitti tanımı
- [ ] Temiz kurulumdan README adımlarıyla çalışıyor (README henüz yok; temiz klon kurulumu T4 ajanı tarafından denendi)
- [ ] Bütün temel akışlar uçtan uca çalışıyor, bağımsız test ajanı onayladı (akışlar çalışıyor; bağımsız ajan henüz koşmadı)
- [ ] Bütün testler, build ve lint yeşil (şu an yeşil; FAZ 4 sonunda yeniden doğrulanacak)
- [ ] Bağımlılık taraması temiz, repoda gizli bilgi yok
- [ ] Hackathon gereksinimlerinin her biri karşılandı ve kanıtlandı
- [ ] Jüri değerlendirmesi tamamlandı, `docs/JURY_LOG.md` yazıldı
- [ ] README
- [ ] `DEMO.md`
- [ ] `demo/demo.webm`
- [ ] Deploy (hesap bilgisi verilmedi → yerel sürüm; README'de Vercel adımları)
