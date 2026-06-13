import { describe, expect, test } from "vitest";
import {
  adjustShapeProportions,
  buildDimensionAnnotations,
  matchDimensionLabels,
  parseDimension,
} from "./dimensions";
import type { DimensionLabel, Shape } from "./types";

function line(x: number, y: number, x2: number, y2: number): Shape {
  return { kind: "line", x, y, x2, y2 };
}

function lbl(text: string, x: number, y: number): DimensionLabel {
  return { text, x, y, anchor: "middle" };
}

describe("parseDimension", () => {
  test("feet and inches", () => {
    expect(parseDimension(`12'-6"`)).toBe(150);
    expect(parseDimension("12 ft 6 in")).toBe(150);
    expect(parseDimension("24'")).toBe(288);
    expect(parseDimension("24 ft")).toBe(288);
  });

  test("inches only", () => {
    expect(parseDimension(`18"`)).toBe(18);
    expect(parseDimension("18 in")).toBe(18);
  });

  test("metric", () => {
    expect(parseDimension("3m")).toBeCloseTo(118.11, 1);
    expect(parseDimension("30cm")).toBeCloseTo(11.81, 1);
    expect(parseDimension("300mm")).toBeCloseTo(11.81, 1);
  });

  test("bare number is feet", () => {
    expect(parseDimension("24")).toBe(288);
    expect(parseDimension("12.5")).toBe(150);
  });

  test("fractions", () => {
    expect(parseDimension(`12 1/2"`)).toBe(12.5);
    expect(parseDimension(`12'-6 1/2"`)).toBe(150.5);
    expect(parseDimension(`1/2"`)).toBe(0.5);
    expect(parseDimension("12 1/2")).toBe(150); // bare fraction = feet
  });

  test("non-measurements return null", () => {
    expect(parseDimension("kitchen")).toBeNull();
    expect(parseDimension("")).toBeNull();
  });
});

describe("matchDimensionLabels", () => {
  test("label near a line matches it", () => {
    const shapes = [line(0, 500, 600, 500)];
    const matches = matchDimensionLabels(shapes, [lbl("10'", 300, 480)]);
    expect(matches).toHaveLength(1);
    expect(matches[0].shapeIndex).toBe(0);
  });

  test("label beyond MATCH_THRESHOLD stays unmatched", () => {
    const shapes = [line(0, 500, 600, 500)];
    const matches = matchDimensionLabels(shapes, [lbl("10'", 500, 900)]);
    expect(matches).toHaveLength(0);
  });

  test("label matches the nearer of two lines", () => {
    const shapes = [line(0, 0, 300, 0), line(0, 100, 300, 100)];
    const matches = matchDimensionLabels(shapes, [lbl("10'", 150, 70)]);
    expect(matches).toHaveLength(1);
    expect(matches[0].shapeIndex).toBe(1);
  });

  test("unparseable label text still matches with null value", () => {
    const shapes = [line(0, 0, 300, 0)];
    const matches = matchDimensionLabels(shapes, [lbl("garage", 150, -10)]);
    expect(matches).toHaveLength(1);
    expect(matches[0].value).toBeNull();
  });
});

describe("adjustShapeProportions", () => {
  test("no matches leaves shapes unchanged", () => {
    const shapes = [line(0, 0, 200, 0), line(0, 300, 400, 300)];
    const adjusted = adjustShapeProportions(shapes, []);
    expect(adjusted).toEqual(shapes);
  });

  test("two dimensioned lines rescale uniformly via the global scale", () => {
    // L1 drawn 200 long, labeled 10' (120in); L2 drawn 200 long, labeled 5' (60in).
    // Scale samples: 200/120 and 200/60 → median 2.5 units/inch.
    // L1 → 120*2.5 = 300; L2 → 60*2.5 = 150.
    const shapes = [line(0, 0, 200, 0), line(0, 300, 200, 300)];
    const matches = matchDimensionLabels(shapes, [
      lbl("10'", 100, -10),
      lbl("5'", 100, 290),
    ]);
    const adjusted = adjustShapeProportions(shapes, matches);
    expect(Math.hypot(adjusted[0].x2 - adjusted[0].x, adjusted[0].y2 - adjusted[0].y)).toBeCloseTo(300);
    expect(Math.hypot(adjusted[1].x2 - adjusted[1].x, adjusted[1].y2 - adjusted[1].y)).toBeCloseTo(150);
  });

  test("line with no dimension label is left unscaled", () => {
    const shapes = [line(0, 0, 250, 0), line(0, 300, 100, 300)];
    const matches = matchDimensionLabels(shapes, [
      lbl("10'", 125, -10), // first line 250 long → scale 250/120
    ]);
    const adjusted = adjustShapeProportions(shapes, matches);
    expect(adjusted[1]).toEqual(shapes[1]);
  });
});

describe("buildDimensionAnnotations", () => {
  test("horizontal line produces a horizontal annotation", () => {
    const shapes = [line(100, 100, 300, 100)];
    const labels = [lbl("10'", 200, 80)];
    const matches = matchDimensionLabels(shapes, labels);
    const { annotations, unmatched } = buildDimensionAnnotations(shapes, labels, matches);
    expect(unmatched).toHaveLength(0);
    expect(annotations).toHaveLength(1);
    expect(annotations[0].orientation).toBe("horizontal");
  });

  test("vertical line produces a vertical annotation", () => {
    const shapes = [line(100, 100, 100, 300)];
    const labels = [lbl("10'", 80, 200)];
    const matches = matchDimensionLabels(shapes, labels);
    const { annotations } = buildDimensionAnnotations(shapes, labels, matches);
    expect(annotations).toHaveLength(1);
    expect(annotations[0].orientation).toBe("vertical");
  });

  test("unmatched labels are returned for plain-text rendering", () => {
    const shapes = [line(100, 100, 300, 100)];
    const labels = [lbl("10'", 900, 900)];
    const { annotations, unmatched } = buildDimensionAnnotations(shapes, labels, []);
    expect(annotations).toHaveLength(0);
    expect(unmatched).toEqual(labels);
  });
});
