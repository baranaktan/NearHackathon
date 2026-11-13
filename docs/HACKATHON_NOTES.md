# NEAR HACKATHON — Notlar (FAZ 0, 2026-11-13/14)

Kaynak: yerel `HACKATHON.md` (canlı sürümle diff: sıfır fark), nearhackathon.com, `nearai/near-hackathon-prompt-examples`, partner dokümanları.
Ayrıntılı araştırma dosyaları: `docs/research/01-hackathon-and-tracks.md`, `02-near-core-tech.md`, `03-ai-and-partners.md`, `04-winners-and-strategy.md`.

## 1. Takvim ve teslim

| Olay | Zaman (UTC) |
| --- | --- |
| Geliştirme sonu = teslim son tarihi | **2026-11-14 23:59** |
| Jüri başlangıcı | 2026-11-16 |
| Sonuçlar | 2026-11-18 23:59'a kadar |

Teslim üç parçadan oluşur, üçü de son tarihten önce hazır olmalı:
1. **Public GitHub reposu** (LICENSE dosyasıyla; jüri süresince public kalır).
2. **X'te demo gönderisi**: "NEAR HACKATHON'da yapıldı" der, `@NEARProtocol` ve `#NEARHackathon` etiketli (isteğe bağlı `@NearLegion`, `@NearBuilders`), demo videosu ekli. İnsan yazar ve yayınlar.
3. **Tek başvuru**: `POST https://nearhackathon.com/api/applications` (ya da `#apply` formu). Aynı repo ikinci kez gönderilemez (409); hata düzeltmesi yalnızca `/request-changes` üzerinden.

Başvuru alanları (hepsini insan verir, uydurulmaz): proje adı, takım lideri adı, e-posta, takım büyüklüğü, track'ler, mainnet NEAR hesabı (ödül için), repo linki, demo gönderisi linki, "ne yaptık" metni (20–2000 karakter), iletişim onayı. `website` alanı spam tuzağıdır, gönderilmez.

## 2. Kesinlikle uyulması gerekenler

- İnsanın açık onayı olmadan: başvuru gönderme, X'te paylaşım, repoyu public yapma/push, işlem imzalama, token harcama, mainnet deploy, sır commit'leme **yok**.
- Sadece pencere içinde (2026-10-19 → 11-14) yapılan NEAR entegrasyonu değerlendirilir (Q-001, Q-002).
- README'de kullanılan kütüphaneler, şablonlar ve AI üretimi kod listelenir (Q-005).
- Yalnızca testnet kullanan projeler bütün track'lere uygundur (Q-010). Zorunlu entegrasyon yok (Q-011).
- Yerel demo kabul edilir, ama public repo + yeniden üretilebilir README + **videolu** X gönderisi gerekir; ekran görüntüsü tek başına yetmez (Q-012). Barındırılan demo artı puandır; 18 Kasım'a (tercihen 25 Kasım'a) kadar açık kalmalı.
- NEAR Intents'in testnet'i yoktur: mainnet, ayrı geliştirme hesabı, çok küçük tutarlar, `dry: true` quote (Q-007).
- Bir kişi en fazla 2 bağımsız proje gönderebilir (Q-015).

## 3. Jüri neye puan veriyor

Yayınlanmış bir puan tablosu ya da ağırlık **yok**. Eldeki sinyaller:

- **AI ön elemesi (Claude Code + Codex):** "çalışıyor mu ve README'de yazanı yapıyor mu" — yeniden üretilebilirlik, özellik doğrulaması, yapılandırılmış rapor, ön puan. Karar insanlarda; düşük AI puanı tek başına elemez (Q-017).
- **İnsan jüri:** Illia Polosukhin (NEAR), Eddy Lazzarin (a16z crypto), Mert Mumtaz (Helius), Avichal Garg (Electric Capital), Kain Warwick, Haseeb Qureshi (Dragonfly), Stepan Gershuni.
- Site, "önceki NEAR hackathonları teknik uygulama, tasarım, etki, özgünlük ve sürdürülebilirliğe baktı" diyor; bu etkinlik için bağlayıcı olduğu söylenmiyor.
- Track'e özel: thesis "kanıta göre", games "oyun döngüsüne göre", memecoins "mekaniğe göre".
- Demo gönderisi rehberi: kullanıcı problemiyle aç, tek bir eksiksiz an göster, NEAR'ın rolünü somut söyle ("powered by NEAR" değil), repo linki ve bir soru ekle.
- Track prompt'larında ortak beklenti: jürinin **fonsuz çalıştırabileceği** mod (dry-run / simülasyon / hızlı ileri sarma / örnek veri), jüri için yazılmış README, açık hata ve tehdit modeli bölümleri, uydurma sayı yok, tam yetkili anahtar yerine kapsamı sınırlı function-call anahtarı.

Ödüller: büyük ödül $55.000 (1 adet); her track'te 1./2./3. için $10.000 / $3.000 / $2.000. Bir proje uyduğu bütün track'leri seçebilir.

## 4. Track'ler ve yoğunluk tahmini

