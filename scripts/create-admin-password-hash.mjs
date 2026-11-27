import { StringDecoder } from "node:string_decoder";
import { hashAdminPassword } from "../api/admin-store.js";

if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
  process.stderr.write("Run this helper in an interactive terminal. It does not accept password arguments or read from a file.\n");
  process.exit(2);
}

const decoder = new StringDecoder("utf8");
let password = "";
process.stdout.write("Admin password (input is masked): ");
process.stdin.setRawMode(true);
process.stdin.resume();

function finish(error) {
  process.stdin.setRawMode(false);
  process.stdin.pause();
  process.stdin.removeListener("data", onData);
  process.stdout.write("\n");
  if (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; return; }
  try { process.stdout.write(`${hashAdminPassword(password)}\n`); }
  catch (cause) { process.stderr.write(`${cause.message}\n`); process.exitCode = 1; }
  finally { password = ""; }
}

function onData(buffer) {
  const text = decoder.write(buffer);
  if (text.includes("\u0003")) return finish(new Error("Cancelled"));
  if (text.includes("\r") || text.includes("\n")) return finish();
  if (text === "\u007f" || text === "\b") { password = [...password].slice(0, -1).join(""); process.stdout.write("\b \b"); return; }
  if ([...text].some(char => char >= " " && char !== "\u007f")) { password += text; process.stdout.write("*"); }
}
process.stdin.on("data", onData);
