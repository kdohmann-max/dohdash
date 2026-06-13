import { describe, expect, test } from "vitest";
import {
  adjustShapeProportions,
  buildDimensionAnnotations,
  matchDimensionLabels,
  parseDimension,
} from "./dimensions";
import type { DimensionLabel, Shape } from "./types";

function rect(x: number, y: number, width: number, height: number, label?: string): Shape {
  return { kind: "rect", x, y, width, height, label };
}

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
  test("label above top edge matches as width axis", () => {
    const shapes = [rect(100, 100, 200, 100)];
    const matches = matchDimensionLabels(shapes, [lbl("10'", 200, 85)]);
    expect(matches).toHaveLength(1);
    expect(matches[0].edge).toBe("top");
  });

  test("label left of left edge matches as height axis", () => {
    const shapes = [rect(100, 100, 200, 100)];
    const matches = matchDimensionLabels(shapes, [lbl("10'", 85, 150)]);
    expect(matches).toHaveLength(1);
    expect(matches[0].edge).toBe("left");
  });

  test("label below bottom edge matches the bottom edge", () => {
    const shapes = [rect(100, 100, 200, 100)];
    const matches = matchDimensionLabels(shapes, [lbl("10'", 200, 215)]);
    expect(matches).toHaveLength(1);
    expect(matches[0].edge).toBe("bottom");
  });

  test("label right of right edge matches the right edge", () => {
    const shapes = [rect(100, 100, 200, 100)];
    const matches = matchDimensionLabels(shapes, [lbl("10'", 315, 150)]);
    expect(matches).toHaveLength(1);
    expect(matches[0].edge).toBe("right");
  });

  test("label beyond MATCH_THRESHOLD stays unmatched", () => {
    const shapes = [rect(100, 100, 200, 100)];
    const matches = matchDimensionLabels(shapes, [lbl("10'", 500, 500)]);
    expect(matches).toHaveLength(0);
  });

  test("label near a line matches its length", () => {
    const shapes = [line(0, 500, 600, 500)];
    const matches = matchDimensionLabels(shapes, [lbl("10'", 300, 480)]);
    expect(matches).toHaveLength(1);
    expect(matches[0].edge).toBe("length");
  });

  test("label on a shared wall prefers the rect it sits outside of", () => {
    // A and B share the wall at x=300; the label sits just inside B,
    // so it should measure A's right edge (it's outside A).
    const shapes = [rect(0, 0, 300, 300), rect(300, 0, 300, 300)];
    const matches = matchDimensionLabels(shapes, [lbl("10'", 310, 150)]);
    expect(matches).toHaveLength(1);
    expect(matches[0].shapeIndex).toBe(0);
    expect(matches[0].edge).toBe("right");
  });

  test("unparseable label text still matches with null value", () => {
    const shapes = [rect(100, 100, 200, 100)];
    const matches = matchDimensionLabels(shapes, [lbl("garage", 200, 85)]);
    expect(matches).toHaveLength(1);
    expect(matches[0].value).toBeNull();
  });
});