Yoğunluk tahmini GitHub aramasına dayanıyor (19 Ekim sonrası ~529 repo, yalnızca ilk 19'u incelendi) — gürültülü, kesin değil.

| Yoğunluk | Track / tema |
| --- | --- |
| Çok kalabalık | agents, "ajan cüzdanı + harcama limiti", Intents swap/DCA, memecoin mekanikleri, ajan dükkanlı oyunlar, sealed-bid ajan marketleri |
| Orta | privacy (harcama denetçisi), DAO bounty board, fatura |
| Muhtemelen ince | thesis, örnek prompt'un ötesindeki NFT'ler, payroll/remittance, Trezu odaklı social, prediction market |

Organizatörün 13 örnek prompt'unu birebir yapmak kalabalığa girmek demektir; herkes aynı prompt'u yapıştırıyor.

## 5. Kazananlar ne yapmış

Kanıt zayıf: geçmiş kazanan sayfalarının çoğu açılamadı. Doğrulanabilen örnekler (TotalFusion, bxlETH, Bitte bounty kazananları) şunu gösteriyor:
- Sponsor primitifi **çekirdek mekanizma**, sonradan eklenmiş süs değil.
- Canlı, uçtan uca işlem kanıtı (tx linkleri) ve test/mock altyapısı.
- Sohbet arayüzlü ajan sarmalayıcıları 2025'te zaten doymuştu.

## 6. Nerede fark yaratılabilir

- **AI elemesini geçmek:** sır gerektirmeyen tek komutluk deterministik demo; README'de "iddia → dosya → test" tablosu; gerçek çıktılar ve testnet tx linkleri; temiz klonda geçen testler; `.env.example`; tehdit modeli ve sınırlar bölümü. İddia koddan büyükse puan düşer.
- **NEAR'a özgü derinlik:** function-call access key (allowance, metod ve alıcı kısıtı), alt hesaplar, NEP-413 imzalı intent'ler, Chain Signatures, NEAR AI Cloud'da TEE doğrulamalı çıkarım, SputnikDAO'da "ajan yalnızca öneri açar, insan oylar" rol modeli.
- **Karşıt gösterim:** aynı saldırının korumasız ve korumalı halde çalıştırılması gibi, "neden gerekli" sorusunu videoda tek anda gösteren demo.

## 7. Teknik gerçekler (bu makinede doğrulananlar işaretli)

- ✔ 1Click API: `https://1click.chaindefuser.com/v0/tokens` ve anahtarsız `dry:true` `POST /v0/quote` çalışıyor. Anahtarsız quote'a +%0,25 ek ücret biniyor; anahtar `X-API-Key` ile (partners.near-intents.org).
- ✔ RPC: `free.rpc.fastnear.com`, `test.rpc.fastnear.com`; FastNEAR API ve NearBlocks **v3** anahtarsız (v1/v2 22 Kasım 2026'da kapanıyor).
- ✔ Chain Signatures kontratları: mainnet `v1.signer`, testnet `v1.signer-prod.testnet` (gerçek `sign` çağrısı denenmedi).
- ✔ SputnikDAO fabrikaları: mainnet `sputnik-dao.near`, testnet `sputnikv2.testnet`.
- NEAR AI Cloud: OpenAI uyumlu, `https://cloud-api.near.ai/v1`; `GET /v1/attestation/report`, `GET /v1/signature/{chat_id}`. Model attestation iki denemede 503 verdi → yeniden deneme ve önbellek gerekir. Yalnızca NEAR'ın barındırdığı açık ağırlıklı modeller model TEE'sinde çalışır; `anthropic/*`, `openai/*` vb. gateway üzerinden geçer ve TEE kanıtı sayılmaz.
- JS: `near-api-js` 7.x saf ESM (v6 örnekleri geçersiz); `near-kit` docs'ta listeli. Cüzdan: `@near-wallet-selector/*` deprecated, önerilen `@hot-labs/near-connect`.
- Kontrat: Rust (`near-sdk` 5.x + `cargo near build non-reproducible-wasm`, Docker gerekmez). `near-sdk-js` arşivlendi.
- **Windows kısıtları:** near-sandbox / near-workspaces çalışmaz (WSL ister) → entegrasyon testi testnet'e deploy ile. Docker yok → reproducible build yok.
- Shade Agent Framework docs'a göre deprecated; kullanılmayacak.
- Trezu ve NEAR Business'ın geliştirici API'si yok; entegrasyon SputnikDAO üzerinden.

## 8. Okunamadı / doğrulanamadı

- `https://x.com/nearprotocol/status/2112257967818997891` (HTTP 402).
- DevHub YouTube track anlatımları (bakılmadı).
- Geçmiş kazanan sayfalarının çoğu (Devpost, Taikai, DoraHacks, pages.near.org).
- "$10 NEAR AI kredisi"nin nearbuilders.org üzerinden nasıl alındığı (sayfada bilgi bulunamadı; giriş gerektiriyor olabilir).
- meme.cooking, HEX, GoMining, BRRRAIN dokümanları; Rhea swap API/CLI ayrıntıları.
- NEP-413 imza ayrıntıları ve 1Click TS SDK metot adları spec/repo'dan doğrulanmadı (uygulamada doğrulanacak).
- Windows'ta `near-cli-rs` ve `cargo-near` kurulumu henüz denenmedi.
- Dış içerikte bize yönelik talimat: docs'taki `irm … | iex` ve `npm i -g` kurulum önerileri güvenlik kurallarına aykırı, uygulanmadı.
