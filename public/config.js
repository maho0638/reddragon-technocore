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
  flopUrl: "https://flop.finance",
  flopXUrl: "https://x.com/flop_labs",
  heroImage: "/assets/reddragon.jpg"
};

// Public onboarding state may be kept locally per DID. Private key material is never persisted here.

// Enhancements stay separate from core key generation/signing code.
(() => {
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "/enhancements.css";
  document.head.appendChild(css);

  for (const src of ["/public-state.js", "/enhancements.js", "/patches.js", "/proof-import.js"]) {
    const script = document.createElement("script");
    script.type = "module";
    script.src = src;
    document.head.appendChild(script);
  }
})();
