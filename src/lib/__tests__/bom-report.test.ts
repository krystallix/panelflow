import { describe, expect, it } from "vitest";
import {
  generateBomCsv,
  generateBomReport,
  generateWireListCsv,
  WIRE_STRIPPING_ALLOWANCE_MM,
} from "@/lib/bom-report";
import type { PanelSheet } from "@/types/panel";

function createMockSheet(): PanelSheet {
  return {
    id: "sheet-1",
    name: "Mounting Plate 1",
    sheetType: "mounting-plate",
    enclosure: {
      widthMm: 600,
      heightMm: 800,
      depthMm: 250,
      backplateInsetMm: 20,
      backplateThicknessMm: 2.5,
      wallThicknessMm: 1.5,
      doorMode: "transparent",
    },
    plateConfig: {
      mode: "auto",
      manualWidthMm: 560,
      manualHeightMm: 760,
    },
    rails: [
      { id: "rail-1", name: "Top Rail", xMm: 0, yMm: 200, lengthMm: 480 },
      { id: "rail-2", name: "Middle Rail", xMm: 0, yMm: 40, lengthMm: 480 },
    ],
    ducts: [
      {
        id: "duct-1",
        name: "Top Duct",
        xMm: 0,
        yMm: 300,
        widthMm: 500,
        heightMm: 40,
        depthMm: 60,
        orientation: "horizontal",
      },
    ],
    components: [
      {
        id: "comp-1",
        templateId: "mcb-1p",
        name: "F1",
        xMm: -100,
        yMm: 200,
        zMm: 42.5,
        railId: "rail-1",
        widthMm: 17.5,
        heightMm: 85,
        depthMm: 70,
        color: "#e2e6ed",
        accentColor: "#2563eb",
        pins: [
          { id: "p1", label: "1", localXMm: 0, localYMm: 35, localZMm: 0 },
          { id: "p2", label: "2", localXMm: 0, localYMm: -35, localZMm: 0 },
        ],
      },
      {
        id: "comp-2",
        templateId: "mcb-1p",
        name: "F2",
        xMm: -80,
        yMm: 200,
        zMm: 42.5,
        railId: "rail-1",
        widthMm: 17.5,
        heightMm: 85,
        depthMm: 70,
        color: "#e2e6ed",
        accentColor: "#2563eb",
        pins: [
          { id: "p1", label: "1", localXMm: 0, localYMm: 35, localZMm: 0 },
          { id: "p2", label: "2", localXMm: 0, localYMm: -35, localZMm: 0 },
        ],
      },
    ],
    cadAssets: [
      {
        id: "cad-1",
        name: "Fan Bracket",
        fileName: "fan-bracket.step",
        format: "dxf",
        sourceUnit: "mm",
        xMm: 150,
        yMm: 100,
        zMm: 0,
        boundingBoxMm: { w: 120, h: 120, d: 25 },
        pins: [],
      },
    ],
    wires: [
      {
        id: "w-1",
        label: "W01",
        colorCode: "R",
        gaugeMm2: "2.5",
        fromComponentId: "comp-1",
        fromPinId: "p2",
        toComponentId: "comp-2",
        toPinId: "p1",
      },
      {
        id: "w-2",
        label: "W02",
        colorCode: "N",
        gaugeMm2: "1.5",
        fromComponentId: "comp-1",
        fromPinId: "p1",
        toComponentId: "comp-2",
        toPinId: "p2",
        waypoints: [
          { xMm: -100, yMm: 235 },
          { xMm: -100, yMm: 270 },
          { xMm: -80, yMm: 270 },
          { xMm: -80, yMm: 165 },
        ],
      },
    ],
    titleBlock: {
      projectName: "Test Project Alfa",
      drawer: "Engineer",
      sheetNo: "01/01",
      date: "2026-11-12",
      scale: "1:5",
      rev: "A",
    },
  };
}

describe("Auto-BOM & Wire Cutting Schedule Engine", () => {
  it("groups identical rails and calculates total length", () => {
    const sheet = createMockSheet();
    const report = generateBomReport([sheet], sheet.id, "active", "Test Project");

    expect(report.dinRails).toHaveLength(1);
    expect(report.dinRails[0].quantity).toBe(2);
    expect(report.dinRails[0].totalLengthMm).toBe(960);
    expect(report.summary.totalDinRailLengthMm).toBe(960);
  });

  it("groups components and aggregates tags", () => {
    const sheet = createMockSheet();
    // modify comp-2 name to match F1 to test identical name grouping
    sheet.components[1].name = "F1";
    const report = generateBomReport([sheet], sheet.id, "active", "Test Project");

    expect(report.components).toHaveLength(1);
    expect(report.components[0].quantity).toBe(2);
    expect(report.components[0].tags).toEqual(["F1"]);
  });

  it("separates components when names/tags differ", () => {
    const sheet = createMockSheet();
    const report = generateBomReport([sheet], sheet.id, "active", "Test Project");

    expect(report.components).toHaveLength(2);
    expect(report.summary.totalComponents).toBe(2);
  });

  it("calculates wire route length with +40mm stripping allowance", () => {
    const sheet = createMockSheet();
    const report = generateBomReport([sheet], sheet.id, "active", "Test Project");

    expect(report.wires).toHaveLength(2);

    const wire1 = report.wires[0];
    expect(wire1.allowanceMm).toBe(WIRE_STRIPPING_ALLOWANCE_MM);
    expect(wire1.cutLengthMm).toBe(
      Number((wire1.routeLengthMm + WIRE_STRIPPING_ALLOWANCE_MM).toFixed(1))
    );
    expect(wire1.outerDiameterMm).toBe(3.7); // 2.5mm² outer diameter

    // wire 2 with waypoints
    const wire2 = report.wires[1];
    // length = (270 - 235) + (-80 - -100) + (270 - 165) = 35 + 20 + 105 = 160mm
    expect(wire2.routeLengthMm).toBe(160);
    expect(wire2.cutLengthMm).toBe(200);
  });

  it("exports UTF-8 BOM CSV for Excel compatibility", () => {
    const sheet = createMockSheet();
    const report = generateBomReport([sheet], sheet.id, "active", "Test Project");

    const bomCsv = generateBomCsv(report);
    expect(bomCsv.startsWith("\uFEFF")).toBe(true);
    expect(bomCsv).toContain("DIN Rail");
    expect(bomCsv).toContain("F1");
    expect(bomCsv).toContain("Fan Bracket");

    const wireCsv = generateWireListCsv(report);
    expect(wireCsv.startsWith("\uFEFF")).toBe(true);
    expect(wireCsv).toContain("W01");
    expect(wireCsv).toContain("W02");
    expect(wireCsv).toContain("Stripping Allowance (mm)");
  });

  it("includes free-end terminal wires and labels in BOM wire schedule", () => {
    const sheet = createMockSheet();
    sheet.wires.push({
      id: "w-free",
      label: "W03",
      colorCode: "R",
      gaugeMm2: "2.5",
      fromComponentId: "comp-1",
      fromPinId: "p1",
      toComponentId: "__free__",
      toPinId: "__free__",
      toFreePoint: { xMm: 0, yMm: 100 },
      toFreeLabel: "Power Source R",
    });

    const report = generateBomReport([sheet], sheet.id, "active", "Test Project");
    const freeRow = report.wires.find((w) => w.id === "w-free");
    expect(freeRow).toBeDefined();
    expect(freeRow?.toTag).toBe("Power Source R");
    expect(freeRow?.toDisplay).toBe("Power Source R");
    expect(freeRow!.routeLengthMm).toBeGreaterThan(0);
  });
});
