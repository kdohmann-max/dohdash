import type { DimensionLabel, Shape } from "./types";

/** Max distance (in 0-1000 sketch units) between a label and an edge for it to be matched. */
const MATCH_THRESHOLD = 80;

export interface DimensionMatch {
  labelIndex: number;
  shapeIndex: number;
  kind: "rect" | "line";
  edge: "width" | "height" | "length";
  /** Parsed real-world length in inches, or null if the label text isn't a measurement. */
  value: number | null;
}

/**
 * Parses a dimension label into inches. Supports feet/inches ("12'-6\"", "12 ft 6 in"),
 * plain feet ("24'", "24 ft"), inches, meters, centimeters, millimeters, and bare numbers
 * (assumed feet, the common unit on floor plans).
 */
export function parseDimension(raw: string): number | null {
  const text = raw.trim().toLowerCase();

  const feetInches = text.match(
    /^(\d+(?:\.\d+)?)\s*(?:'|ft\.?|feet|foot)\s*-?\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in\.?|inch(?:es)?)?)?$/,
  );
  if (feetInches) {
    const feet = parseFloat(feetInches[1]);
    const inches = feetInches[2] ? parseFloat(feetInches[2]) : 0;
    return feet * 12 + inches;
  }

  const inchesOnly = text.match(/^(\d+(?:\.\d+)?)\s*(?:"|in\.?|inch(?:es)?)$/);
  if (inchesOnly) return parseFloat(inchesOnly[1]);

  const meters = text.match(/^(\d+(?:\.\d+)?)\s*(?:m|meters?|metres?)$/);
  if (meters) return parseFloat(meters[1]) * 39.3701;

  const centimeters = text.match(/^(\d+(?:\.\d+)?)\s*(?:cm|centimeters?|centimetres?)$/);
  if (centimeters) return parseFloat(centimeters[1]) * 0.393701;

  const millimeters = text.match(/^(\d+(?:\.\d+)?)\s*(?:mm|millimeters?|millimetres?)$/);
  if (millimeters) return parseFloat(millimeters[1]) * 0.0393701;

  const bare = text.match(/^(\d+(?:\.\d+)?)$/);
  if (bare) return parseFloat(bare[1]) * 12;

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

/**
 * Matches each dimension label to the nearest shape edge — a rect's top edge
 * (width) or left edge (height), or a line's full segment (length) — within
 * MATCH_THRESHOLD, parsing the label's real-world value.
 */
export function matchDimensionLabels(elements: Shape[], labels: DimensionLabel[]): DimensionMatch[] {
  const matches: DimensionMatch[] = [];

  labels.forEach((lbl, labelIndex) => {
    let bestMatch: DimensionMatch | null = null;
    let bestDist = Infinity;

    elements.forEach((el, shapeIndex) => {
      if (el.kind === "rect") {
        const w = el.width ?? 0;
        const h = el.height ?? 0;

        const topDist = pointToSegmentDistance(lbl.x, lbl.y, el.x, el.y, el.x + w, el.y);
        if (topDist < bestDist) {
          bestDist = topDist;
          bestMatch = { labelIndex, shapeIndex, kind: "rect", edge: "width", value: parseDimension(lbl.text) };
        }

        const leftDist = pointToSegmentDistance(lbl.x, lbl.y, el.x, el.y, el.x, el.y + h);
        if (leftDist < bestDist) {
          bestDist = leftDist;
          bestMatch = { labelIndex, shapeIndex, kind: "rect", edge: "height", value: parseDimension(lbl.text) };
        }
      } else {
        const x2 = el.x2 ?? el.x;
        const y2 = el.y2 ?? el.y;
        const dist = pointToSegmentDistance(lbl.x, lbl.y, el.x, el.y, x2, y2);
        if (dist < bestDist) {
          bestDist = dist;
          bestMatch = { labelIndex, shapeIndex, kind: "line", edge: "length", value: parseDimension(lbl.text) };
        }
      }
    });

    if (bestMatch && bestDist <= MATCH_THRESHOLD) {
      matches.push(bestMatch);
    }
  });

  return matches;
}

/**
 * Corrects shapes' proportions to match their labeled real-world dimensions, in three passes:
 *
 * 1. Rects with BOTH width and height matched (non-null values) get their aspect ratio
 *    corrected directly — drawn width and origin stay fixed, height is recomputed from
 *    the real-world ratio.
 * 2. A global scale (sketch-units per real-world inch) is derived as the median of
 *    per-match scale samples from every shape with a parsed measurement.
 * 3. Shapes with exactly one matched dimension (a rect with only width or height, or a
 *    dimensioned line) have their unmatched dimension/length derived from the global scale.
 */
export function adjustShapeProportions(elements: Shape[], matches: DimensionMatch[]): Shape[] {
  const phase1Adjusted = new Set<number>();

  let result = elements.map((el, shapeIndex) => {
    if (el.kind !== "rect") return el;
    const w = el.width ?? 0;
    const h = el.height ?? 0;
    if (w <= 0 || h <= 0) return el;

    const widthMatch = matches.find((m) => m.shapeIndex === shapeIndex && m.kind === "rect" && m.edge === "width" && m.value != null);
    const heightMatch = matches.find((m) => m.shapeIndex === shapeIndex && m.kind === "rect" && m.edge === "height" && m.value != null);
    if (!widthMatch || !heightMatch) return el;

    phase1Adjusted.add(shapeIndex);
    const targetAspect = heightMatch.value! / widthMatch.value!;
    return { ...el, height: w * targetAspect };
  });

  const samples: number[] = [];
  for (const m of matches) {
    if (m.value == null || m.value <= 0) continue;
    const el = result[m.shapeIndex];
    if (!el) continue;

    if (m.kind === "rect") {
      if (phase1Adjusted.has(m.shapeIndex)) {
        if (m.edge === "width") samples.push((el.width ?? 0) / m.value);
      } else if (m.edge === "width") {
        samples.push((el.width ?? 0) / m.value);
      } else if (m.edge === "height") {
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
  if (globalScale == null) return result;

  result = result.map((el, shapeIndex) => {
    if (el.kind === "rect") {
      if (phase1Adjusted.has(shapeIndex)) return el;
      const w = el.width ?? 0;
      const h = el.height ?? 0;
      if (w <= 0 || h <= 0) return el;

      const widthMatch = matches.find((m) => m.shapeIndex === shapeIndex && m.kind === "rect" && m.edge === "width" && m.value != null);
      const heightMatch = matches.find((m) => m.shapeIndex === shapeIndex && m.kind === "rect" && m.edge === "height" && m.value != null);

      if (widthMatch && !heightMatch) return { ...el, height: widthMatch.value! * globalScale };
      if (heightMatch && !widthMatch) return { ...el, width: heightMatch.value! * globalScale };
      return el;
    }

    const lengthMatch = matches.find((m) => m.shapeIndex === shapeIndex && m.kind === "line" && m.edge === "length" && m.value != null);
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
      if (m.edge === "width") {
        annotations.push({ orientation: "horizontal", x1: el.x, y1: el.y, x2: el.x + w, y2: el.y, text });
      } else if (m.edge === "height") {
        annotations.push({ orientation: "vertical", x1: el.x, y1: el.y, x2: el.x, y2: el.y + h, text });
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
