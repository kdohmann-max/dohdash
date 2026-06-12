export interface ModelOption {
  id: string;
  label: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  { id: "claude-opus-4-8", label: "Opus (best quality)" },
  { id: "claude-sonnet-4-6", label: "Sonnet (balanced)" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku (fastest)" },
];

export const DEFAULT_MODEL = MODEL_OPTIONS[0].id;
