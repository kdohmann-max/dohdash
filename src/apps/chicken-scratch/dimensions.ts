import type { DimensionLabel, Shape } from "./types";

/** Max distance (in 0-1000 sketch units) between a label and a line for it to be matched. */
const MATCH_THRESHOLD = 80;

export interface DimensionMatch {
  labelIndex: number;
  shapeIndex: number;
  /** Parsed real-world length in inches, or null if the label text isn't a measurement. */
  value: number | null;
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

/**
 * Matches each dimension label to its nearest line, within MATCH_THRESHOLD,
 * parsing the label's real-world value.
 */
export function matchDimensionLabels(elements: Shape[], labels: DimensionLabel[]): DimensionMatch[] {
  const matches: DimensionMatch[] = [];

  labels.forEach((lbl, labelIndex) => {
    let best: { dist: number; shapeIndex: number } | null = null;

    elements.forEach((el, shapeIndex) => {
      const dist = pointToSegmentDistance(lbl.x, lbl.y, el.x, el.y, el.x2, el.y2);
      if (dist <= MATCH_THRESHOLD && (!best || dist < best.dist)) {
        best = { dist, shapeIndex };
      }
    });

    if (best) {
      matches.push({
        labelIndex,
        shapeIndex: best.shapeIndex,
        value: parseDimension(lbl.text),
      });
    }
  });

  return matches;
}

/**
 * Rescales each dimensioned line so its length agrees with its label's real-world
 * value, using a shared sketch-units-per-inch scale derived as the median across
 * all matched lines.
 */
export function adjustShapeProportions(elements: Shape[], matches: DimensionMatch[]): Shape[] {
  const samples: number[] = [];
  for (const m of matches) {
    if (m.value == null || m.value <= 0) continue;
    const el = elements[m.shapeIndex];
    if (!el) continue;
    const length = Math.hypot(el.x2 - el.x, el.y2 - el.y);
    if (length > 0) samples.push(length / m.value);
  }

  if (samples.length === 0) return elements;
  const globalScale = median(samples);

  return elements.map((el, shapeIndex) => {
    const match = matches.find((m) => m.shapeIndex === shapeIndex && m.value != null);
    if (!match) return el;

    const dx = el.x2 - el.x;
    const dy = el.y2 - el.y;
    const currentLength = Math.hypot(dx, dy);
    if (currentLength <= 0) return el;

    const scaleFactor = (match.value! * globalScale) / currentLength;
    return { ...el, x2: el.x + dx * scaleFactor, y2: el.y + dy * scaleFactor };
  });
}

export interface DimensionAnnotation {
  orientation: "horizontal" | "vertical";
  /** The measured line, in sketch (0-1000) coordinates. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  text: string;
}

/**
 * Builds dimension-line annotations for matched labels (against the already-adjusted
 * lines), and returns the labels that didn't match any line so they can fall back to
 * plain text.
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

    const dx = el.x2 - el.x;
    const dy = el.y2 - el.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      annotations.push({ orientation: "horizontal", x1: el.x, y1: el.y, x2: el.x2, y2: el.y, text });
    } else {
      annotations.push({ orientation: "vertical", x1: el.x, y1: el.y, x2: el.x, y2: el.y2, text });
    }

    matchedLabelIndices.add(m.labelIndex);
  }

  const unmatched = labels.filter((_, i) => !matchedLabelIndices.has(i));
  return { annotations, unmatched };
}
