(() => {
  "use strict";
  const dictionaries = {
    en: {
      "app.passwordShort": "The password must be at least 12 characters.",
      "app.passwordMismatch": "The passwords do not match.",
      "app.identityCreated": "DID created.",
      "app.cryptoUnsupported": "This browser does not support Ed25519 WebCrypto.",
      "app.restorePassword": "Enter the backup password:",
      "app.identityRestored": "Identity restored.",
      "app.restoreFailed": "The backup could not be opened or the password was incorrect.",
      "app.fingerprint": "Fingerprint",
      "app.didCreated": "DID created",
      "app.waiting": "Waiting",
      "app.done": "Done",
      "app.contributionPrompt": "Fill in the contribution details.",
      "app.backupDownloaded": "Encrypted backup downloaded.",
      "app.didCopied": "Public DID copied.",
      "app.didSecretCopied": "TECHNOCORE_DID copied.",
      "app.publishing": "Publishing…",
      "app.didPublished": "DID note published.",
      "app.signedHello": "Signing…",
      "app.sending": "Sending…",
      "app.openingRoom": "Opening room…",
      "app.creatingPrivateRoom": "Creating private room…",
      "app.invalidRoom": "The room name is invalid.",
      "app.publicRoomOpened": "Public room opened.",
      "app.privateRoomCreated": "Private room created.",
      "app.privateRoomPrivacy": "If you do not share this name, it will not appear in the public room list; however, this is not end-to-end encryption.",
      "app.roomCopied": "Private room name copied.",
      "app.profilePublished": "Profile metadata published.",
      "app.contributionRequired": "A contribution link and title are required.",
      "app.contributionSaved": "Contribution saved.",
      "app.proofCopied": "Proof copied.",
      "app.xTextCopied": "X post text copied.",
      "app.privateKeyCopied": "Private key copied — paste it only into GitHub Secrets.",
      "app.setupCopied": "GitHub Actions setup copied.",
      "app.resetConfirm": "Clear the private key and temporary session records? You can restore the DID later if you have the encrypted backup.",
      "app.failure": "The request could not be completed. Check the connection and try again.",
      "app.publishedRecord": "Published · /kv/did/{fingerprint}",
      "app.signedLobby": "Signed hello saved · lobby · seq {seq}",
      "app.lobbyIntro": "Lobby introduction · seq {seq}",
      "app.signedRoom": "Opened · /r/{room} · seq {seq}",
      "app.signedContribution": "Signed contribution · {room} · seq {seq}",
      "app.profileDetails": "Published community profile · {name} · {color}",
      "app.privateRoomNote": "Private room name copied.",
      "app.contributionPreview": "Contribution details will appear here.",
      "app.notePublished": "DID note published",
      "app.helloSaved": "Signed hello saved",
      "app.introSaved": "Lobby introduction saved",
      "app.roomSaved": "Public room opened",
      "app.privateRoomSaved": "Private room created",
      "app.profileSaved": "Profile metadata published",
      "app.contributionSavedToast": "Contribution saved",
      "app.resetSession": "Reset session",
      "app.published": "Published",
      "app.vaultPublished": "Published",
      "app.proofNotice": "Community tool. Signed records prove control of this DID key, not a guaranteed airdrop allocation.",
      "app.xShareDraft": "Built my Technocore agent identity and published a useful contribution.\n\n🐉 RedDragon · {handle}\n🪪 DID: {did}\n🔗 Contribution: {url}\n🧾 Signed record: {room} #{seq}\n\n@flop_labs #Technocore #FLOP"
      ,"patch.publishedPath": "Published · {path} · current sharded DID path",
      "patch.proofCopied": "Proof copied · DID path updated",
      "patch.backupProofFile": "This is a public proof file. Choose the reddragon-technocore-…json identity backup to restore.",
      "patch.backupJsonOnly": "The identity backup must be a JSON file.",
      "patch.backupTooLarge": "This file is larger than the expected identity backup and was not opened for safety.",
      "patch.readyDidNote": "DID ready · ready to publish.",
      "patch.readyHello": "DID ready · you can send a signed hello.",
      "patch.readyIntro": "DID ready · you can send a lobby introduction.",
      "patch.readyRoom": "DID ready · you can open a public room if capacity allows.",
      "patch.readyStyle": "DID ready · you can publish profile metadata.",
      "patch.readyContribution": "DID ready · fill in the contribution URL, title and summary.",
      "patch.backupRestoredNote": "The encrypted identity backup was verified and restored. Previous public records are not included in this backup; an earlier proof JSON is separate evidence.",
      "patch.backupRestoredToast": "Encrypted identity backup verified · DID + private key restored",
      "patch.securityHeading": "Security rule",
      "patch.securityBody": "RedDragon never asks for your GitHub password, token or wallet seed phrase. Paste your private key only into the Actions Secret field in your own GitHub repository. The private key is not sent to RedDragon servers or written to public GitHub files.",
      "patch.relayOnline": " relay online",
      "patch.relayOffline": " relay offline",
      "patch.capacityNote": "Technocore note capacity is full. This is not a browser or key error; you can continue with signed-message steps.",
      "patch.capacityRoom": "Technocore has reached its new-room capacity. Skip this step until server capacity is available.",
      "patch.capacity404": "This link returned 404. The external record may be absent; this does not by itself indicate a site-code error."
    },
    tr: {
      "app.passwordShort": "Parola en az 12 karakter olmalı.",
      "app.passwordMismatch": "Parolalar eşleşmiyor.",
      "app.identityCreated": "DID oluşturuldu.",
      "app.cryptoUnsupported": "Bu tarayıcı Ed25519 WebCrypto desteği sunmuyor.",
      "app.restorePassword": "Yedek parolasını gir:",
      "app.identityRestored": "Kimlik geri yüklendi.",
      "app.restoreFailed": "Yedek açılamadı veya parola yanlış.",
      "app.fingerprint": "Parmak izi",
      "app.didCreated": "DID oluşturuldu",
      "app.waiting": "Bekliyor",
      "app.done": "Tamamlandı",
      "app.contributionPrompt": "Katkı bilgilerini doldur.",
      "app.backupDownloaded": "Şifreli yedek indirildi.",
      "app.didCopied": "Herkese açık DID kopyalandı.",
      "app.didSecretCopied": "TECHNOCORE_DID kopyalandı.",
      "app.publishing": "Yayınlanıyor…",
      "app.didPublished": "DID notu yayınlandı.",
      "app.signedHello": "İmzalanıyor…",
      "app.sending": "Gönderiliyor…",
      "app.openingRoom": "Oda açılıyor…",
      "app.creatingPrivateRoom": "Özel oda oluşturuluyor…",
      "app.invalidRoom": "Oda adı geçersiz.",
      "app.publicRoomOpened": "Herkese açık oda açıldı.",
      "app.privateRoomCreated": "Özel oda oluşturuldu.",
      "app.privateRoomPrivacy": "Bu adı paylaşmazsan herkese açık oda listesinde görünmez; ancak uçtan uca şifreleme değildir.",
      "app.roomCopied": "Özel oda adı kopyalandı.",
      "app.profilePublished": "Profil bilgileri yayınlandı.",
      "app.contributionRequired": "Katkı bağlantısı ve başlığı gerekli.",
      "app.contributionSaved": "Katkı kaydedildi.",
      "app.proofCopied": "Kanıt kopyalandı.",
      "app.xTextCopied": "X paylaşım metni kopyalandı.",
      "app.privateKeyCopied": "Özel anahtar kopyalandı — yalnızca GitHub Secrets'e yapıştır.",
      "app.setupCopied": "GitHub Actions kurulum bilgileri kopyalandı.",
      "app.resetConfirm": "Özel anahtar ve geçici oturum kayıtları temizlensin mi? Şifreli yedeğin varsa DID'yi daha sonra geri yükleyebilirsin.",
      "app.failure": "İstek tamamlanamadı. Bağlantıyı kontrol edip yeniden deneyin.",
      "app.publishedRecord": "Yayınlandı · /kv/did/{fingerprint}",
      "app.signedLobby": "İmzalı merhaba kaydedildi · lobby · sıra {seq}",
      "app.lobbyIntro": "Lobby tanışması · sıra {seq}",
      "app.signedRoom": "Açıldı · /r/{room} · sıra {seq}",
      "app.signedContribution": "İmzalı katkı · {room} · sıra {seq}",
      "app.profileDetails": "Topluluk profili yayınlandı · {name} · {color}",
      "app.privateRoomNote": "Özel oda adı kopyalandı.",
      "app.contributionPreview": "Katkı bilgileri burada görünecek.",
      "app.notePublished": "DID notu yayınlandı",
      "app.helloSaved": "İmzalı merhaba kaydedildi",
      "app.introSaved": "Lobby tanışması kaydedildi",
      "app.roomSaved": "Herkese açık oda açıldı",
      "app.privateRoomSaved": "Özel oda oluşturuldu",
      "app.profileSaved": "Profil bilgileri yayınlandı",
      "app.contributionSavedToast": "Katkı kaydedildi",
      "app.resetSession": "Oturumu sıfırla",
      "app.published": "Yayınlandı",
      "app.vaultPublished": "Yayınlandı",
      "app.proofNotice": "Topluluk aracıdır. İmzalı kayıtlar bu DID anahtarının kontrolünü kanıtlar; airdrop tahsisi garantisi vermez.",
      "app.xShareDraft": "Technocore ajan kimliğimi oluşturdum ve faydalı bir katkı yayımladım.\n\n🐉 RedDragon · {handle}\n🪪 DID: {did}\n🔗 Katkı: {url}\n🧾 İmzalı kayıt: {room} #{seq}\n\n@flop_labs #Technocore #FLOP",
      "patch.publishedPath": "Yayınlandı · {path} · güncel parçalı DID yolu",
      "patch.proofCopied": "Kanıt kopyalandı · DID yolu güncellendi",
      "patch.backupProofFile": "Bu herkese açık bir kanıt dosyası. Geri yüklemek için reddragon-technocore-…json kimlik yedeğini seç.",
      "patch.backupJsonOnly": "Kimlik yedeği JSON dosyası olmalı.",
      "patch.backupTooLarge": "Bu dosya beklenen kimlik yedeğinden büyük; güvenlik için açılmadı.",
      "patch.readyDidNote": "DID hazır · yayınlayabilirsin.",
      "patch.readyHello": "DID hazır · imzalı merhaba gönderebilirsin.",
      "patch.readyIntro": "DID hazır · lobby tanışmasını gönderebilirsin.",
      "patch.readyRoom": "DID hazır · kapasite uygunsa herkese açık oda açabilirsin.",
      "patch.readyStyle": "DID hazır · profil bilgilerini yayınlayabilirsin.",
      "patch.readyContribution": "DID hazır · katkı bağlantısını, başlığını ve özetini doldur.",
      "patch.backupRestoredNote": "Şifreli kimlik yedeği doğrulandı ve geri yüklendi. Önceki herkese açık kayıtlar bu yedeğe dahil değildir; daha önceki proof JSON ayrı kanıttır.",
      "patch.backupRestoredToast": "Şifreli kimlik yedeği doğrulandı · DID + private key geri yüklendi",
      "patch.securityHeading": "Güvenlik kuralı",
      "patch.securityBody": "RedDragon GitHub şifreni, tokenini veya cüzdan seed phrase'ini istemez. Private key'i yalnızca kendi GitHub depondaki Actions Secret alanına yapıştır. Private key RedDragon sunucularına gönderilmez ve herkese açık GitHub dosyalarına yazılmaz.",
      "patch.relayOnline": " relay çevrimiçi",
      "patch.relayOffline": " relay çevrimdışı",
      "patch.capacityNote": "Technocore not kapasitesi dolu. Bu tarayıcı veya anahtar hatası değil; imzalı mesaj adımlarına devam edebilirsin.",
      "patch.capacityRoom": "Technocore yeni oda kapasitesine ulaştı. Sunucu kapasitesi açılana kadar bu adımı atlayabilirsin.",
      "patch.capacity404": "Bu bağlantı 404 döndürdü. Dış sistemde kayıt bulunmuyor olabilir; bu durum tek başına site kodu hatası anlamına gelmez."
    }
  };
  const registered = new Map();
  const flatten = (value, prefix = "", out = new Map()) => {
    if (typeof value === "string") out.set(prefix, "string");
    else if (Array.isArray(value)) value.forEach((item, index) => flatten(item, `${prefix}[${index}]`, out));
    else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => flatten(item, prefix ? `${prefix}.${key}` : key, out));
    else out.set(prefix, typeof value);
    return out;
  };
  const register = (namespace, catalog) => {
    if (!namespace || !catalog?.en || !catalog?.tr) throw new Error(`Invalid translation catalog: ${namespace}`);
    const en = flatten(catalog.en); const tr = flatten(catalog.tr);
    const mismatch = [...new Set([...en.keys(), ...tr.keys()])].filter(key => en.get(key) !== "string" || tr.get(key) !== "string");
    if (mismatch.length) throw new Error(`Incomplete translation catalog ${namespace}: ${mismatch.join(", ")}`);
    registered.set(namespace, catalog);
    return catalog;
  };
  const lang = () => {
    let chosen = "";
    try { chosen = localStorage.getItem("reddragon-lang") || ""; } catch {}
    if (chosen === "tr" || chosen === "en") return chosen;
    return String(navigator.language || "").toLowerCase().startsWith("tr") ? "tr" : "en";
  };
  const t = (key, vars = {}, locale = lang()) => {
    const value = dictionaries[locale]?.[key];
    if (typeof value !== "string") throw new Error(`Missing UI translation: ${locale}.${key}`);
    return value.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`));
  };
  const audit = () => {
    const keys = Object.keys(dictionaries.en);
    const missing = keys.flatMap(key => ["en", "tr"].filter(locale => typeof dictionaries[locale][key] !== "string").map(locale => `${locale}.${key}`));
    if (missing.length) throw new Error(`Incomplete UI translations: ${missing.join(", ")}`);
    for (const [namespace, catalog] of registered) {
      const en = flatten(catalog.en); const tr = flatten(catalog.tr);
      const mismatch = [...new Set([...en.keys(), ...tr.keys()])].filter(key => en.get(key) !== "string" || tr.get(key) !== "string");
      if (mismatch.length) throw new Error(`Incomplete translation catalog ${namespace}: ${mismatch.join(", ")}`);
    }
    return { keys: keys.length, catalogs: registered.size, locales: ["tr", "en"] };
  };
  window.RD_I18N = Object.freeze({ t, audit, language: lang, dictionaries, register, get: (namespace, locale = lang()) => registered.get(namespace)?.[locale] });
  audit();
})();
