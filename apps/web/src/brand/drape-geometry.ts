/**
 * Geometry for the stylised theatre drape used in the hero and the OG image.
 *
 * A drape is a set of vertical pleats hanging from a rod (y = 0), gathered by a
 * tieback (y = tieY) towards x = 0 and flaring again to the floor (y = H).
 * Each pleat is drawn as two flat facets (lit / shadow) — a deliberately
 * graphic, poster-like treatment rather than photoreal fabric — so the SVG
 * stays tiny and needs no filters.
 */

export interface DrapeGeometry {
  width: number;
  height: number;
  lit: string[];
  shade: string[];
  ridges: string[];
  tieY: number;
  tieWidth: number;
}

const r = (n: number) => Math.round(n * 10) / 10;

interface Edge {
  top: number;
  tie: number;
  bottom: number;
}

function forward(e: Edge, tieY: number, H: number): string {
  const c1 = `${r(e.top)} ${r(tieY * 0.42)}`;
  const c2 = `${r(e.tie + (e.top - e.tie) * 0.3)} ${r(tieY * 0.82)}`;
  const c3 = `${r(e.tie)} ${r(tieY + (H - tieY) * 0.18)}`;
  const c4 = `${r(e.bottom)} ${r(H - (H - tieY) * 0.45)}`;
  return `C${c1} ${c2} ${r(e.tie)} ${tieY}C${c3} ${c4} ${r(e.bottom)} ${H}`;
}

function backward(e: Edge, tieY: number, H: number): string {
  const c3 = `${r(e.tie)} ${r(tieY + (H - tieY) * 0.18)}`;
  const c4 = `${r(e.bottom)} ${r(H - (H - tieY) * 0.45)}`;
  const c1 = `${r(e.top)} ${r(tieY * 0.42)}`;
  const c2 = `${r(e.tie + (e.top - e.tie) * 0.3)} ${r(tieY * 0.82)}`;
  return `C${c4} ${c3} ${r(e.tie)} ${tieY}C${c2} ${c1} ${r(e.top)} 0`;
}

export function buildDrape({
  pleats = 7,
  width = 200,
  height = 1000,
  tieY = 610,
  tieWidth = 62,
  floorWidth = 118,
}: Partial<{ pleats: number; width: number; height: number; tieY: number; tieWidth: number; floorWidth: number }> = {}): DrapeGeometry {
  const edges: Edge[] = [];
  const n = pleats * 2;
  for (let j = 0; j <= n; j++) {
    const t = j / n;
    // ease the spread so outer pleats are a touch wider (fabric falls heavier there)
    const spread = t * (0.85 + 0.15 * t);
    edges.push({ top: spread * width, tie: t * tieWidth, bottom: spread * floorWidth });
  }
  const facet = (a: Edge, b: Edge) =>
    `M${r(a.top)} 0${forward(a, tieY, height)}L${r(b.bottom)} ${height}${backward(b, tieY, height)}Z`;
  const lit: string[] = [];
  const shade: string[] = [];
  const ridges: string[] = [];
  for (let i = 0; i < pleats; i++) {
    const a = edges[2 * i];
    const c = edges[2 * i + 1];
    const b = edges[2 * i + 2];
    if (!a || !b || !c) break;
    lit.push(facet(a, c));
    shade.push(facet(c, b));
    ridges.push(`M${r(c.top)} 0${forward(c, tieY, height)}`);
  }
  return { width, height, lit, shade, ridges, tieY, tieWidth };
}