describe("adjustShapeProportions", () => {
  test("rect with both dimensions gets aspect ratio corrected", () => {
    const shapes = [rect(0, 0, 200, 200)];
    const matches = matchDimensionLabels(shapes, [
      lbl("10'", 100, -10), // top → width 120in
      lbl("20'", -10, 100), // left → height 240in
    ]);
    const adjusted = adjustShapeProportions(shapes, matches);
    expect(adjusted[0].width).toBe(200);
    expect(adjusted[0].height).toBe(400);
  });

  test("no matches leaves shapes unchanged", () => {
    const shapes = [rect(0, 0, 200, 100), line(0, 300, 400, 300)];
    const adjusted = adjustShapeProportions(shapes, []);
    expect(adjusted).toEqual(shapes);
  });

  test("single-dimension rect rescales uniformly, preserving drawn aspect", () => {
    // R1 drawn 200 wide, labeled 10' (120in); R2 drawn 200 wide, labeled 5' (60in).
    // Scale samples: 200/120 and 200/60 → median 2.5 units/inch.
    // R1 width → 120*2.5 = 300 (×1.5, so height 100 → 150).
    // R2 width → 60*2.5 = 150 (×0.75, so height 100 → 75).
    const shapes = [rect(0, 0, 200, 100), rect(200, 300, 200, 100)];
    const matches = matchDimensionLabels(shapes, [
      lbl("10'", 100, -10),
      lbl("5'", 300, 290),
    ]);
    const adjusted = adjustShapeProportions(shapes, matches);
    expect(adjusted[0].width).toBeCloseTo(300);
    expect(adjusted[0].height).toBeCloseTo(150);
    expect(adjusted[1].width).toBeCloseTo(150);
    expect(adjusted[1].height).toBeCloseTo(75);
  });

  test("line with length label rescales to global scale", () => {
    const shapes = [rect(0, 0, 250, 100), line(0, 300, 100, 300)];
    const matches = matchDimensionLabels(shapes, [
      lbl("10'", 125, -10), // rect width 120in → scale 250/120
      lbl("2'", 50, 290), // line 24in
    ]);
    const adjusted = adjustShapeProportions(shapes, matches);
    // global scale = median(250/120, 100/24) = (2.0833 + 4.1667)/2 = 3.125
    expect(adjusted[1].x2).toBeCloseTo(24 * 3.125);
    expect(adjusted[1].y2).toBe(300);
  });

  test("two rects sharing a vertical wall stay joined after resize", () => {
    // R1's width grows 200 → 300; R2 must translate right so the wall still touches.
    const shapes = [rect(0, 0, 200, 100), rect(200, 0, 200, 100)];
    const matches = matchDimensionLabels(shapes, [
      lbl("10'", 100, -10), // R1 width 120in → sample 200/120
      lbl("5'", 300, -10), // R2 width 60in → sample 200/60
    ]);
    const adjusted = adjustShapeProportions(shapes, matches);
    expect(adjusted[0].width).toBeCloseTo(300);
    expect(adjusted[1].x).toBeCloseTo(300); // translated, no gap/overlap
  });

  test("three rects in a row propagate translation", () => {
    const shapes = [
      rect(0, 0, 200, 100),
      rect(200, 0, 200, 100),
      rect(400, 0, 200, 100),
    ];
    const matches = matchDimensionLabels(shapes, [
      lbl("10'", 100, -10), // R1 → 300 wide
      lbl("5'", 500, -10), // R3 → 150 wide
    ]);
    const adjusted = adjustShapeProportions(shapes, matches);
    expect(adjusted[0].width).toBeCloseTo(300);
    expect(adjusted[1].x).toBeCloseTo(300); // R2 follows R1's new right edge
    expect(adjusted[2].x).toBeCloseTo(500); // R3 follows R2's right edge (300+200)
  });

  test("vertical stack sharing a horizontal wall stays joined", () => {
    // Top rect's height changes via aspect correction (both dims labeled);
    // the rect below must translate down to keep the shared wall.
    const shapes = [rect(0, 0, 200, 200), rect(0, 200, 200, 100)];
    const matches = matchDimensionLabels(shapes, [
      lbl("10'", 100, -10), // top width 120in
      lbl("20'", -10, 100), // top height 240in → height 200 → 400
    ]);
    const adjusted = adjustShapeProportions(shapes, matches);
    expect(adjusted[0].height).toBeCloseTo(400);
    expect(adjusted[1].y).toBeCloseTo(400);
  });

  test("line endpoint on a rect corner follows the corner", () => {
    const shapes = [rect(0, 0, 200, 100), line(200, 0, 200, 100), rect(500, 500, 200, 100)];
    const matches = matchDimensionLabels(shapes, [
      lbl("10'", 100, -10), // R1 width 120in → sample 200/120
      lbl("5'", 600, 490), // R2 width 60in → sample 200/60 → median 2.5
    ]);
    const adjusted = adjustShapeProportions(shapes, matches);
    // R1 grows to 300x150; the line along its right edge follows both corners.
    expect(adjusted[0].width).toBeCloseTo(300);
    expect(adjusted[1].x).toBeCloseTo(300);
    expect(adjusted[1].x2).toBeCloseTo(300);
    expect(adjusted[1].y2).toBeCloseTo(150);
  });
});

describe("buildDimensionAnnotations", () => {
  test("bottom and right matches produce flipped annotations on the far edges", () => {
    const shapes = [rect(100, 100, 200, 100)];
    const labels = [lbl("10'", 200, 215), lbl("5'", 315, 150)];
    const matches = matchDimensionLabels(shapes, labels);
    const { annotations, unmatched } = buildDimensionAnnotations(shapes, labels, matches);
    expect(unmatched).toHaveLength(0);
    expect(annotations).toHaveLength(2);

    const horizontal = annotations.find((a) => a.orientation === "horizontal")!;
    expect(horizontal.y1).toBe(200); // bottom edge, not top
    expect(horizontal.flip).toBe(true);

    const vertical = annotations.find((a) => a.orientation === "vertical")!;
    expect(vertical.x1).toBe(300); // right edge, not left
    expect(vertical.flip).toBe(true);
  });

  test("top and left matches are not flipped", () => {
    const shapes = [rect(100, 100, 200, 100)];
    const labels = [lbl("10'", 200, 85), lbl("5'", 85, 150)];
    const matches = matchDimensionLabels(shapes, labels);
    const { annotations } = buildDimensionAnnotations(shapes, labels, matches);
    expect(annotations).toHaveLength(2);
    for (const a of annotations) expect(a.flip).not.toBe(true);
  });

  test("unmatched labels are returned for plain-text rendering", () => {
    const shapes = [rect(100, 100, 200, 100)];
    const labels = [lbl("10'", 900, 900)];
    const { annotations, unmatched } = buildDimensionAnnotations(shapes, labels, []);
    expect(annotations).toHaveLength(0);
    expect(unmatched).toEqual(labels);
  });
});
