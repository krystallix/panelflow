import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDxfToMmSegments } from "@/lib/dxf-parser";

describe("Builtin Schneider DXF Assets", () => {
  it("parses MCADPP0003369_2D-front.dxf (LC1D09) with real mm dimensions (~45 x 76 mm)", () => {
    const dxfPath = path.resolve(
      process.cwd(),
      "public/cad/LC1D09/MCADPP0003369_2D-front.dxf"
    );
    const rawText = fs.readFileSync(dxfPath, "utf8");
    const parsed = parseDxfToMmSegments(rawText, "mm");

    expect(parsed.warning).toBeUndefined();
    expect(parsed.segments.length).toBeGreaterThan(100);
    expect(parsed.boundingBoxMm.w).toBeGreaterThanOrEqual(44);
    expect(parsed.boundingBoxMm.w).toBeLessThanOrEqual(46);
    expect(parsed.boundingBoxMm.h).toBeGreaterThanOrEqual(75);
    expect(parsed.boundingBoxMm.h).toBeLessThanOrEqual(78);
  });

  it("parses MCADPD0004675_2D-front.dxf (LRD10 TOR) with real mm dimensions (~45 x 66 mm)", () => {
    const dxfPath = path.resolve(
      process.cwd(),
      "public/cad/LRD10/MCADPD0004675_2D-front.dxf"
    );
    const rawText = fs.readFileSync(dxfPath, "utf8");
    const parsed = parseDxfToMmSegments(rawText, "mm");

    expect(parsed.warning).toBeUndefined();
    expect(parsed.segments.length).toBeGreaterThan(50);
    expect(parsed.boundingBoxMm.w).toBeGreaterThanOrEqual(44);
    expect(parsed.boundingBoxMm.w).toBeLessThanOrEqual(46);
    expect(parsed.boundingBoxMm.h).toBeGreaterThanOrEqual(64);
    expect(parsed.boundingBoxMm.h).toBeLessThanOrEqual(67);
  });
});
