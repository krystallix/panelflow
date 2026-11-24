import { COMPONENT_CATALOG } from "@/lib/components-catalog";
import { getWireOuterDiameterMm, resolvePinWorldPoint } from "@/lib/wire-router";
import type {
  ComponentMountingType,
  PanelSheet,
  WireColorCode,
} from "@/types/panel";

export const WIRE_STRIPPING_ALLOWANCE_MM = 40;

export type BomReportScope = "active" | "all";

export interface BomComponentRow {
  key: string;
  templateId: string;
  tags: string[];
  componentName: string;
  category: string;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  mountingType: ComponentMountingType;
  quantity: number;
  sheetNames: string[];
}

export interface BomDinRailRow {
  key: string;
  name: string;
  lengthMm: number;
  quantity: number;
  totalLengthMm: number;
  sheetNames: string[];
}

export interface BomWireDuctRow {
  key: string;
  profileLabel: string;
  crossSectionWidthMm: number;
  depthMm: number;
  quantity: number;
  totalLengthMm: number;
  sheetNames: string[];
}

export interface BomCadAssetRow {
  key: string;
  name: string;
  fileName: string;
  format: string;
  materialType?: string;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  quantity: number;
  sheetNames: string[];
}

export interface WireScheduleRow {
  id: string;
  sheetName: string;
  label: string;
  fromTag: string;
  fromPin: string;
  fromDisplay: string;
  toTag: string;
  toPin: string;
  toDisplay: string;
  colorCode: WireColorCode;
  gaugeMm2: string;
  outerDiameterMm: number;
  routeLengthMm: number;
  allowanceMm: number;
  cutLengthMm: number;
}

export interface BomReportSummary {
  totalComponents: number;
  totalUniqueComponentTypes: number;
  totalDinRailPieces: number;
  totalDinRailLengthMm: number;
  totalWireDuctPieces: number;
  totalWireDuctLengthMm: number;
  totalCadAssets: number;
  totalWires: number;
  totalCableLengthMm: number;
  totalCableLengthM: number;
}

export interface BomReportData {
  projectName: string;
  scope: BomReportScope;
  sheetCount: number;
  components: BomComponentRow[];
  dinRails: BomDinRailRow[];
  wireDucts: BomWireDuctRow[];
  cadAssets: BomCadAssetRow[];
  wires: WireScheduleRow[];
  summary: BomReportSummary;
}

function addUnique(arr: string[], value: string) {
  if (value && !arr.includes(value)) {
    arr.push(value);
  }
}

function resolveComponentAndPin(
  sheet: PanelSheet,
  componentId: string,
  pinId: string
): { tag: string; pinLabel: string } {
  const comp = sheet.components.find((c) => c.id === componentId);
  if (comp) {
    const pin = comp.pins.find((p) => p.id === pinId);
    return {
      tag: comp.name || comp.id,
      pinLabel: pin?.label || pinId,
    };
  }
  const cad = sheet.cadAssets.find((a) => a.id === componentId);
  if (cad) {
    const pin = cad.pins.find((p) => p.id === pinId);
    return {
      tag: cad.name || cad.id,
      pinLabel: pin?.label || pinId,
    };
  }
  return { tag: componentId, pinLabel: pinId };
}

export function computeWireRouteLengthMm(
  sheet: PanelSheet,
  fromComponentId: string,
  fromPinId: string,
  toComponentId: string,
  toPinId: string,
  waypoints?: Array<{ xMm: number; yMm: number }>,
  toFreePoint?: { xMm: number; yMm: number }
): number {
  if (waypoints && waypoints.length >= 2) {
    let total = 0;
    for (let i = 1; i < waypoints.length; i++) {
      total += Math.hypot(
        waypoints[i].xMm - waypoints[i - 1].xMm,
        waypoints[i].yMm - waypoints[i - 1].yMm
      );
    }
    return Number(total.toFixed(1));
  }

  const fromPt = resolvePinWorldPoint(
    sheet.components,
    sheet.cadAssets,
    fromComponentId,
    fromPinId
  );
  const toPt = toFreePoint
    ? toFreePoint
    : resolvePinWorldPoint(
        sheet.components,
        sheet.cadAssets,
        toComponentId,
        toPinId
      );

  if (!fromPt || !toPt) return 0;

  const manhattan =
    Math.abs(toPt.xMm - fromPt.xMm) + Math.abs(toPt.yMm - fromPt.yMm);
  return Number(manhattan.toFixed(1));
}

