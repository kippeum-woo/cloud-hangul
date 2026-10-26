// Builds client/land.json from Natural Earth land polygons (public domain),
// via the world-atlas TopoJSON: node scripts/build-land.mjs <land-50m.json>
// Rings are flattened [lon, lat, lon, lat, ...] rounded to 0.1 degree.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = process.argv[2];
if (!source) throw new Error("usage: build-land.mjs <world-atlas land-50m.json>");
const topo = JSON.parse(fs.readFileSync(source, "utf8"));
const [sx, sy] = topo.transform.scale;
const [tx, ty] = topo.transform.translate;
const arcs = topo.arcs.map((arc) => {
  let x = 0;
  let y = 0;
  return arc.map(([dx, dy]) => {
    x += dx;
    y += dy;
    return [x * sx + tx, y * sy + ty];
  });
});
const arcPoints = (i) => (i < 0 ? arcs[~i].slice().reverse() : arcs[i]);
const rings = [];
for (const geom of Object.values(topo.objects)[0].geometries) {
  const polys = geom.type === "Polygon" ? [geom.arcs] : geom.arcs;
  for (const poly of polys) {
    for (const ring of poly) {
      const pts = [];
      for (const a of ring) pts.push(...arcPoints(a));
      const out = [];
      let last = null;
      for (const [lon, lat] of pts) {
        const p = [Math.round(lon * 10) / 10, Math.round(lat * 10) / 10];
        if (last && Math.abs(p[0] - last[0]) < 0.2 && Math.abs(p[1] - last[1]) < 0.2) continue;
        out.push(p[0], p[1]);
        last = p;
      }
      if (out.length >= 8) rings.push(out);
    }
  }
}
fs.writeFileSync(path.join(root, "client", "land.json"), JSON.stringify({ source: "Natural Earth via world-atlas", rings }));
console.log(`${rings.length} rings`);
