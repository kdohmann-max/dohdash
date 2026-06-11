import type { DimensionLabel, Shape } from "../types";
import {
  adjustShapeProportions,
  buildDimensionAnnotations,
  matchDimensionLabels,
  type DimensionAnnotation,
} from "../dimensions";

/** Logical drawing space — matches the 0-1000 grid the model returns coordinates in. */
export const CANVAS_SIZE = 1000;
/** Output resolution multiplier for a crisp raster export. */
export const RENDER_SCALE = 2;

const DIM_OFFSET = 28;
const EXT_OVERSHOOT = 8;
const TICK_LEN = 10;

interface Theme {
  bgAlt: string;
  accent: string;
  text: string;
  muted: string;
  fontBody: string;
}

function readTheme(): Theme {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    bgAlt: read("--bg-alt", "#f7f8fa"),
    accent: read("--accent", "#00bd65"),
    text: read("--text", "#1f2328"),
    muted: read("--muted", "#5f6368"),
    fontBody: read("--font-body", "sans-serif"),
  };
}

/** Renders the blueprint to the canvas's full pixel size. Caller sets `canvas.width/height`. */
export function renderBlueprint(canvas: HTMLCanvasElement, elements: Shape[], labels: DimensionLabel[]): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const scale = canvas.width / CANVAS_SIZE;
  const theme = readTheme();

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.fillStyle = theme.bgAlt;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const matches = matchDimensionLabels(elements, labels);
  const adjusted = adjustShapeProportions(elements, matches);
  const { annotations, unmatched } = buildDimensionAnnotations(adjusted, labels, matches);

  for (const el of adjusted) {
    if (el.kind === "rect") {
      const w = el.width ?? 0;
      const h = el.height ?? 0;
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 4;
      ctx.strokeRect(el.x, el.y, w, h);

      if (el.label) {
        ctx.fillStyle = theme.muted;
        ctx.font = `24px ${theme.fontBody}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(el.label, el.x + w / 2, el.y + h / 2);
      }
    } else {
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(el.x, el.y);
      ctx.lineTo(el.x2 ?? el.x, el.y2 ?? el.y);
      ctx.stroke();
    }
  }

  for (const ann of annotations) {
    drawDimensionAnnotation(ctx, ann, theme);
  }

  for (const lbl of unmatched) {
    ctx.fillStyle = theme.text;
    ctx.font = `20px ${theme.fontBody}`;
    ctx.textAlign = lbl.anchor === "middle" ? "center" : lbl.anchor;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(lbl.text, lbl.x, lbl.y);
  }

  ctx.restore();
}

function drawDimensionAnnotation(ctx: CanvasRenderingContext2D, ann: DimensionAnnotation, theme: Theme): void {
  ctx.strokeStyle = theme.muted;
  ctx.fillStyle = theme.text;
  ctx.lineWidth = 1;

  if (ann.orientation === "horizontal") {
    const dimY = ann.y1 - DIM_OFFSET;

    // Extension lines from the rect corners up past the dimension line.
    drawLine(ctx, ann.x1, ann.y1, ann.x1, dimY - EXT_OVERSHOOT);
    drawLine(ctx, ann.x2, ann.y1, ann.x2, dimY - EXT_OVERSHOOT);

    // Dimension line with tick marks at each end.
    drawLine(ctx, ann.x1, dimY, ann.x2, dimY);
    drawTick(ctx, ann.x1, dimY);
    drawTick(ctx, ann.x2, dimY);

    drawLabel(ctx, ann.text, (ann.x1 + ann.x2) / 2, dimY - 6, theme, "center");
  } else {
    const dimX = ann.x1 - DIM_OFFSET;

    // Extension lines from the rect corners left past the dimension line.
    drawLine(ctx, ann.x1, ann.y1, dimX - EXT_OVERSHOOT, ann.y1);
    drawLine(ctx, ann.x1, ann.y2, dimX - EXT_OVERSHOOT, ann.y2);

    // Dimension line with tick marks at each end.
    drawLine(ctx, dimX, ann.y1, dimX, ann.y2);
    drawTick(ctx, dimX, ann.y1);
    drawTick(ctx, dimX, ann.y2);

    drawRotatedLabel(ctx, ann.text, dimX - 6, (ann.y1 + ann.y2) / 2, theme);
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
  theme: Theme,
  align: CanvasTextAlign,
): void {
  ctx.font = `18px ${theme.fontBody}`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";

  const metrics = ctx.measureText(text);
  const padding = 4;
  ctx.fillStyle = theme.bgAlt;
  let boxX = x;
  if (align === "center") boxX = x - metrics.width / 2;
  else if (align === "end") boxX = x - metrics.width;
  ctx.fillRect(boxX - padding, y - 14, metrics.width + padding * 2, 18);

  ctx.fillStyle = theme.text;
  ctx.fillText(text, x, y);
}

function drawRotatedLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, theme: Theme): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  drawLabel(ctx, text, 0, 0, theme, "center");
  ctx.restore();
}