export function generateBomReport(
  sheets: PanelSheet[],
  activeSheetId: string,
  scope: BomReportScope = "active",
  projectName = "PanelFlow Project"
): BomReportData {
  const targetSheets =
    scope === "all"
      ? sheets
      : sheets.filter((s) => s.id === activeSheetId);

  const effectiveSheets =
    targetSheets.length > 0 ? targetSheets : sheets.slice(0, 1);

  const compMap = new Map<string, BomComponentRow>();
  const railMap = new Map<string, BomDinRailRow>();
  const ductMap = new Map<string, BomWireDuctRow>();
  const cadMap = new Map<string, BomCadAssetRow>();
  const wireRows: WireScheduleRow[] = [];

  let totalComponents = 0;
  let totalDinRailPieces = 0;
  let totalDinRailLengthMm = 0;
  let totalWireDuctPieces = 0;
  let totalWireDuctLengthMm = 0;
  let totalCadAssets = 0;
  let totalCableLengthMm = 0;

  for (const sheet of effectiveSheets) {
    // 1. Components (grouped by templateId + name)
    for (const comp of sheet.components) {
      totalComponents += 1;
      const catalog = COMPONENT_CATALOG[comp.templateId];
      const key = `${comp.templateId}::${comp.name}`;
      const existing = compMap.get(key);
      if (existing) {
        existing.quantity += 1;
        addUnique(existing.tags, comp.name);
        addUnique(existing.sheetNames, sheet.name);
      } else {
        compMap.set(key, {
          key,
          templateId: comp.templateId,
          tags: [comp.name],
          componentName: catalog?.name ?? comp.name,
          category: catalog?.category ?? "Custom / Other",
          widthMm: comp.widthMm,
          heightMm: comp.heightMm,
          depthMm: comp.depthMm,
          mountingType:
            comp.mountingType ?? catalog?.mountingType ?? "din_rail",
          quantity: 1,
          sheetNames: [sheet.name],
        });
      }
    }

    // 2. DIN Rails 35mm (grouped by lengthMm)
    for (const rail of sheet.rails) {
      totalDinRailPieces += 1;
      totalDinRailLengthMm += rail.lengthMm;
      const key = `rail-${rail.lengthMm}`;
      const existing = railMap.get(key);
      if (existing) {
        existing.quantity += 1;
        existing.totalLengthMm += rail.lengthMm;
        addUnique(existing.sheetNames, sheet.name);
      } else {
        railMap.set(key, {
          key,
          name: `DIN Rail 35mm (${rail.lengthMm} mm)`,
          lengthMm: rail.lengthMm,
          quantity: 1,
          totalLengthMm: rail.lengthMm,
          sheetNames: [sheet.name],
        });
      }
    }

    // 3. Wire Ducts (grouped by cross-section profile)
    for (const duct of sheet.ducts) {
      const lengthMm =
        duct.orientation === "horizontal" ? duct.widthMm : duct.heightMm;
      const crossWidthMm =
        duct.orientation === "horizontal" ? duct.heightMm : duct.widthMm;
      totalWireDuctPieces += 1;
      totalWireDuctLengthMm += lengthMm;
      const key = `duct-${crossWidthMm}x${duct.depthMm}`;
      const existing = ductMap.get(key);
      if (existing) {
        existing.quantity += 1;
        existing.totalLengthMm += lengthMm;
        addUnique(existing.sheetNames, sheet.name);
      } else {
        ductMap.set(key, {
          key,
          profileLabel: `Wire Duct ${crossWidthMm} × ${duct.depthMm} mm`,
          crossSectionWidthMm: crossWidthMm,
          depthMm: duct.depthMm,
          quantity: 1,
          totalLengthMm: lengthMm,
          sheetNames: [sheet.name],
        });
      }
    }

    // 4. Custom CAD Assets
    for (const asset of sheet.cadAssets) {
      totalCadAssets += 1;
      const key = `cad::${asset.name}::${asset.fileName}`;
      const existing = cadMap.get(key);
      if (existing) {
        existing.quantity += 1;
        addUnique(existing.sheetNames, sheet.name);
      } else {
        cadMap.set(key, {
          key,
          name: asset.name,
          fileName: asset.fileName,
          format: asset.materialType
            ? `BUSBAR (${asset.materialType.toUpperCase()})`
            : asset.format.toUpperCase(),
          materialType: asset.materialType,
          widthMm: Number(asset.boundingBoxMm.w.toFixed(1)),
          heightMm: Number(asset.boundingBoxMm.h.toFixed(1)),
          depthMm: Number(asset.boundingBoxMm.d.toFixed(1)),
          quantity: 1,
          sheetNames: [sheet.name],
        });
      }
    }

    // 5. Wire Cutting Schedule
    for (const wire of sheet.wires) {
      const fromResolved = resolveComponentAndPin(
        sheet,
        wire.fromComponentId,
        wire.fromPinId
      );
      const toResolved = wire.toFreePoint
        ? {
            tag: wire.toFreeLabel?.trim() || "Free Terminal",
            pinLabel: "END",
          }
        : resolveComponentAndPin(
            sheet,
            wire.toComponentId,
            wire.toPinId
          );
      const routeLengthMm = computeWireRouteLengthMm(
        sheet,
        wire.fromComponentId,
        wire.fromPinId,
        wire.toComponentId,
        wire.toPinId,
        wire.waypoints,
        wire.toFreePoint
      );
      const cutLengthMm = Number(
        (routeLengthMm + WIRE_STRIPPING_ALLOWANCE_MM).toFixed(1)
      );
      totalCableLengthMm += cutLengthMm;

      wireRows.push({
        id: wire.id,
        sheetName: sheet.name,
        label: wire.label || wire.id,
        fromTag: fromResolved.tag,
        fromPin: fromResolved.pinLabel,
        fromDisplay: `${fromResolved.tag} : ${fromResolved.pinLabel}`,
        toTag: toResolved.tag,
        toPin: toResolved.pinLabel,
        toDisplay: wire.toFreePoint
          ? toResolved.tag
          : `${toResolved.tag} : ${toResolved.pinLabel}`,
        colorCode: wire.colorCode,
        gaugeMm2: wire.gaugeMm2,
        outerDiameterMm: getWireOuterDiameterMm(wire.gaugeMm2),
        routeLengthMm,
        allowanceMm: WIRE_STRIPPING_ALLOWANCE_MM,
        cutLengthMm,
      });
    }
  }

  const components = Array.from(compMap.values());
  const dinRails = Array.from(railMap.values()).sort(
    (a, b) => b.lengthMm - a.lengthMm
  );
  const wireDucts = Array.from(ductMap.values());
  const cadAssets = Array.from(cadMap.values());

  return {
    projectName,
    scope,
    sheetCount: effectiveSheets.length,
    components,
    dinRails,
    wireDucts,
    cadAssets,
    wires: wireRows,
    summary: {
      totalComponents,
      totalUniqueComponentTypes: components.length,
      totalDinRailPieces,
      totalDinRailLengthMm: Number(totalDinRailLengthMm.toFixed(1)),
      totalWireDuctPieces,
      totalWireDuctLengthMm: Number(totalWireDuctLengthMm.toFixed(1)),
      totalCadAssets,
      totalWires: wireRows.length,
      totalCableLengthMm: Number(totalCableLengthMm.toFixed(1)),
      totalCableLengthM: Number((totalCableLengthMm / 1000).toFixed(2)),
    },
  };
}

