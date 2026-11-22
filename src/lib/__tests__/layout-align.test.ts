import { describe, expect, it } from "vitest";
import {
  computeAlignToPlatePosition,
  computeAlignToRailX,
  computeAutoResizeHeight,
  computeAutoResizeWidth,
} from "../layout-align";
import type { DinRail, WireDuct } from "@/types/panel";

describe("layout-align", () => {
  it("aligns duct or item to mounting plate top/bottom/left/right", () => {
    const plateW = 500;
    const plateH = 700;
    expect(computeAlignToPlatePosition(400, 40, 10, 20, plateW, plateH, "top")).toEqual({
      xMm: 10,
      yMm: 330,
    });
    expect(computeAlignToPlatePosition(400, 40, 10, 20, plateW, plateH, "bottom")).toEqual({
      xMm: 10,
      yMm: -330,
    });
    expect(computeAlignToPlatePosition(40, 600, 10, 20, plateW, plateH, "left")).toEqual({
      xMm: -230,
      yMm: 20,
    });
    expect(computeAlignToPlatePosition(40, 600, 10, 20, plateW, plateH, "right")).toEqual({
      xMm: 230,
      yMm: 20,
    });
  });

  it("aligns component along its mounted DIN rail", () => {
    const rail = { xMm: 20, lengthMm: 400 };
    expect(computeAlignToRailX(36, rail, "left")).toBe(-162);
    expect(computeAlignToRailX(36, rail, "center")).toBe(20);
    expect(computeAlignToRailX(36, rail, "right")).toBe(202);
  });

  it("auto-resizes DIN rail to full mounting plate width when sides are empty", () => {
    const rail: DinRail = { id: "r1", name: "Rail 1", xMm: 25, yMm: 0, lengthMm: 200 };
    const res = computeAutoResizeWidth({
      targetId: "r1",
      targetKind: "rail",
      anchorXMm: rail.xMm,
      yMm: rail.yMm,
      bandHeightMm: 35,
      plateWidthMm: 500,
      rails: [rail],
      ducts: [],
      components: [],
      cadAssets: [],
    });
    expect(res).toEqual({ xMm: 0, widthMm: 500 });
  });

  it("auto-resizes DIN rail to fill exact gap between left and right vertical ducts", () => {
    const rail: DinRail = { id: "r1", name: "Rail 1", xMm: 0, yMm: 0, lengthMm: 200 };
    const leftDuct: WireDuct = {
      id: "d-left",
      name: "Duct L",
      xMm: -230,
      yMm: 0,
      widthMm: 40,
      heightMm: 600,
      depthMm: 40,
      orientation: "vertical",
    };
    const rightDuct: WireDuct = {
      id: "d-right",
      name: "Duct R",
      xMm: 230,
      yMm: 0,
      widthMm: 40,
      heightMm: 600,
      depthMm: 40,
      orientation: "vertical",
    };
    const res = computeAutoResizeWidth({
      targetId: "r1",
      targetKind: "rail",
      anchorXMm: rail.xMm,
      yMm: rail.yMm,
      bandHeightMm: 35,
      plateWidthMm: 500,
      rails: [rail],
      ducts: [leftDuct, rightDuct],
      components: [],
      cadAssets: [],
    });
    expect(res).toEqual({ xMm: 0, widthMm: 420 });
  });

  it("auto-resizes vertical duct height between top and bottom horizontal ducts", () => {
    const vDuct: WireDuct = {
      id: "dv",
      name: "Duct V",
      xMm: -200,
      yMm: 0,
      widthMm: 40,
      heightMm: 200,
      depthMm: 40,
      orientation: "vertical",
    };
    const topDuct: WireDuct = {
      id: "dt",
      name: "Duct T",
      xMm: 0,
      yMm: 330,
      widthMm: 500,
      heightMm: 40,
      depthMm: 40,
      orientation: "horizontal",
    };
    const res = computeAutoResizeHeight({
      targetId: "dv",
      xMm: vDuct.xMm,
      anchorYMm: vDuct.yMm,
      bandWidthMm: vDuct.widthMm,
      plateHeightMm: 700,
      rails: [],
      ducts: [vDuct, topDuct],
      components: [],
      cadAssets: [],
    });
    expect(res).toEqual({ yMm: -20, heightMm: 660 });
  });
});
