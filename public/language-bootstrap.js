(() => {
  const key = "reddragon-lang";
  let lang = "";
  try { lang = localStorage.getItem(key) || ""; } catch {}
  if (lang !== "tr" && lang !== "en") {
    lang = String(navigator.language || "").toLowerCase().startsWith("tr") ? "tr" : "en";
    try { localStorage.setItem(key, lang); } catch {}
  }
  document.documentElement.lang = lang;
})();
