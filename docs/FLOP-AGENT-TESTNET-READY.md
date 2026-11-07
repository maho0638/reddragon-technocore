# RedDragon FLOP Testnet DID Agent - hazırlık

Kontrol tarihi: 7 Kasım 2026. Bu belgede yalnızca GitHub Actions ile ajan hazırlığı anlatılır. Sitenin dosyalarında değişiklik yoktur.

## Kimlik ve çalışan altyapı

- Mevcut DID: did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K
- Mevcut imzalı Technocore ajanı: scripts/technocore-agent.mjs
- Çalışan ajan örneği: https://github.com/maho0638/reddragon-technocore/actions/runs/42391102995
- FLOP ağ kimliğinin resmî tek kontrol noktası: https://docs.flop.network/networks/testnet
- FLOP'un ajan şartları: https://docs.flop.network/docs/testnet-and-timeline
- Resmî SDK ve API referansı: https://docs.flop.network/docs/sdk-references
- Kayıt: https://github.com/maho0638/reddragon-technocore/issues/10

## Şimdi yapılanlar

1. scripts/flop-agent-preflight.mjs: yalnızca resmî testnet sayfasına HTTPS GET isteği. Sabit izin listesi, otomatik yönlendirme kapalı, kimlik bilgisi yok, maksimum 256 KiB.
2. scripts/flop-agent-preflight.test.mjs: 16 çevrimdışı kontrol, DID doğrulama, sahte kaynak engelleme, HTTP/redirect/MIME/boyut hataları, testnet-devnet ayrımı ve imzasız kullanım.
3. .github/workflows/flop-testnet-preflight.yml: GitHub Actions ile syntax + 16 test + güncel resmî sayfa kontrolü. Hazırlık dalında kod gönderimiyle çalışır. Ana dala alındığında 6 saatte bir yalnızca okuma yaparak ağ durumunu kontrol eder.

Node 22+ ile kontrol:

    node --check scripts/flop-agent-preflight.mjs
    node --check scripts/flop-agent-preflight.test.mjs
    node --test scripts/flop-agent-preflight.test.mjs
    node scripts/flop-agent-preflight.mjs --json

Son komutun çıkış durumu:
- 0: testnet henüz resmî olarak açılmamış (güvenli bekleme).
- 1: resmî sayfaya ulaşılamadı veya güvenlik kontrolü başarısız.
- 2: geçersiz argüman.
- 3: ağ sayfası değişti ya da açılış şüphesi var, manuel doğrulama gerekli.

**0 da 3 de işlem yapma izni değildir.** Her durumda maySign=false, mayClaim=false, maySendInference=false.

## FLOP testnet açılınca

1. Resmî ağ sayfasındaki testnet genesis, RPC, gateway, faucet ve release pin bilgisini birbirine karşı doğrula. Devnet bilgilerini testnet için kullanma.
2. Resmî dokümanlardaki DID Ed25519 imzalama biçimini ve zincir hesabı / SS58 eşlemesini doğrula. DID özel anahtarı zaten GitHub Actions Secret içinde; asla loglara veya git commitine yazma. İmzalama yalnızca resmî testnet protokolü doğrulandıktan sonra eklenebilir.
3. Tek meşru ve ücretsiz faucet kullanımı, limit / Retry-After kuralları, gerçek imzalı inference, bağımsız miner ve zincirde kesinleşen ödeme/receipt kanıtını kontrol et.
4. İşlem kanıtını GitHub issue #10'da kamuya açık DID, ağ kimliği, işlem ID'si ve sonuç durumuyla raporla. Token sayısı, DID oluşturulması veya sadece HTTP 200 cevabı gerçek airdrop kanıtı sayılmaz.

## Güvenlik ve sınırlar

Airdrop veya katılım garantisi verilmez. Devnet işlemleri ödül doğurmaz. Bu hazırlık işinde **hiçbir testnet talebi, faucet claim, para transferi, anahtar kullanımı, mainnet imzası veya website değişikliği yapılmaz**. FLOP testnet operator sayfası bugün planned/unreleased durumundadır. Kodun salt okunur denetleyici olması bilerek seçilmiştir; ağ parametreleri resmî olarak yayımlanmadan imzalı katılım kodu tahmin edilmez.
