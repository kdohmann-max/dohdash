import { describe, expect, test } from "vitest";
import { buildCsv, type ExportRow } from "./export";

const base: ExportRow = {
  employee: "Alice", date: "2026-06-21", job: "Smith Reno",
  start: "07:00", end: "15:30", breakHours: 0.5, netHours: 8,
  rate: 40, pay: 320, paid: false,
};

describe("buildCsv", () => {
  test("emits header then rows", () => {
    const csv = buildCsv([base]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Employee,Date,Job,Start,End,Break (h),Net hours,Rate,Pay,Paid");
    expect(lines[1]).toBe("Alice,2026-06-21,Smith Reno,07:00,15:30,0.5,8,40,320,No");
  });

  test("quotes fields with commas/quotes", () => {
    const csv = buildCsv([{ ...base, employee: "Doe, John", job: 'He said "hi"' }]);
    expect(csv.split("\r\n")[1]).toBe(
      '"Doe, John",2026-06-21,"He said ""hi""",07:00,15:30,0.5,8,40,320,No',
    );
  });

  test("blank rate/pay and Yes for paid", () => {
    const csv = buildCsv([{ ...base, rate: null, pay: null, paid: true, end: "" }]);
    expect(csv.split("\r\n")[1]).toBe("Alice,2026-06-21,Smith Reno,07:00,,0.5,8,,,Yes");
  });
});
