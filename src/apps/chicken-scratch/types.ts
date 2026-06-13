export interface Shape {
  kind: "line";
  x: number;
  y: number;
  x2: number;
  y2: number;
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
