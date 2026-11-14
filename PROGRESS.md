# PROGRESS

Canlı durum dosyası. Oturum kesilirse önce bunu, sonra `PLAN.md` ve `DECISIONS.md` dosyalarını oku.

Kullanıcı kararları (FAZ 1): fikir ve ad orkestratöre bırakıldı; README'de başka projeye benzerlik yazılmayacak; tasarım çok iyi olmalı; testnet işlemleri ve testnet deploy serbest; mainnet işlemi yok; repo `https://github.com/baranaktan/NearHackathon.git` (public); commit'lerde AI imzası yok; soru sorulmayacak.

Alt ajan brief başlığı: `docs/research/_BRIEF_HEADER.md` (güvenlik kuralları aynen).

## Biten
- FAZ 0: `docs/HACKATHON_NOTES.md`, `docs/research/01..04`
- FAZ 2: `DECISIONS.md`, `PLAN.md`, `.gitignore`, git init

- T1 core (`packages/core`, 50 unit test + canlı testnet testi geçiyor) — commit a953a38
- T2 kontrat canlı: `perde-pay.testnet` (36 Rust testi; düz cargo + wasm-opt ile build, cargo-near bu makinede çalışmadı)

## Önemli kısıtlar
- Testnet faucet: IP başına ~12 saatte 10 hesap; ~5 kaldı. Testler önbellekteki hesabı kullanır; web demo modu tek faucet hesabıyla çalışmalı, E2E/video için hazır hesap enjekte edilmeli.
- 1Click teslim varlığı `nep141:wrap.near`; yerel NEAR mı wNEAR mı geldiği gerçek mainnet swap olmadan doğrulanamadı → arayüzde ve README'de açıkça belirtilecek.
- Claim: transfer modunda ~0.00067 NEAR rezerv kalır; DeleteAccount modu toz bırakmaz.

- T3 web kabuğu + tasarım sistemi (apps/web; lint/typecheck/16 test/build yeşil) — commit d21ce91

## Devam eden
- T4: akışların arayüze bağlanması (apps/web; fixtures silinecek, `#/pay` rotası, guided demo)
- T5+T10: DAO ödeme akışı (SputnikDAO, `packages/core/src/dao`, `scripts/dao`) + `npm run demo:testnet` (`scripts/demo`)
- Sonra: DAO sayfası (web), cüzdan bağlama (T9, opsiyonel), FAZ 4

## Sıradaki
- M2: T4 web akışları, T5 demo script
- M3: T6 invoice + 1Click, T7 auditor/receipt, T8 batch, T9 cüzdan
- M4: test, doküman, demo videosu, jüri, push

## Açık hatalar
- (yok)

## Bitti tanımı
- [ ] Temiz kurulumdan README adımlarıyla çalışıyor
- [ ] Bütün temel akışlar uçtan uca çalışıyor, bağımsız test ajanı onayladı
- [ ] Bütün testler, build ve lint yeşil
- [ ] Bağımlılık taraması temiz, repoda gizli bilgi yok
- [ ] Hackathon gereksinimlerinin her biri karşılandı ve kanıtlandı
- [ ] Jüri değerlendirmesi tamamlandı, `docs/JURY_LOG.md` yazıldı
- [ ] README: proje özeti, kurulum, çalıştırma, mimari şeması, kullanılan teknolojiler, ekran görüntüleri
- [ ] `DEMO.md`: 2–3 dakikalık demo senaryosu
- [ ] `demo/demo.webm`: Playwright ile çekilmiş otomatik demo videosu
- [ ] Deploy istendiyse ve hesap bilgisi verildiyse yapıldı (hesap bilgisi verilmedi → yerel sürüm; README'de Vercel adımları)
