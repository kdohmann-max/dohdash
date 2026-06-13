import type { DimensionLabel, Shape } from "./types";

/** Max distance (in 0-1000 sketch units) between a label and an edge for it to be matched. */
const MATCH_THRESHOLD = 80;
/** Two candidate edges this close in distance are a tie, resolved by the outside-the-shape rule. */
const TIE_EPSILON = 10;
/** Max gap (sketch units) for two shapes to count as touching before proportions are adjusted. */
const SNAP_TOL = 15;

export type MatchedEdge = "top" | "bottom" | "left" | "right" | "length";

export interface DimensionMatch {
  labelIndex: number;
  shapeIndex: number;
  kind: "rect" | "line";
  edge: MatchedEdge;
  /** Parsed real-world length in inches, or null if the label text isn't a measurement. */
  value: number | null;
}

/** Which rect dimension a matched edge measures. */
function edgeAxis(edge: MatchedEdge): "width" | "height" | "length" {
  if (edge === "top" || edge === "bottom") return "width";
  if (edge === "left" || edge === "right") return "height";
  return "length";
}

/** Number token: "12", "12.5", "12 1/2", or "1/2". */
const NUM = String.raw`\d+(?:\.\d+)?(?:\s+\d+\s*\/\s*\d+)?|\d+\s*\/\s*\d+`;

