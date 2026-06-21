export interface BreakOption { id: string; label: string; minutes: number; }

export const BREAK_OPTIONS: BreakOption[] = [
  { id: "coffee", label: "Coffee break (15 min)", minutes: 15 },
  { id: "lunch30", label: "Lunch (30 min)", minutes: 30 },
  { id: "lunch60", label: "Lunch (60 min)", minutes: 60 },
];
