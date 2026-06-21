export interface ExportRow {
  employee: string;
  date: string;
  job: string;
  start: string;
  end: string;
  breakHours: number;
  netHours: number;
  rate: number | null;
  pay: number | null;
  paid: boolean;
}

const HEADER = [
  "Employee", "Date", "Job", "Start", "End",
  "Break (h)", "Net hours", "Rate", "Pay", "Paid",
];

function escapeField(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function numOrBlank(value: number | null): string {
  return value === null ? "" : String(value);
}

export function buildCsv(rows: ExportRow[]): string {
  const lines = [HEADER.join(",")];
  for (const r of rows) {
    lines.push(
      [
        escapeField(r.employee),
        r.date,
        escapeField(r.job),
        r.start,
        r.end,
        String(r.breakHours),
        String(r.netHours),
        numOrBlank(r.rate),
        numOrBlank(r.pay),
        r.paid ? "Yes" : "No",
      ].join(","),
    );
  }
  return lines.join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
