// Legacy progress was global and could leak an old percentage into a fresh/no-DID session.
// Per-DID public state remains stored separately and is restored by the dedicated modules below.
try { localStorage.removeItem("reddragon-progress"); } catch {}

// All UI modules must agree on the language from their first execution. Older modules
// default to Turkish when no choice exists, while the stable language layer can detect
// the browser language. Persist one decision up front so those two rules never diverge.
try {
  const savedLang = localStorage.getItem("reddragon-lang");
  if (savedLang !== "tr" && savedLang !== "en") {
    localStorage.setItem(
      "reddragon-lang",
      String(navigator.language || "").toLowerCase().startsWith("tr") ? "tr" : "en"
    );
  }
} catch {}

window.APP_CONFIG = {
  brandName: "RedDragon",
  productName: "Technocore Agent Lab",
  byline: "by @joannawolker",
  xHandle: "@joannawolker",
  xUrl: "https://x.com/joannawolker",
  githubRepoUrl: "https://github.com/maho0638/reddragon-technocore",
  githubOwnerUrl: "https://github.com/maho0638",
  mediumUrl: "https://medium.com/@ayazunal450",
  mediumWriteUrl: "https://medium.com/new-story",
  siteUrl: "https://reddragon-technocore.vercel.app",
  technocoreBase: "https://technocore.chat",
  technocoreHumanUrl: "https://technocore.chat/humans",
  technocoreDid: "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K",
  technocoreFingerprint: "835ae177c258e121",
  technocoreOwnedRoom: "d-reddragon-lab",
  technocoreMailbox: "mb-reddragon-agent",
  contributionManifestUrl: "/reddragon-contribution.json",
  flopUrl: "https://flop.finance",
  flopXUrl: "https://x.com/flop_labs",
  heroImage: "/assets/reddragon.jpg"
};

// Public onboarding state may be kept locally per DID. Private key material is never persisted here.
// Add-on files are intentionally isolated from the core key/signing implementation.
(() => {
  for (const href of ["/enhancements.css", "/live-observatory.css", "/language-stable.css", "/agent-field.css", "/did-provenance.css", "/testnet-toolkit.css", "/tclk-workbench.css"]) {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = href;
    document.head.appendChild(css);
  }

  // Dynamic module scripts used to be appended all at once. Module execution order could
  // then vary by fetch timing, allowing translation/final-fix code to race each other.
  // Load add-ons one-by-one. No MutationObserver and no recurring translation interval.
  const sources = [
    "/public-state.js",
    "/enhancements.js",
    "/patches.js",
    "/proof-import.js",
    "/contribution-edit-fix.js",
    "/activity-proof.js",
    "/final-fixes.js",
    "/progress-scope-fix.js",
    "/live-observatory.js",
    "/language-stable.js",
    "/agent-field.js",
    "/did-provenance.js",
    "/testnet-toolkit.js",
    "/tclk-workbench.js"
  ];

  let index = 0;
  const loadNext = () => {
    if (index >= sources.length) return;
    const src = sources[index++];
    const script = document.createElement("script");
    script.type = "module";
    script.async = false;
    script.src = src;
    script.onload = loadNext;
    script.onerror = () => {
      console.error(`RedDragon add-on failed to load: ${src}`);
      loadNext();
    };
    document.head.appendChild(script);
  };
  loadNext();
})();
