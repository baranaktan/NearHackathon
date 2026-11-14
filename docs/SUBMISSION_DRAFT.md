# Başvuru taslağı

Bu dosya yardımcıdır; hiçbir şey otomatik gönderilmez. Başvuruyu ve X gönderisini sen yaparsın. Son tarih: **2026-11-14 23:59 UTC** (Türkiye saatiyle 15 Kasım 02:59).

## Sıra

1. (İsteğe bağlı) GitHub'da repo adını `perde` yap: Settings → General → Repository name. Bunu başvurudan **önce** yap; başvurudaki link yeni ad olmalı.
2. Reponun public olduğunu ve `README.md` dosyasının göründüğünü kontrol et.
3. `demo/demo.mp4` videosunu X gönderisine ekle ve gönderiyi yayınla.
4. Formu doldur: https://nearhackathon.com/#apply (ya da aşağıdaki JSON'u API'ye gönder). Tek hak var; aynı repo ikinci kez gönderilemez. Hata olursa https://nearhackathon.com/request-changes.

## Senin vermen gereken alanlar

| Alan | Kural | Değer |
| --- | --- | --- |
| Proje adı | 2–80 karakter | Öneri: `Perde` |
| Takım lideri adı | 2–80 karakter | (sen) |
| E-posta | geçerli e-posta | (sen) |
| Takım büyüklüğü | `1`, `2 - 4`, `4 - 6`, `6 - 8`, `8+` | (sen) |
| Track'ler | bir ya da daha fazla | Öneri: `privacy`, `realworld`, `social`, `open` |
| NEAR hesabı (mainnet, ödül için) | `ad.near` ya da 64 karakterlik implicit hesap | (sen; yoksa bir NEAR cüzdanında oluştur) |
| Repo linki | public | `https://github.com/baranaktan/NearHackathon` (adı değiştirirsen yenisi) |
| Demo gönderisi linki | X gönderisinin linki | (yayınladıktan sonra) |
| Ne yaptık | 20–2000 karakter | aşağıdaki metin |
| Onay | şu cümleyi kabul etmelisin: "I agree that the organizers may use these details to review our submission and contact us about this hackathon." | (sen) |

`website` alanını **doldurma**: spam tuzağıdır.

## "What we built" metni (İngilizce, ~1300 karakter)

```
Every payment on NEAR names its recipient. When a DAO pays a contributor, a team runs payroll or a freelancer gets an invoice paid, anyone can read who was paid, how much, and everything else that account holds.

Perde ("curtain" in Turkish) is private payments for NEAR. You publish one meta-address, or register it under your NEAR name. Each payment lands in a fresh stealth account only you can find and spend. The chain shows that someone was paid, not who.

NEAR makes this native: an implicit account id is an ed25519 public key in hex, and a transfer creates it. So a stealth key is already a NEAR account. Perde needs no pool holding funds, no relayer (the stealth account pays its own gas), no indexer (announcements are contract view calls) and no backend: it is a static site plus a small ownerless contract.

Built on that: pay alice.near privately via named accounts; payroll as one batched transaction; a SputnikDAO treasury paying a contributor through an ordinary proposal that never names them; invoices as one-time accounts that any wallet, exchange or NEAR Intents cross-chain swap can pay (shown as live 1Click dry quotes); viewing keys for auditors; verifiable payment receipts.

Everything runs on testnet with no wallet, keys or funds: `npm run demo:testnet` executes the full flow with explorer links in about 25 seconds. Unaudited prototype; amounts and senders stay public.
```

## X gönderisi taslağı (İngilizce)

```
Every payment on NEAR names its recipient. Pay a contributor from your DAO and the whole world sees who got paid, how much, and what else they hold.

I built Perde at NEAR HACKATHON: private payments where each payment lands in a fresh account only the recipient can find.

Why NEAR: an implicit account is just an ed25519 key in hex, so a stealth address is already a NEAR account. No pool, no relayer, no indexer, no backend.

In the video: pay alice.testnet privately → she finds it → a SputnikDAO treasury pays a contributor without naming them → an invoice quoted from USDC on Ethereum via NEAR Intents.

Repo + one-command testnet demo: https://github.com/baranaktan/NearHackathon

What would you want hidden next: amounts, or the sender?

@NEARProtocol #NEARHackathon @NearLegion @NearBuilders
```

(X karakter sınırı için kısaltman gerekebilir; `@NEARProtocol` ve `#NEARHackathon` kalmalı, video ekli olmalı.)

## API ile göndermek istersen

Değerleri doldur, `requestId` için bir kez `node -e "console.log(crypto.randomUUID())"` çalıştır ve aynı değeri yeniden denemelerde kullan. Bu yükü commit'leme (kişisel veri içerir; `submission-payload.json` zaten `.gitignore` içinde).

```json
{
  "requestId": "<uuid>",
  "projectName": "Perde",
  "leadName": "<ad>",
  "email": "<e-posta>",
  "size": "<takım büyüklüğü>",
  "tracks": ["privacy", "realworld", "social", "open"],
  "nearAddress": "<hesap.near>",
  "projectUrl": "https://github.com/baranaktan/NearHackathon",
  "demoUrl": "<x gönderisi linki>",
  "idea": "<yukarıdaki metin>",
  "consent": true
}
```
