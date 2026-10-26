import fs from "node:fs";
import path from "node:path";

export function persistent(createCore, filename, { dataDir, ...options }) {
  const file = dataDir ? path.join(dataDir, filename) : null;
  let initial = {};
  if (file && fs.existsSync(file)) initial = JSON.parse(fs.readFileSync(file, "utf8"));
  let timer;
  const flush = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(core.exportState()));
    fs.renameSync(tmp, file);
  };
  const core = createCore({ ...options, initial, onDirty() {
    if (file && !timer) { timer = setTimeout(flush, 150); timer.unref?.(); }
  } });
  return { ...core, flush };
}