function escapeCsvCell(value: string | number): string {
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(cells: Array<string | number>): string {
  return cells.map(escapeCsvCell).join(",");
}

export function generateBomCsv(report: BomReportData): string {
  const lines: string[] = [];

  lines.push(
    toCsvRow([
      "Item Type",
      "Tag / Label",
      "Component / Material Name",
      "Category",
      "Dimensions (W x H x D mm)",
      "Mounting / Spec",
      "Qty",
      "Total Length (mm)",
      "Sheets",
    ])
  );

  for (const row of report.components) {
    lines.push(
      toCsvRow([
        "Component",
        row.tags.join(", "),
        row.componentName,
        row.category,
        `${row.widthMm} x ${row.heightMm} x ${row.depthMm}`,
        row.mountingType,
        row.quantity,
        "-",
        row.sheetNames.join("; "),
      ])
    );
  }

  for (const rail of report.dinRails) {
    lines.push(
      toCsvRow([
        "DIN Rail",
        "DIN35",
        rail.name,
        "Infrastructure",
        `${rail.lengthMm} x 35 x 7.5`,
        "EN 50022 Screw Mount",
        rail.quantity,
        rail.totalLengthMm,
        rail.sheetNames.join("; "),
      ])
    );
  }

  for (const duct of report.wireDucts) {
    lines.push(
      toCsvRow([
        "Wire Duct",
        "DUCT",
        duct.profileLabel,
        "Infrastructure",
        `${duct.crossSectionWidthMm} x ${duct.depthMm}`,
        "Slotted PVC Duct",
        duct.quantity,
        duct.totalLengthMm,
        duct.sheetNames.join("; "),
      ])
    );
  }

  for (const cad of report.cadAssets) {
    lines.push(
      toCsvRow([
        "Custom CAD",
        cad.name,
        cad.fileName,
        "Custom CAD Asset",
        `${cad.widthMm} x ${cad.heightMm} x ${cad.depthMm}`,
        cad.format,
        cad.quantity,
        "-",
        cad.sheetNames.join("; "),
      ])
    );
  }

  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function generateWireListCsv(report: BomReportData): string {
  const lines: string[] = [];

  lines.push(
    toCsvRow([
      "Wire ID / Tag",
      "From (Tag : Pin)",
      "To (Tag : Pin)",
      "Signal / Color",
      "Cross-Section (mm2)",
      "Outer Diameter (mm)",
      "Route Length (mm)",
      "Stripping Allowance (mm)",
      "Cut Length (mm)",
      "Sheet",
    ])
  );

  for (const w of report.wires) {
    lines.push(
      toCsvRow([
        w.label,
        w.fromDisplay,
        w.toDisplay,
        w.colorCode,
        w.gaugeMm2,
        w.outerDiameterMm,
        w.routeLengthMm,
        w.allowanceMm,
        w.cutLengthMm,
        w.sheetName,
      ])
    );
  }

  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
