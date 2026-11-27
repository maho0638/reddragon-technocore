import { build } from "esbuild";

await build({
  entryPoints: ["scripts/wallet-chain-entry.mjs"],
  outfile: "public/flop-wallet-chain.bundle.js",
  bundle: true,
  minify: true,
  sourcemap: false,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  legalComments: "eof",
  treeShaking: true
});
