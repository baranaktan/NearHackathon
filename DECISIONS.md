# DECISIONS

Orkestratörün kendi başına verdiği kararlar, gerekçesiyle. Yeni kararlar en alta eklenir.

| # | Karar | Gerekçe |
| --- | --- | --- |
| 1 | Proje adı **Perde** ("private payments on NEAR"). | Türkçe "perde": kısa, akılda kalıcı, görsel motif (çekilen perde) veriyor; NEAR'daki deprecated "Shade Agents" ile karışmıyor. |
| 2 | Kriptografi çekirdeği **sıfırdan, bu pencere içinde** yazılıyor; önceki hiçbir projeden kod kopyalanmıyor. | Kullanıcı README'de başka projeye atıf istemiyor; hackathon kuralı (Q-002/Q-005) ise önceden yazılmış kodun açıklanmasını şart koşuyor. İkisini birden karşılamanın dürüst yolu önceden yazılmış kod kullanmamak. |
| 3 | Mimari: **stealth açık anahtar = NEAR implicit account**; havuz kontratı yok. Alternatif (fonları tutan havuz kontratı + imzalı çekim) reddedildi. | NEAR'da implicit account bir ed25519 açık anahtarının hex hâli; transfer hesabı kendiliğinden oluşturuyor. Emanet yok, relayer yok (stealth hesap kendi gas'ını öder), kontrat yalnızca duyuru defteri. |
| 4 | Duyurular küçük bir Rust kontratında (`send` = atomik duyuru + transfer), view çağrılarıyla sayfalanarak okunuyor. Alternatif (indexer / olay logu tarama) reddedildi. | Kullanıcı indexer istemiyor; view çağrıları statik siteden doğrudan RPC ile yapılabiliyor. |
| 5 | **Fatura modu**: alıcı tek kullanımlık adresi view anahtarından deterministik türetir; zincirde duyuru gerekmez. | Borsadan çekim ya da başka zincirden ödeme (NEAR Intents 1Click) gibi kontrat çağıramayan ödeyicilerle çalışır; mainnet'te kontrat deploy etmeden kullanılabilir. |
| 6 | NEAR Intents entegrasyonu varsayılan olarak **`dry: true` quote**; hiçbir mainnet işlemi tarafımızdan imzalanmıyor. Arayüzde açıkça "preview" etiketli. | Intents'in testnet'i yok (Q-007); fon harcama izni yok. Sahte sonuç gösterilmiyor: quote'lar gerçek API'den geliyor. |
| 7 | Backend yok: Vite + React + TypeScript statik SPA; anahtarlar tarayıcıda. | Kullanıcının isteği ("sadece web sitesi"); jüri için kurulum tek komut; barındırma bedava. |
| 8 | Demo modu: tarayıcıda testnet faucet servisiyle (`helper.nearprotocol.com`, CORS doğrulandı) geçici hesap açılır; ayrıca `npm run demo:testnet` aynı akışı terminalde koşar. | AI ön elemesi ve jüri sırsız, cüzdansız, fonsuz uçtan uca deneyebilmeli. Koda gömülü anahtar yok. |
| 9 | Kontrat testleri: Rust unit testleri + testnet'e karşı entegrasyon testi. | near-sandbox / near-workspaces Windows'ta çalışmıyor; Docker yok. |
| 10 | `cargo-near` proje içine kurulur (`cargo install --root .tools`), `near-cli-rs` gerekirse devDependency. | Global kurulum yasağı (güvenlik kuralı 3). Docs'taki `irm … \| iex` ve `npm i -g` önerileri uygulanmadı (kural 9). |
| 11 | Track'ler: `privacy`, `realworld`, `open`. | Gizli finans (privacy), fatura + toplu ödeme (realworld), kategori dışı primitif (open). |
| 16 | Konumlandırma primitiften kullanım senaryosuna çevrildi: "DAO'lar ve ekipler için gizli maaş ve fatura". SputnikDAO önerisiyle gizli ödeme akışı (T10) eklendi; track listesine `social` eklendi. | Stealth adres bilinen bir primitif ve NEAR'ın Confidential Intents'i var; jüriye "neden kullanayım" cevabı gerekiyor. DAO ödemelerinde alıcı adının açık olması somut bir sorun; Sputnik `FunctionCall` önerisi ucuz bir entegrasyon. |
| 12 | Lisans Apache-2.0; arayüz ve dokümanlar İngilizce. | Jüri ve AI eleyici İngilizce okuyor; Q-014 herhangi bir lisansa izin veriyor. |
| 13 | Commit'lerde AI imzası yok; README'de kütüphaneler ve AI yardımıyla geliştirme açıkça listelenir. | Kullanıcı talimatı + Q-005. |
| 14 | GitHub repo adı değiştirilmedi. | `gh` ve API erişimi yok; kimlik bilgisi yöneticisinden token çıkarmak güvenlik kurallarının ruhuna aykırı. Kullanıcı Settings → Rename ile değiştirebilir (GitHub eski URL'yi yönlendirir); başvurudan **önce** yapılmalı. |
| 15 | Başvuru (POST), X gönderisi ve Vercel deploy'u kullanıcıya bırakıldı; taslaklar `docs/SUBMISSION_DRAFT.md` içinde. | HACKATHON.md: bunlar insanın açık onayı olmadan yapılamaz; deploy için hesap bilgisi verilmedi. |
