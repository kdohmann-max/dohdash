import type { DimensionLabel, Shape } from "./types";

/** Max distance (in 0-1000 sketch units) between a label and an edge for it to be matched. */
const MATCH_THRESHOLD = 80;

export interface DimensionMatch {
  labelIndex: number;
  rectIndex: number;
  edge: "width" | "height";
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

/**
 * Matches each dimension label to the nearest rect edge (top edge = width,
 * left edge = height) within MATCH_THRESHOLD, parsing the label's real-world value.
 */
export function matchDimensionLabels(elements: Shape[], labels: DimensionLabel[]): DimensionMatch[] {
  const matches: DimensionMatch[] = [];

  labels.forEach((lbl, labelIndex) => {
    let bestMatch: DimensionMatch | null = null;
    let bestDist = Infinity;

    elements.forEach((el, rectIndex) => {
      if (el.kind !== "rect") return;
      const w = el.width ?? 0;
      const h = el.height ?? 0;

      const topDist = pointToSegmentDistance(lbl.x, lbl.y, el.x, el.y, el.x + w, el.y);
      if (topDist < bestDist) {
        bestDist = topDist;
        bestMatch = { labelIndex, rectIndex, edge: "width", value: parseDimension(lbl.text) };
      }

      const leftDist = pointToSegmentDistance(lbl.x, lbl.y, el.x, el.y, el.x, el.y + h);
      if (leftDist < bestDist) {
        bestDist = leftDist;
        bestMatch = { labelIndex, rectIndex, edge: "height", value: parseDimension(lbl.text) };
      }
    });

    if (bestMatch && bestDist <= MATCH_THRESHOLD) {
      matches.push(bestMatch);
    }
  });

  return matches;
}

/**
 * Corrects each rect's aspect ratio to match its labeled real-world dimensions
 * (when both its width and height edges have a parsed measurement), keeping the
 * rect's drawn width and origin fixed and recomputing height from the real ratio.
 */
export function adjustShapeProportions(elements: Shape[], matches: DimensionMatch[]): Shape[] {
  return elements.map((el, rectIndex) => {
    if (el.kind !== "rect") return el;
    const w = el.width ?? 0;
    const h = el.height ?? 0;
    if (w <= 0 || h <= 0) return el;

    const widthMatch = matches.find((m) => m.rectIndex === rectIndex && m.edge === "width" && m.value != null);
    const heightMatch = matches.find((m) => m.rectIndex === rectIndex && m.edge === "height" && m.value != null);
    if (!widthMatch || !heightMatch) return el;

    const targetAspect = heightMatch.value! / widthMatch.value!;
    return { ...el, height: w * targetAspect };
  });
}

export interface DimensionAnnotation {
  orientation: "horizontal" | "vertical";
  /** The rect edge being measured, in sketch (0-1000) coordinates. */
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
    const el = elements[m.rectIndex];
    if (!el || el.kind !== "rect") continue;
    const w = el.width ?? 0;
    const h = el.height ?? 0;
    const text = labels[m.labelIndex].text;

    if (m.edge === "width") {
      annotations.push({ orientation: "horizontal", x1: el.x, y1: el.y, x2: el.x + w, y2: el.y, text });
    } else {
      annotations.push({ orientation: "vertical", x1: el.x, y1: el.y, x2: el.x, y2: el.y + h, text });
    }
    matchedLabelIndices.add(m.labelIndex);
  }

  const unmatched = labels.filter((_, i) => !matchedLabelIndices.has(i));
  return { annotations, unmatched };
}
