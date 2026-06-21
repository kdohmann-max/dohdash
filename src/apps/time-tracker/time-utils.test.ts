import { describe, expect, test } from "vitest";
import {
  parseTimeToMinutes,
  formatMinutesAsTime,
  formatDurationHm,
  minutesToDecimalHours,
  hoursToMinutes,
  rangeNetMinutes,
  hoursNetMinutes,
} from "./time-utils";

describe("parseTimeToMinutes", () => {
  test("parses HH:MM 24h", () => {
    expect(parseTimeToMinutes("07:30")).toBe(450);
    expect(parseTimeToMinutes("00:00")).toBe(0);
    expect(parseTimeToMinutes("23:59")).toBe(1439);
  });
  test("rejects invalid", () => {
    expect(parseTimeToMinutes("")).toBeNull();
    expect(parseTimeToMinutes("7")).toBeNull();
    expect(parseTimeToMinutes("24:00")).toBeNull();
    expect(parseTimeToMinutes("07:60")).toBeNull();
  });
});

describe("formatMinutesAsTime", () => {
  test("formats to zero-padded HH:MM", () => {
    expect(formatMinutesAsTime(450)).toBe("07:30");
    expect(formatMinutesAsTime(0)).toBe("00:00");
  });
});

describe("formatDurationHm", () => {
  test("formats duration", () => {
    expect(formatDurationHm(480)).toBe("8h 0m");
    expect(formatDurationHm(455)).toBe("7h 35m");
    expect(formatDurationHm(0)).toBe("0h 0m");
  });
});

describe("minutesToDecimalHours / hoursToMinutes", () => {
  test("round-trips", () => {
    expect(minutesToDecimalHours(450)).toBe(7.5);
    expect(minutesToDecimalHours(455)).toBe(7.58);
    expect(hoursToMinutes(7.5)).toBe(450);
    expect(hoursToMinutes(8)).toBe(480);
  });
});

describe("rangeNetMinutes", () => {
  test("subtracts break from span", () => {
    expect(rangeNetMinutes(420, 930, 30)).toBe(480); // 7:00-15:30 minus 30m = 8h
    expect(rangeNetMinutes(420, 480, 0)).toBe(60);
  });
  test("never negative", () => {
    expect(rangeNetMinutes(420, 450, 60)).toBe(0);
  });
  test("null when end <= start", () => {
    expect(rangeNetMinutes(600, 600, 0)).toBeNull();
    expect(rangeNetMinutes(600, 500, 0)).toBeNull();
  });
});

describe("hoursNetMinutes", () => {
  test("subtracts break, never negative", () => {
    expect(hoursNetMinutes(510, 30)).toBe(480);
    expect(hoursNetMinutes(20, 30)).toBe(0);
  });
});
