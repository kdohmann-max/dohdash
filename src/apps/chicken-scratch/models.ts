export interface ModelOption {
  id: string;
  label: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  { id: "gemini-flash-latest", label: "Gemini Flash" },
];

export const DEFAULT_MODEL = MODEL_OPTIONS[0].id;
