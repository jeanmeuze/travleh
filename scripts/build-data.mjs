// Bouwt public/data.json uit de officiële Vlaamse gemeentegrenzen (VRBG2025, toestand 01/01/2025).
// Gebruik: node scripts/build-data.mjs   (downloadt raw/gem.json indien nodig)
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const rawFile = path.join(root, 'raw', 'gem.json');
const URL_WFS =
  'https://geo.api.vlaanderen.be/VRBG2025/wfs?service=WFS&version=2.0.0&request=GetFeature' +
  '&typeNames=VRBG2025:RefgemG10&outputFormat=application/json&srsName=EPSG:4326';

if (!fs.existsSync(rawFile)) {
  fs.mkdirSync(path.dirname(rawFile), { recursive: true });
  const res = await fetch(URL_WFS);
  fs.writeFileSync(rawFile, await res.text());
}

const geo = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
const feats = geo.features.filter((f) => String(f.properties.NISCODE).startsWith('3'));

// Eenvoudige equirectangulaire projectie naar meters
const LAT0 = 51.0;
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const KY = 110540;
const toM = ([lon, lat]) => [lon * KX, -lat * KY];

function polygonsOf(g) {
  if (g.type === 'Polygon') return [g.coordinates];
  if (g.type === 'MultiPolygon') return g.coordinates;
  throw new Error('onbekend type ' + g.type);
}

const munis = feats.map((f) => {
  const polys = polygonsOf(f.geometry).map((p) => p.map((ring) => ring.map(toM)));
  return { id: f.properties.NISCODE, name: f.properties.NAAM, polys };
});

// --- buurgemeentes: gedeelde grens langer dan drempel ---
function bbox(m) {
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of m.polys) for (const r of p) for (const [x, y] of r) {
    b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
  }
  return b;
}
function segDist([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx - px, y = ay + t * dy - py;
  return Math.sqrt(x * x + y * y);
}
const TOL = 25; // meter
const MIN_SHARED = 150; // meter gedeelde grens
for (const m of munis) m.bb = bbox(m);

function sharedLength(a, b) {
  // lengte van segmenten van a waarvan beide eindpunten dicht bij grens van b liggen
  const segsB = [];
  for (const p of b.polys) for (const r of p) for (let i = 0; i < r.length - 1; i++) segsB.push([r[i], r[i + 1]]);
  const near = (pt) => {
    if (pt[0] < b.bb[0] - TOL || pt[0] > b.bb[2] + TOL || pt[1] < b.bb[1] - TOL || pt[1] > b.bb[3] + TOL) return false;
    for (const [s, e] of segsB) if (segDist(pt, s, e) < TOL) return true;
    return false;
  };
  let len = 0;
  for (const p of a.polys) for (const r of p) {
    let prevNear = near(r[0]);
    for (let i = 1; i < r.length; i++) {
      const cur = near(r[i]);
      if (prevNear && cur) len += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]);
      prevNear = cur;
    }
  }
  return len;
}

const neighbors = Object.fromEntries(munis.map((m) => [m.id, []]));
for (let i = 0; i < munis.length; i++) {
  for (let j = i + 1; j < munis.length; j++) {
    const a = munis[i], b = munis[j];
    if (a.bb[0] > b.bb[2] + TOL || b.bb[0] > a.bb[2] + TOL || a.bb[1] > b.bb[3] + TOL || b.bb[1] > a.bb[3] + TOL) continue;
    const l = sharedLength(a, b);
    if (l > MIN_SHARED) {
      neighbors[a.id].push(b.id);
      neighbors[b.id].push(a.id);
    }
  }
}

// --- naar SVG viewBox ---
let B = [Infinity, Infinity, -Infinity, -Infinity];
for (const m of munis) B = [Math.min(B[0], m.bb[0]), Math.min(B[1], m.bb[1]), Math.max(B[2], m.bb[2]), Math.max(B[3], m.bb[3])];
const W = 1000;
const scale = W / (B[2] - B[0]);
const H = Math.round((B[3] - B[1]) * scale);
const P = ([x, y]) => [Math.round((x - B[0]) * scale * 10) / 10, Math.round((y - B[1]) * scale * 10) / 10];

function ringToPath(r) {
  const pts = [];
  for (const pt of r) {
    const q = P(pt);
    const last = pts[pts.length - 1];
    if (!last || Math.abs(last[0] - q[0]) + Math.abs(last[1] - q[1]) >= 0.6) pts.push(q);
  }
  if (pts.length < 3) return '';
  return 'M' + pts.map((p) => p.join(',')).join('L') + 'Z';
}

function centroid(m) {
  // zwaartepunt van grootste polygoon
  let best = null, bestA = 0;
  for (const p of m.polys) {
    const r = p[0];
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < r.length - 1; i++) {
      const [x0, y0] = r[i], [x1, y1] = r[i + 1];
      const c = x0 * y1 - x1 * y0;
      a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
    }
    if (Math.abs(a) > bestA) { bestA = Math.abs(a); best = [cx / (3 * a), cy / (3 * a)]; }
  }
  return P(best);
}

const out = {
  source: 'Voorlopig referentiebestand gemeentegrenzen (VRBG2025), Digitaal Vlaanderen – toestand 01/01/2025',
  width: W,
  height: H,
  municipalities: munis
    .map((m) => ({
      id: m.id,
      name: m.name,
      d: m.polys.map((p) => p.map(ringToPath).join('')).join(''),
      c: centroid(m),
      bb: [P([m.bb[0], m.bb[1]]), P([m.bb[2], m.bb[3]])].flat(),
      n: neighbors[m.id].sort(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'nl')),
};

fs.mkdirSync(path.join(root, 'public'), { recursive: true });
fs.writeFileSync(path.join(root, 'public', 'data.json'), JSON.stringify(out));
const isolated = out.municipalities.filter((m) => !m.n.length).map((m) => m.name);
console.log(`${out.municipalities.length} gemeentes, ${H}px hoog, ${fs.statSync(path.join(root, 'public', 'data.json')).size} bytes`);
console.log('geen buren:', isolated);
for (const m of out.municipalities) console.log(m.name.padEnd(22), m.n.map((id) => out.municipalities.find((x) => x.id === id).name).join(', '));
