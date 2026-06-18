export interface Shape {
  kind: "rect" | "line";
  x: number;
  y: number;
  width?: number;
  height?: number;
  x2?: number;
  y2?: number;
  label?: string;
}

export interface DimensionLabel {
  text: string;
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
}

export type ProcessResult =
  | { type: "handwriting"; markdown: string }
  | { type: "blueprint"; elements: Shape[]; labels: DimensionLabel[] };
