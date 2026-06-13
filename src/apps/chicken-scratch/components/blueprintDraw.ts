import type { DimensionLabel, Shape } from "../types";
import {
  adjustShapeProportions,
  buildDimensionAnnotations,
  matchDimensionLabels,
  type DimensionAnnotation,
} from "../dimensions";

/** The model's native 0-1000 coordinate space — unchanged regardless of canvas layout. */
export const MODEL_SIZE = 1000;
/** Output resolution multiplier for a crisp raster export. */
export const RENDER_SCALE = 2;

const PADDING = 70;
const BORDER_WIDTH = 1.5;
const OUTER_MARGIN = 20;

/** Logical drawing space, including the border/padding margin around the model's 0-1000 grid. */
export const CANVAS_SIZE = MODEL_SIZE + 2 * (PADDING + BORDER_WIDTH + OUTER_MARGIN);
const CONTENT_OFFSET = PADDING + BORDER_WIDTH + OUTER_MARGIN;

const PALETTE = {
  background: "#ffffff",
  ink: "#1a1a1a",
  dimension: "#6b6b6b",
  dimensionLabelBg: "#ffffff",
} as const;

const DRAW_FONT = "Helvetica, Arial, sans-serif";

const DIM_OFFSET = 28;
const EXT_OVERSHOOT = 8;
const TICK_LEN = 10;

/** Renders the blueprint to the canvas's full pixel size. Caller sets `canvas.width/height`. */
export function renderBlueprint(canvas: HTMLCanvasElement, elements: Shape[], labels: DimensionLabel[]): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const scale = canvas.width / CANVAS_SIZE;

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);

  ctx.fillStyle = PALETTE.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = BORDER_WIDTH;
  ctx.strokeRect(OUTER_MARGIN, OUTER_MARGIN, CANVAS_SIZE - 2 * OUTER_MARGIN, CANVAS_SIZE - 2 * OUTER_MARGIN);

  ctx.translate(CONTENT_OFFSET, CONTENT_OFFSET);

  const matches = matchDimensionLabels(elements, labels);
  const adjusted = adjustShapeProportions(elements, matches);
  const { annotations, unmatched } = buildDimensionAnnotations(adjusted, labels, matches);

  const { offsetX, offsetY } = centeringOffset(adjusted);
  ctx.translate(offsetX, offsetY);

  for (const el of adjusted) {
    if (el.kind === "rect") {
      const w = el.width ?? 0;
      const h = el.height ?? 0;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 4;
      ctx.strokeRect(el.x, el.y, w, h);

      if (el.label) {
        ctx.fillStyle = PALETTE.ink;
        ctx.font = `24px ${DRAW_FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(el.label, el.x + w / 2, el.y + h / 2);
      }
    } else {
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(el.x, el.y);
      ctx.lineTo(el.x2 ?? el.x, el.y2 ?? el.y);
      ctx.stroke();
    }
  }

  for (const ann of annotations) {
    drawDimensionAnnotation(ctx, ann);
  }

  for (const lbl of unmatched) {
    ctx.fillStyle = PALETTE.ink;
    ctx.font = `20px ${DRAW_FONT}`;
    ctx.textAlign = lbl.anchor === "middle" ? "center" : lbl.anchor;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(lbl.text, lbl.x, lbl.y);
  }

  ctx.restore();
}

/** Translation that centers the shapes' bounding box (plus room for dimension lines) within the model's 0-1000 grid. */
function centeringOffset(elements: Shape[]): { offsetX: number; offsetY: number } {
  if (elements.length === 0) return { offsetX: 0, offsetY: 0 };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    if (el.kind === "rect") {
      const w = el.width ?? 0;
      const h = el.height ?? 0;
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + w);
      maxY = Math.max(maxY, el.y + h);
    } else {
      const x2 = el.x2 ?? el.x;
      const y2 = el.y2 ?? el.y;
      minX = Math.min(minX, el.x, x2);
      minY = Math.min(minY, el.y, y2);
      maxX = Math.max(maxX, el.x, x2);
      maxY = Math.max(maxY, el.y, y2);
    }
  }

  const margin = DIM_OFFSET + EXT_OVERSHOOT;
  const width = maxX - minX + 2 * margin;
  const height = maxY - minY + 2 * margin;

  return {
    offsetX: (MODEL_SIZE - width) / 2 - (minX - margin),
    offsetY: (MODEL_SIZE - height) / 2 - (minY - margin),
  };
}

function drawDimensionAnnotation(ctx: CanvasRenderingContext2D, ann: DimensionAnnotation): void {
  ctx.strokeStyle = PALETTE.dimension;
  ctx.lineWidth = 1;

  // Bottom/right edges (flip) get their dimension line below/right of the shape.
  const dir = ann.flip ? 1 : -1;

  if (ann.orientation === "horizontal") {
    const dimY = ann.y1 + dir * DIM_OFFSET;

    // Extension lines from the rect corners past the dimension line.
    drawLine(ctx, ann.x1, ann.y1, ann.x1, dimY + dir * EXT_OVERSHOOT);
    drawLine(ctx, ann.x2, ann.y1, ann.x2, dimY + dir * EXT_OVERSHOOT);

    // Dimension line with tick marks at each end.
    drawLine(ctx, ann.x1, dimY, ann.x2, dimY);
    drawTick(ctx, ann.x1, dimY);
    drawTick(ctx, ann.x2, dimY);

    drawLabel(ctx, ann.text, (ann.x1 + ann.x2) / 2, ann.flip ? dimY + 20 : dimY - 6, "center");
  } else {
    const dimX = ann.x1 + dir * DIM_OFFSET;

    // Extension lines from the rect corners past the dimension line.
    drawLine(ctx, ann.x1, ann.y1, dimX + dir * EXT_OVERSHOOT, ann.y1);
    drawLine(ctx, ann.x1, ann.y2, dimX + dir * EXT_OVERSHOOT, ann.y2);

    // Dimension line with tick marks at each end.
    drawLine(ctx, dimX, ann.y1, dimX, ann.y2);
    drawTick(ctx, dimX, ann.y1);
    drawTick(ctx, dimX, ann.y2);

    drawRotatedLabel(ctx, ann.text, ann.flip ? dimX + 20 : dimX - 6, (ann.y1 + ann.y2) / 2);
  }
}

function drawLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** A 45-degree architectural tick mark crossing the dimension line at (x, y). */
function drawTick(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const half = TICK_LEN / 2;
  drawLine(ctx, x - half, y + half, x + half, y - half);
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  align: CanvasTextAlign,
): void {
  ctx.font = `18px ${DRAW_FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";

  const metrics = ctx.measureText(text);
  const padding = 4;
  ctx.fillStyle = PALETTE.dimensionLabelBg;
  let boxX = x;
  if (align === "center") boxX = x - metrics.width / 2;
  else if (align === "end") boxX = x - metrics.width;
  ctx.fillRect(boxX - padding, y - 14, metrics.width + padding * 2, 18);

  ctx.fillStyle = PALETTE.dimension;
  ctx.fillText(text, x, y);
}

function drawRotatedLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  drawLabel(ctx, text, 0, 0, "center");
  ctx.restore();
}