function parseNum(s: string): number {
  const frac = s.match(/^(?:(\d+(?:\.\d+)?)\s+)?(\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const whole = frac[1] ? parseFloat(frac[1]) : 0;
    return whole + parseInt(frac[2], 10) / parseInt(frac[3], 10);
  }
  return parseFloat(s);
}

/**
 * Parses a dimension label into inches. Supports feet/inches ("12'-6\"", "12 ft 6 in"),
 * plain feet ("24'", "24 ft"), inches, meters, centimeters, millimeters, fractions
 * ("12 1/2\""), and bare numbers (assumed feet, the common unit on floor plans).
 */
export function parseDimension(raw: string): number | null {
  const text = raw.trim().toLowerCase();

  const feetInches = text.match(
    new RegExp(`^(${NUM})\\s*(?:'|ft\\.?|feet|foot)\\s*-?\\s*(?:(${NUM})\\s*(?:"|in\\.?|inch(?:es)?)?)?$`),
  );
  if (feetInches) {
    const feet = parseNum(feetInches[1]);
    const inches = feetInches[2] ? parseNum(feetInches[2]) : 0;
    return feet * 12 + inches;
  }

  const inchesOnly = text.match(new RegExp(`^(${NUM})\\s*(?:"|in\\.?|inch(?:es)?)$`));
  if (inchesOnly) return parseNum(inchesOnly[1]);

  const meters = text.match(/^(\d+(?:\.\d+)?)\s*(?:m|meters?|metres?)$/);
  if (meters) return parseFloat(meters[1]) * 39.3701;

  const centimeters = text.match(/^(\d+(?:\.\d+)?)\s*(?:cm|centimeters?|centimetres?)$/);
  if (centimeters) return parseFloat(centimeters[1]) * 0.393701;

  const millimeters = text.match(/^(\d+(?:\.\d+)?)\s*(?:mm|millimeters?|millimetres?)$/);
  if (millimeters) return parseFloat(millimeters[1]) * 0.0393701;

  const bare = text.match(new RegExp(`^(${NUM})$`));
  if (bare) return parseNum(bare[1]) * 12;

  return null;
}

function pointToSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function median(numbers: number[]): number {
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface EdgeCandidate {
  dist: number;
  shapeIndex: number;
  kind: "rect" | "line";
  edge: MatchedEdge;
  /** Whether the label sits outside the candidate's rect (dimension text convention). */
  outside: boolean;
}

/**
 * Matches each dimension label to the nearest shape edge — any of a rect's four
 * edges (top/bottom measure width, left/right measure height) or a line's full
 * segment (length) — within MATCH_THRESHOLD, parsing the label's real-world value.
 * When two edges are nearly equidistant (a label on a shared wall), the edge whose
 * rect the label sits outside of wins, since dimension text is written outside the
 * measured shape.
 */
export function matchDimensionLabels(elements: Shape[], labels: DimensionLabel[]): DimensionMatch[] {
  const matches: DimensionMatch[] = [];

  labels.forEach((lbl, labelIndex) => {
    const candidates: EdgeCandidate[] = [];

    elements.forEach((el, shapeIndex) => {
      if (el.kind === "rect") {
        const w = el.width ?? 0;
        const h = el.height ?? 0;
        const inside = lbl.x > el.x && lbl.x < el.x + w && lbl.y > el.y && lbl.y < el.y + h;
        const edges: Array<[MatchedEdge, number, number, number, number]> = [
          ["top", el.x, el.y, el.x + w, el.y],
          ["bottom", el.x, el.y + h, el.x + w, el.y + h],
          ["left", el.x, el.y, el.x, el.y + h],
          ["right", el.x + w, el.y, el.x + w, el.y + h],
        ];
        for (const [edge, x1, y1, x2, y2] of edges) {
          const dist = pointToSegmentDistance(lbl.x, lbl.y, x1, y1, x2, y2);
          if (dist <= MATCH_THRESHOLD) {
            candidates.push({ dist, shapeIndex, kind: "rect", edge, outside: !inside });
          }
        }
      } else {
        const x2 = el.x2 ?? el.x;
        const y2 = el.y2 ?? el.y;
        const dist = pointToSegmentDistance(lbl.x, lbl.y, el.x, el.y, x2, y2);
        if (dist <= MATCH_THRESHOLD) {
          candidates.push({ dist, shapeIndex, kind: "line", edge: "length", outside: true });
        }
      }
    });

    let best: EdgeCandidate | null = null;
    for (const c of candidates) {
      if (!best) {
        best = c;
      } else if (c.dist < best.dist - TIE_EPSILON) {
        best = c;
      } else if (c.dist <= best.dist + TIE_EPSILON && c.outside && !best.outside) {
        best = c;
      }
    }

    if (best) {
      matches.push({
        labelIndex,
        shapeIndex: best.shapeIndex,
        kind: best.kind,
        edge: best.edge,
        value: parseDimension(lbl.text),
      });
    }
  });

  return matches;
}

/** A "B touches A's right/bottom edge" relationship recorded before adjustment. */
interface AdjacencyConstraint {
  axis: "x" | "y";
  from: number;
  to: number;
  /** Original coordinate of `from` along the axis, for processing order. */
  fromStart: number;
}

/** A line endpoint that coincided with a rect corner before adjustment. */
interface CornerAttachment {
  lineIndex: number;
  end: "p1" | "p2";
  rectIndex: number;
  corner: "tl" | "tr" | "bl" | "br";
}

function intervalsOverlap(a1: number, a2: number, b1: number, b2: number): boolean {
  return Math.min(a2, b2) - Math.max(a1, b1) > 0;
}

function detectAdjacency(elements: Shape[]): AdjacencyConstraint[] {
  const constraints: AdjacencyConstraint[] = [];
  elements.forEach((a, i) => {
    if (a.kind !== "rect") return;
    const aw = a.width ?? 0;
    const ah = a.height ?? 0;
    elements.forEach((b, j) => {
      if (i === j || b.kind !== "rect") return;
      const bw = b.width ?? 0;
      const bh = b.height ?? 0;
      if (
        Math.abs(a.x + aw - b.x) <= SNAP_TOL &&
        intervalsOverlap(a.y, a.y + ah, b.y, b.y + bh)
      ) {
        constraints.push({ axis: "x", from: i, to: j, fromStart: a.x });
      }
      if (
        Math.abs(a.y + ah - b.y) <= SNAP_TOL &&
        intervalsOverlap(a.x, a.x + aw, b.x, b.x + bw)
      ) {
        constraints.push({ axis: "y", from: i, to: j, fromStart: a.y });
      }
    });
  });
  return constraints;
}

function detectCornerAttachments(elements: Shape[]): CornerAttachment[] {
  const attachments: CornerAttachment[] = [];
  elements.forEach((ln, lineIndex) => {
    if (ln.kind !== "line") return;
    const ends: Array<["p1" | "p2", number, number]> = [
      ["p1", ln.x, ln.y],
      ["p2", ln.x2 ?? ln.x, ln.y2 ?? ln.y],
    ];
    for (const [end, px, py] of ends) {
      let found = false;
      elements.forEach((r, rectIndex) => {
        if (found || r.kind !== "rect") return;
        const w = r.width ?? 0;
        const h = r.height ?? 0;
        const corners: Array<["tl" | "tr" | "bl" | "br", number, number]> = [
          ["tl", r.x, r.y],
          ["tr", r.x + w, r.y],
          ["bl", r.x, r.y + h],
          ["br", r.x + w, r.y + h],
        ];
        for (const [corner, cx, cy] of corners) {
          if (Math.hypot(px - cx, py - cy) <= SNAP_TOL) {
            attachments.push({ lineIndex, end, rectIndex, corner });
            found = true;
            return;
          }
        }
      });
    }
  });
  return attachments;
}

function cornerPosition(r: Shape, corner: "tl" | "tr" | "bl" | "br"): [number, number] {
  const w = r.width ?? 0;
  const h = r.height ?? 0;
  if (corner === "tl") return [r.x, r.y];
  if (corner === "tr") return [r.x + w, r.y];
  if (corner === "bl") return [r.x, r.y + h];
  return [r.x + w, r.y + h];
}

/**
 * Corrects shapes' proportions to match their labeled real-world dimensions:
 *
 * 1. Rects with BOTH width and height matched (non-null values) get their aspect ratio
 *    corrected directly — drawn width and origin stay fixed, height is recomputed from
 *    the real-world ratio.
 * 2. A global scale (sketch-units per real-world inch) is derived as the median of
 *    per-match scale samples from every shape with a parsed measurement.
 * 3. Shapes with exactly one matched dimension are rescaled uniformly so the matched
 *    dimension agrees with the global scale, preserving the drawn aspect ratio (a
 *    dimensioned line's length is rescaled the same way).
 * 4. Shapes that touched before adjustment are re-snapped: rects that shared an edge
 *    are translated so the edge still coincides, and line endpoints that sat on a rect
 *    corner follow that corner.
 */
export function adjustShapeProportions(elements: Shape[], matches: DimensionMatch[]): Shape[] {
  // Record who touches whom on the ORIGINAL geometry, before anything moves.
  const constraints = detectAdjacency(elements);
  const attachments = detectCornerAttachments(elements);

  const matchFor = (shapeIndex: number, axis: "width" | "height") =>
    matches.find(
      (m) => m.shapeIndex === shapeIndex && m.kind === "rect" && edgeAxis(m.edge) === axis && m.value != null,
    );

  // Phase 1: rects with both dimensions labeled — fix the aspect ratio directly.
  const phase1Adjusted = new Set<number>();

  let result = elements.map((el, shapeIndex) => {
    if (el.kind !== "rect") return el;
    const w = el.width ?? 0;
    const h = el.height ?? 0;
    if (w <= 0 || h <= 0) return el;

    const widthMatch = matchFor(shapeIndex, "width");
    const heightMatch = matchFor(shapeIndex, "height");
    if (!widthMatch || !heightMatch) return el;

    phase1Adjusted.add(shapeIndex);
    const targetAspect = heightMatch.value! / widthMatch.value!;
    return { ...el, height: w * targetAspect };
  });

  // Phase 2: derive the global sketch-units-per-inch scale.
  const samples: number[] = [];
  for (const m of matches) {
    if (m.value == null || m.value <= 0) continue;
    const el = result[m.shapeIndex];
    if (!el) continue;

    if (m.kind === "rect") {
      const axis = edgeAxis(m.edge);
      if (phase1Adjusted.has(m.shapeIndex)) {
        if (axis === "width") samples.push((el.width ?? 0) / m.value);
      } else if (axis === "width") {
        samples.push((el.width ?? 0) / m.value);
      } else if (axis === "height") {
        samples.push((el.height ?? 0) / m.value);
      }
    } else {
      const x2 = el.x2 ?? el.x;
      const y2 = el.y2 ?? el.y;
      const length = Math.hypot(x2 - el.x, y2 - el.y);
      samples.push(length / m.value);
    }
  }

  const globalScale = samples.length > 0 ? median(samples) : null;

  // Phase 3: single-dimension shapes — uniform rescale to agree with the global scale.
  if (globalScale != null) {
    result = result.map((el, shapeIndex) => {
      if (el.kind === "rect") {
        if (phase1Adjusted.has(shapeIndex)) return el;
        const w = el.width ?? 0;
        const h = el.height ?? 0;
        if (w <= 0 || h <= 0) return el;

        const widthMatch = matchFor(shapeIndex, "width");
        const heightMatch = matchFor(shapeIndex, "height");

        if (widthMatch && !heightMatch) {
          const factor = (widthMatch.value! * globalScale) / w;
          return { ...el, width: w * factor, height: h * factor };
        }
        if (heightMatch && !widthMatch) {
          const factor = (heightMatch.value! * globalScale) / h;
          return { ...el, width: w * factor, height: h * factor };
        }
        return el;
      }

      const lengthMatch = matches.find(
        (m) => m.shapeIndex === shapeIndex && m.kind === "line" && m.value != null,
      );
      if (!lengthMatch) return el;

      const x2 = el.x2 ?? el.x;
      const y2 = el.y2 ?? el.y;
      const dx = x2 - el.x;
      const dy = y2 - el.y;
      const currentLength = Math.hypot(dx, dy);
      if (currentLength <= 0) return el;

      const scaleFactor = (lengthMatch.value! * globalScale) / currentLength;
      return { ...el, x2: el.x + dx * scaleFactor, y2: el.y + dy * scaleFactor };
    });
  }

  // Phase 4a: re-snap rects that shared an edge, by pure translation, upstream first.
  for (const axis of ["x", "y"] as const) {
    const axisConstraints = constraints
      .filter((c) => c.axis === axis)
      .sort((a, b) => a.fromStart - b.fromStart);
    const translated = new Set<number>();
    for (const c of axisConstraints) {
      if (translated.has(c.to)) continue;
      const from = result[c.from];
      const to = result[c.to];
      if (from.kind !== "rect" || to.kind !== "rect") continue;
      const target = axis === "x" ? from.x + (from.width ?? 0) : from.y + (from.height ?? 0);
      const current = axis === "x" ? to.x : to.y;
      if (current === target) continue;
      result[c.to] = axis === "x" ? { ...to, x: target } : { ...to, y: target };
      translated.add(c.to);
    }
  }

  // Phase 4b: line endpoints that sat on a rect corner follow the corner.
  for (const a of attachments) {
    const ln = result[a.lineIndex];
    const r = result[a.rectIndex];
    if (ln.kind !== "line" || r.kind !== "rect") continue;
    const [cx, cy] = cornerPosition(r, a.corner);
    result[a.lineIndex] =
      a.end === "p1" ? { ...ln, x: cx, y: cy } : { ...ln, x2: cx, y2: cy };
  }

  return result;
}

export interface DimensionAnnotation {
  orientation: "horizontal" | "vertical";
  /** The measured edge/segment, in sketch (0-1000) coordinates. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  text: string;
  /** True when the dimension line should render below/right of the edge (bottom/right edges). */
  flip?: boolean;
}

/**
 * Builds proper dimension-line annotations for matched labels (against the
 * already-adjusted shapes), and returns the labels that didn't match any edge
 * so they can fall back to plain text.
 */
export function buildDimensionAnnotations(
  elements: Shape[],
  labels: DimensionLabel[],
  matches: DimensionMatch[],
): { annotations: DimensionAnnotation[]; unmatched: DimensionLabel[] } {
  const annotations: DimensionAnnotation[] = [];
  const matchedLabelIndices = new Set<number>();

  for (const m of matches) {
    const el = elements[m.shapeIndex];
    if (!el) continue;
    const text = labels[m.labelIndex].text;

    if (el.kind === "rect") {
      const w = el.width ?? 0;
      const h = el.height ?? 0;
      if (m.edge === "top") {
        annotations.push({ orientation: "horizontal", x1: el.x, y1: el.y, x2: el.x + w, y2: el.y, text });
      } else if (m.edge === "bottom") {
        annotations.push({ orientation: "horizontal", x1: el.x, y1: el.y + h, x2: el.x + w, y2: el.y + h, text, flip: true });
      } else if (m.edge === "left") {
        annotations.push({ orientation: "vertical", x1: el.x, y1: el.y, x2: el.x, y2: el.y + h, text });
      } else if (m.edge === "right") {
        annotations.push({ orientation: "vertical", x1: el.x + w, y1: el.y, x2: el.x + w, y2: el.y + h, text, flip: true });
      } else {
        continue;
      }
    } else {
      const x2 = el.x2 ?? el.x;
      const y2 = el.y2 ?? el.y;
      const dx = x2 - el.x;
      const dy = y2 - el.y;
      if (Math.abs(dx) >= Math.abs(dy)) {
        annotations.push({ orientation: "horizontal", x1: el.x, y1: el.y, x2, y2: el.y, text });
      } else {
        annotations.push({ orientation: "vertical", x1: el.x, y1: el.y, x2: el.x, y2, text });
      }
    }

    matchedLabelIndices.add(m.labelIndex);
  }

  const unmatched = labels.filter((_, i) => !matchedLabelIndices.has(i));
  return { annotations, unmatched };
}
