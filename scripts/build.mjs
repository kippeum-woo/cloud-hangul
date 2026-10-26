import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const hash = crypto.createHash("sha256");
for (const dir of ["client", "src"]) {
  for (const file of fs.readdirSync(path.join(root, dir)).sort()) hash.update(file).update(fs.readFileSync(path.join(root, dir, file)));
}
hash.update(fs.readFileSync(path.join(root, "package-lock.json")));
const version = hash.digest("hex").slice(0, 12);
// Only remove this script's fixed generated directory inside the repository.
if (path.dirname(dist) !== root || path.basename(dist) !== "dist") throw new Error("Unsafe build directory");
fs.rmSync(dist, { recursive: true, force: true });
const output = path.join(dist, "v", version);
fs.mkdirSync(output, { recursive: true });
for (const dir of ["client", "src"]) fs.cpSync(path.join(root, dir), path.join(output, dir), { recursive: true });
fs.cpSync(path.join(root, "node_modules/three/build"), path.join(output, "three/build"), { recursive: true });
const template = fs.readFileSync(path.join(root, "client/index.html"), "utf8");
fs.writeFileSync(path.join(dist, "index.html"), template.replaceAll("{{BUILD}}", `./v/${version}`).replace("<head>", '<head>\n    <meta name="cloud-hangul-transport" content="websocket" />'));
fs.writeFileSync(path.join(dist, "_headers"), "/v/*\n  Cache-Control: public, max-age=31536000, immutable\n/\n  Cache-Control: no-cache\n");
console.log(`Built Cloudflare assets: ${version}`);
