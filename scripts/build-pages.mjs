import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./build.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "pages", "dist");
if (path.dirname(output) !== path.join(root, "pages")) throw new Error("Unsafe output path");
fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(path.join(root, "dist"), output, { recursive: true });
fs.copyFileSync(path.join(root, "pages/gateway.js"), path.join(output, "_worker.js"));
fs.writeFileSync(path.join(output, "_routes.json"), JSON.stringify({ version: 1, include: ["/api/*", "/health"], exclude: [] }));
console.log("Built Pages frontend with existing game service binding.");
