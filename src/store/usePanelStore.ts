import { create } from "zustand";
import { COMPONENT_CATALOG } from "@/lib/components-catalog";
import {
  clampToBackplate,
  clampToDuctFreeRailX,
  DIN_RAIL_HEIGHT_MM,
  getRotatedDimensions,
  overlapsAnyDuct,
  resolveDuctFreePlatePosition,
  rotateLocalPoint,
  snapComponentToNearestRail,
  snapSideBySideOnRail,
  snapToGrid,
} from "@/lib/snap";
import { getEffectiveCadBounds } from "@/lib/collision";
import { getBackplateDimensions } from "@/lib/template-export";
import {
  buildComponentObstacles,
  resolvePinExitInfo,
  resolvePinWorldPoint,
  routeWireThroughDucts,
} from "@/lib/wire-router";
import { generateWireNumbers } from "@/lib/wire-numbering";
import {
  computeAlignToPlatePosition,
  computeAlignToRailX,
  computeAutoResizeHeight,
  computeAutoResizeWidth,
  type PlateAlignEdge,
  type RailAlignEdge,
} from "@/lib/layout-align";
import type {
  CanvasTool2D,
  ComponentTemplateId,
  CustomCadAsset,
  DinRail,
  DoorMode,
  DrawShapeMode,
  EnclosureConfig,
  GridSnapMm,
  LengthUnit,
  MaterialType,
  PanelSheet,
  PinTerminal,
  PlacedComponent,
  PlateConfig,
  RotationDeg,
  SelectionTarget,
  SelectedTarget,
  SheetType,
  TitleBlockMeta,
  ViewportMode,
  WireColorCode,
  WireConnection,
  WireDuct,
} from "@/types/panel";

function nextIncrementedName(baseName: string, existingNames: string[]): string {
  const existing = new Set(existingNames);
  const hashMatch = baseName.match(/^(.*?)\s*#(\d+)$/);
  if (hashMatch) {
    const prefix = hashMatch[1];
    let n = Number(hashMatch[2]) + 1;
    while (existing.has(`${prefix} #${n}`)) n += 1;
    return `${prefix} #${n}`;
  }
  const trailingNumMatch = baseName.match(/^(.*?)(\d+)$/);
  if (trailingNumMatch) {
    const prefix = trailingNumMatch[1];
    let n = Number(trailingNumMatch[2]) + 1;
    while (existing.has(`${prefix}${n}`)) n += 1;
    return `${prefix}${n}`;
  }
  let n = 2;
  while (existing.has(`${baseName} #${n}`)) n += 1;
  return `${baseName} #${n}`;
}

function makeUid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export const FAVORITES_STORAGE_KEY = "panelflow_favorite_parts";
export const RECENTS_STORAGE_KEY = "panelflow_recent_parts";
export const AUTO_ROUTE_STORAGE_KEY = "panelflow_auto_route_ducts";
export const SHOW_PIN_LABELS_STORAGE_KEY = "panelflow_show_pin_labels";
export const MAX_RECENT_PARTS = 8;

function saveBoolToStorage(key: string, value: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // ignore storage errors
  }
}

function loadBoolFromStorage(key: string): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
    return null;
  } catch {
    return null;
  }
}

function loadPartIdsFromStorage(key: string): ComponentTemplateId[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (id): id is ComponentTemplateId =>
        typeof id === "string" && id in COMPONENT_CATALOG
    );
  } catch {
    return [];
  }
}

function savePartIdsToStorage(key: string, ids: ComponentTemplateId[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // ignore storage errors
  }
}

function applyThemeToDom(theme: "dark" | "light") {
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.remove("dark");
      root.classList.add("light");
      root.style.backgroundColor = "#f8fafc";
      root.style.colorScheme = "light";
    } else {
      root.classList.add("dark");
      root.classList.remove("light");
      root.style.backgroundColor = "#090b10";
      root.style.colorScheme = "dark";
    }
  }
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem("panelflow_saved_theme", theme);
    } catch {
      // ignore storage errors
    }
  }
}

export type ThemeMode = "dark" | "light";
export type RightPanelTab = "inspector" | "panel" | "bom";

export type SheetSnapshot = PanelSheet;

function cloneSheet(sheet: PanelSheet): PanelSheet {
  return JSON.parse(JSON.stringify(sheet));
}

function createDefaultSheet(id = "sheet-1", name = "Sheet 1 (Mounting Plate)", sheetType: SheetType = "mounting-plate"): PanelSheet {
  return {
    id,
    name,
    sheetType,
    enclosure: {
      widthMm: 600,
      heightMm: 800,
      depthMm: 250,
      backplateInsetMm: 40,
      backplateThicknessMm: 2,
      wallThicknessMm: 2,
      doorMode: "transparent",
      plateMode: "auto",
      manualPlateWidthMm: 520,
      manualPlateHeightMm: 720,
    },
    plateConfig: {
      mode: "auto",
      manualWidthMm: 520,
      manualHeightMm: 720,
    },
    rails: [
      { id: "rail-1", name: "DIN-1 (Top)", xMm: 0, yMm: 200, lengthMm: 460 },
      { id: "rail-2", name: "DIN-2 (Mid)", xMm: 0, yMm: 40, lengthMm: 460 },
      { id: "rail-3", name: "DIN-3 (Bottom)", xMm: 0, yMm: -140, lengthMm: 460 },
    ],
    ducts: [
      {
        id: "duct-1",
        name: "Top Duct",
        xMm: 0,
        yMm: 280,
        widthMm: 480,
        heightMm: 40,
        depthMm: 60,
        orientation: "horizontal",
      },
      {
        id: "duct-2",
        name: "Mid Duct",
        xMm: 0,
        yMm: 120,
        widthMm: 480,
        heightMm: 40,
        depthMm: 60,
        orientation: "horizontal",
      },
      {
        id: "duct-3",
        name: "Bottom Duct",
        xMm: 0,
        yMm: -220,
        widthMm: 480,
        heightMm: 40,
        depthMm: 60,
        orientation: "horizontal",
      },
      {
        id: "duct-v-left",
        name: "Left Vertical Duct",
        xMm: -230,
        yMm: 40,
        widthMm: 40,
        heightMm: 560,
        depthMm: 60,
        orientation: "vertical",
      },
      {
        id: "duct-v-right",
        name: "Right Vertical Duct",
        xMm: 230,
        yMm: 40,
        widthMm: 40,
        heightMm: 560,
        depthMm: 60,
        orientation: "vertical",
      },
    ],
    components: [
      {
        id: "comp-1",
        templateId: "mcb-3p",
        name: "QF1",
        mountingType: "din_rail",
        xMm: -160,
        yMm: 200,
        zMm: 46.75,
        railId: "rail-1",
        widthMm: COMPONENT_CATALOG["mcb-3p"].widthMm,
        heightMm: COMPONENT_CATALOG["mcb-3p"].heightMm,
        depthMm: COMPONENT_CATALOG["mcb-3p"].depthMm,
        color: COMPONENT_CATALOG["mcb-3p"].color,
        accentColor: COMPONENT_CATALOG["mcb-3p"].accentColor,
        pins: COMPONENT_CATALOG["mcb-3p"].pins.map((p, idx) => ({
          ...p,
          id: `comp-1-pin-${idx + 1}`,
        })),
      },
      {
        id: "comp-2",
        templateId: "mcb-1p",
        name: "QF2",
        mountingType: "din_rail",
        xMm: -100,
        yMm: 200,
        zMm: 46.75,
        railId: "rail-1",
        widthMm: COMPONENT_CATALOG["mcb-1p"].widthMm,
        heightMm: COMPONENT_CATALOG["mcb-1p"].heightMm,
        depthMm: COMPONENT_CATALOG["mcb-1p"].depthMm,
        color: COMPONENT_CATALOG["mcb-1p"].color,
        accentColor: COMPONENT_CATALOG["mcb-1p"].accentColor,
        pins: COMPONENT_CATALOG["mcb-1p"].pins.map((p, idx) => ({
          ...p,
          id: `comp-2-pin-${idx + 1}`,
        })),
      },
      {
        id: "comp-3",
        templateId: "psu-24v",
        name: "PS1",
        mountingType: "din_rail",
        xMm: -120,
        yMm: 40,
        zMm: 64.25,
        railId: "rail-2",
        widthMm: COMPONENT_CATALOG["psu-24v"].widthMm,
        heightMm: COMPONENT_CATALOG["psu-24v"].heightMm,
        depthMm: COMPONENT_CATALOG["psu-24v"].depthMm,
        color: COMPONENT_CATALOG["psu-24v"].color,
        accentColor: COMPONENT_CATALOG["psu-24v"].accentColor,
        pins: COMPONENT_CATALOG["psu-24v"].pins.map((p, idx) => ({
          ...p,
          id: `comp-3-pin-${idx + 1}`,
        })),
      },
      {
        id: "comp-4",
        templateId: "contactor",
        name: "KM1",
        mountingType: "din_rail",
        xMm: 20,
        yMm: 40,
        zMm: 50.5,
        railId: "rail-2",
        widthMm: COMPONENT_CATALOG.contactor.widthMm,
        heightMm: COMPONENT_CATALOG.contactor.heightMm,
        depthMm: COMPONENT_CATALOG.contactor.depthMm,
        color: COMPONENT_CATALOG.contactor.color,
        accentColor: COMPONENT_CATALOG.contactor.accentColor,
        pins: COMPONENT_CATALOG.contactor.pins.map((p, idx) => ({
          ...p,
          id: `comp-4-pin-${idx + 1}`,
        })),
      },
    ],
    cadAssets: [],
    wires: [
      {
        id: "wire-1",
        label: "F01",
        colorCode: "R",
        gaugeMm2: "4.0",
        fromComponentId: "comp-1",
        fromPinId: "comp-1-pin-4",
        toComponentId: "comp-4",
        toPinId: "comp-4-pin-1",
      },
      {
        id: "wire-2",
        label: "K01",
        colorCode: "DC+",
        gaugeMm2: "1.5",
        fromComponentId: "comp-3",
        fromPinId: "comp-3-pin-4",
        toComponentId: "comp-4",
        toPinId: "comp-4-pin-5",
      },
    ],
    titleBlock: {
      projectName: "MAIN CONTROL PANEL - MDP-01",
      drawer: "Flints Studio",
      sheetNo: "1 / 1",
      date: new Date().toISOString().slice(0, 10),
      scale: "1:1",
      rev: "A",
    },
  };
}

const defaultInitialSheet = createDefaultSheet();

interface HistoryEntry {
  sheets: PanelSheet[];
  autoRouteDuctsEnabled: boolean;
}

interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

interface PanelStore {
  // Multi-sheet Canvas State
  sheets: PanelSheet[];
  activeSheetId: string;

  // Active sheet projections (for zero-breakage direct consumption)
  enclosure: EnclosureConfig;
  plateConfig: PlateConfig;
  rails: DinRail[];
  ducts: WireDuct[];
  components: PlacedComponent[];
  cadAssets: CustomCadAsset[];
  wires: WireConnection[];
  titleBlock: TitleBlockMeta;
  activeSheetType: SheetType;

  // Global Workspace State
  theme: ThemeMode;
  viewportMode: ViewportMode;
  canvasTool2D: CanvasTool2D;
  drawShapeMode: DrawShapeMode;
  setDrawShapeMode: (mode: DrawShapeMode) => void;
  displayUnit: LengthUnit;
  gridSnapMm: GridSnapMm;
  activeWireColor: WireColorCode;
  activeWireGauge: string;
  activeWireStartPin: { componentId: string; pinId: string } | null;
  autoRouteDuctsEnabled: boolean;
  setAutoRouteDuctsEnabled: (enabled: boolean) => void;
  showPinLabels: boolean;
  setShowPinLabels: (show: boolean) => void;
  toggleShowPinLabels: () => void;
  selected: SelectionTarget;
  selectedIds: SelectedTarget[];
  isPinMarkingMode: boolean;
  activeMarkingAssetId: string | null;
  inspectorFocusNonce: number;
  inspectorOpen: boolean;
  leftSidebarOpen: boolean;
  rightInspectorOpen: boolean;
  rightPanelTab: RightPanelTab;
  setRightInspectorOpen: (open: boolean) => void;
  toggleRightInspector: () => void;

  // History Stack
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  // Sheet Tabs Actions
  setActiveSheet: (sheetId: string) => void;
  addSheet: (sheetType?: SheetType, name?: string) => string;
  renameSheet: (sheetId: string, newName: string) => void;
  duplicateSheet: (sheetId: string) => string | null;
  deleteSheet: (sheetId: string) => boolean;
  reorderSheets: (fromIndex: number, toIndex: number) => void;

  // Inspector & Toolbar Focus
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setInspectorOpen: (open: boolean) => void;
  setLeftSidebarOpen: (open: boolean) => void;
  toggleLeftSidebar: () => void;
  setRightPanelTab: (tab: RightPanelTab) => void;
  requestInspectorFocus: () => void;
  setViewportMode: (mode: ViewportMode) => void;
  setCanvasTool2D: (tool: CanvasTool2D) => void;
  setActiveWireColor: (color: WireColorCode) => void;
  setActiveWireGauge: (gauge: string) => void;
  setActiveWireStartPin: (pin: { componentId: string; pinId: string } | null) => void;
  updateTitleBlock: (partial: Partial<TitleBlockMeta>) => void;

  // Plate / Enclosure Actions
  setDisplayUnit: (unit: LengthUnit) => void;
  setGridSnapMm: (snap: GridSnapMm) => void;
  setDoorMode: (mode: DoorMode) => void;
  updateEnclosure: (partial: Partial<EnclosureConfig>) => void;
  updatePlateConfig: (partial: Partial<PlateConfig>) => void;

  // Wire Actions
  addWire: (wire: Omit<WireConnection, "id">) => void;
  updateWire: (
    id: string,
    partial: Partial<WireConnection>,
    options?: { skipHistory?: boolean }
  ) => void;
  updateWires: (ids: string[], partial: Partial<WireConnection>) => void;
  removeWire: (id: string) => void;
  autoRouteWire: (id: string) => void;
  autoRouteAllWires: () => void;
  autoNumberWires: (sheetId?: string) => void;

  // Selection & Marking
  setSelected: (target: SelectionTarget) => void;
  setSelectedIds: (targets: SelectedTarget[]) => void;
  toggleSelectId: (target: SelectedTarget) => void;
  clearSelection: () => void;
  moveSelectedItems: (dxMm: number, dyMm: number) => void;
  nudgeSelectedItems: (dxMm: number, dyMm: number) => void;
  deleteSelectedItems: () => void;
  alignSelectedItems: (mode: "left" | "center" | "top") => void;
  pushUndoSnapshot: () => void;
  setPinMarkingMode: (enabled: boolean, assetId?: string | null) => void;

  // Clipboard & Grouping / Locking
  clipboardItems: Array<PlacedComponent | CustomCadAsset | DinRail | WireDuct>;
  copySelectedToClipboard: () => number;
  pasteFromClipboard: (offsetMm?: { x: number; y: number }) => SelectedTarget[];
  groupSelectedItems: () => string | null;
  ungroupSelectedItems: () => void;
  renameGroup: (groupId: string, newName: string) => void;
  toggleLockSelectedItems: (forceLocked?: boolean) => void;

  // Rails & Ducts
  addRail: (customPos?: { xMm: number; yMm: number }) => void;
  updateRail: (
    id: string,
    partial: Partial<DinRail>,
    options?: { skipHistory?: boolean }
  ) => void;
  removeRail: (id: string) => void;
  duplicateRail: (id: string, offsetMm?: { x: number; y: number }) => string | null;

  addDuct: (
    orientation?: "horizontal" | "vertical",
    customPos?: { xMm: number; yMm: number }
  ) => void;
  updateDuct: (
    id: string,
    partial: Partial<WireDuct>,
    options?: { skipHistory?: boolean }
  ) => void;
  removeDuct: (id: string) => void;
  duplicateDuct: (id: string, offsetMm?: { x: number; y: number }) => string | null;
  alignComponentsOnRail: (railId: string, mode: "distribute" | "left" | "center" | "right") => void;
  alignItemToPlate: (target: { kind: "component" | "cad" | "rail" | "duct"; id: string }, edge: PlateAlignEdge) => void;
  alignComponentToRail: (componentId: string, edge: RailAlignEdge) => void;
  autoResizeToFit: (target: { kind: "rail" | "duct"; id: string }) => void;
  autoResizeSelectedToFit: () => void;

  // Component Actions
  addComponent: (templateId: ComponentTemplateId, nearYMm?: number, customPos?: { xMm: number; yMm: number }) => void;
  updateComponent: (id: string, partial: Partial<PlacedComponent>) => void;
  moveComponent: (
    id: string,
    targetXMm: number,
    targetYMm: number,
    options?: { skipGridSnapX?: boolean; skipGridSnapY?: boolean }
  ) => void;
  removeComponent: (id: string) => void;
  rotateComponent: (id: string, deltaDeg?: 90 | 180 | 270) => void;
  duplicateComponent: (id: string, offsetMm?: { x: number; y: number }) => string | null;
  snapComponentToRail: (id: string) => void;

  // Favorites & Recent Parts Library
  recentPartIds: ComponentTemplateId[];
  favoritePartIds: ComponentTemplateId[];
  addRecentPart: (id: ComponentTemplateId) => void;
  toggleFavoritePart: (id: ComponentTemplateId) => void;
  setPartPreferences: (params: {
    favoritePartIds?: ComponentTemplateId[];
    recentPartIds?: ComponentTemplateId[];
  }) => void;
  hydratePartPreferences: () => void;

  // CAD Asset Actions
  addCadAsset: (asset: CustomCadAsset) => void;
  updateCadAsset: (
    id: string,
    partial: Partial<CustomCadAsset>,
    options?: { skipHistory?: boolean }
  ) => void;
  moveCadAsset: (
    id: string,
    targetXMm: number,
    targetYMm: number,
    options?: { skipGridSnapX?: boolean; skipGridSnapY?: boolean }
  ) => void;
  removeCadAsset: (id: string) => void;
  rotateCadAsset: (id: string, deltaDeg?: 90 | 180 | 270) => void;
  duplicateCadAsset: (id: string, offsetMm?: { x: number; y: number }) => string | null;
  addCustomDrawnComponent: (params: {
    name?: string;
    xMm: number;
    yMm: number;
    widthMm: number;
    heightMm: number;
    depthMm?: number;
    materialType?: MaterialType;
    drawShape?: DrawShapeMode;
  }) => string;
  addPinToAsset: (assetId: string, pin: Omit<PinTerminal, "id">) => void;
  updatePinInAsset: (assetId: string, pinId: string, partial: Partial<PinTerminal>) => void;
  removePinFromAsset: (assetId: string, pinId: string) => void;
  updateComponentPin: (componentId: string, pinId: string, partial: Partial<PinTerminal>) => void;
  removePinFromComponent: (componentId: string, pinId: string) => void;

  // Project Import / Restore / Reset
  loadProjectState: (params: {
    sheets: PanelSheet[];
    activeSheetId?: string;
    displayUnit?: LengthUnit;
    gridSnapMm?: GridSnapMm;
    autoRouteDuctsEnabled?: boolean;
    showPinLabels?: boolean;
    titleBlock?: TitleBlockMeta;
  }) => void;
  resetToDefaultProject: () => void;
}

const MAX_HISTORY = 30;
let historyStack: HistoryState = {
  past: [],
  future: [],
};

function pushHistory(
  currentSheets: PanelSheet[],
  autoRouteDuctsEnabled?: boolean
) {
  const effectiveAutoRoute =
    autoRouteDuctsEnabled ??
    (typeof usePanelStore !== "undefined"
      ? usePanelStore.getState().autoRouteDuctsEnabled
      : true);
  const snapshot: HistoryEntry = {
    sheets: currentSheets.map(cloneSheet),
    autoRouteDuctsEnabled: effectiveAutoRoute,
  };
  historyStack.past.push(snapshot);
  if (historyStack.past.length > MAX_HISTORY) {
    historyStack.past.shift();
  }
  historyStack.future = [];
}

function syncActiveSheetProjection(sheet: PanelSheet) {
  return {
    enclosure: sheet.enclosure,
    plateConfig: sheet.plateConfig,
    rails: sheet.rails,
    ducts: sheet.ducts,
    components: sheet.components,
    cadAssets: sheet.cadAssets,
    wires: sheet.wires,
    titleBlock: sheet.titleBlock,
    activeSheetType: sheet.sheetType,
  };
}

/**
 * Recomputes waypoints for all wires bound to moved/rotated components or CAD assets
 * so cables stay locked to their pin terminals (inspired by RelayTest live wire binding).
 */
function recomputeBoundWires(
  sheet: PanelSheet,
  autoRouteDuctsEnabled: boolean,
  affectedIds?: Set<string> | null
): PanelSheet {
  if (sheet.wires.length === 0) return sheet;
  const obstacles = buildComponentObstacles(sheet.components, sheet.cadAssets);
  let changed = false;
  const nextWires = sheet.wires.map((w, idx) => {
    if (
      affectedIds &&
      !affectedIds.has(w.fromComponentId) &&
      !affectedIds.has(w.toComponentId)
    ) {
      return w;
    }
    const p1 = resolvePinExitInfo(
      sheet.components,
      sheet.cadAssets,
      w.fromComponentId,
      w.fromPinId
    );
    const p2 = w.toFreePoint
      ? {
          xMm: w.toFreePoint.xMm,
          yMm: w.toFreePoint.yMm,
          exitDir: undefined,
          stubPt: undefined,
        }
      : resolvePinExitInfo(
          sheet.components,
          sheet.cadAssets,
          w.toComponentId,
          w.toPinId
        );
    if (!p1 || !p2) return w;

    changed = true;
    if (autoRouteDuctsEnabled && sheet.ducts.length > 0) {
      const pts = routeWireThroughDucts(
        { x: p1.xMm, y: p1.yMm },
        { x: p2.xMm, y: p2.yMm },
        sheet.ducts,
        sheet.rails,
        idx,
        {
          startExitDir: p1.exitDir,
          endExitDir: p2.exitDir,
          startStubPt: p1.stubPt,
          endStubPt: p2.stubPt,
          obstacles,
        }
      );
      return {
        ...w,
        waypoints: pts.map((pt) => ({ xMm: pt.x, yMm: pt.y })),
      };
    }
    return {
      ...w,
      waypoints: undefined,
    };
  });

  return changed ? { ...sheet, wires: nextWires } : sheet;
}

export const usePanelStore = create<PanelStore>((set, get) => ({
  sheets: [defaultInitialSheet],
  activeSheetId: defaultInitialSheet.id,

  // Active projection
  enclosure: defaultInitialSheet.enclosure,
  plateConfig: defaultInitialSheet.plateConfig,
  rails: defaultInitialSheet.rails,
  ducts: defaultInitialSheet.ducts,
  components: defaultInitialSheet.components,
  cadAssets: defaultInitialSheet.cadAssets,
  wires: defaultInitialSheet.wires,
  titleBlock: defaultInitialSheet.titleBlock,
  activeSheetType: defaultInitialSheet.sheetType,

  theme: "light",
  viewportMode: "2d",
  canvasTool2D: "select",
  drawShapeMode: "rectangle",
  setDrawShapeMode: (mode) => set({ drawShapeMode: mode }),
  displayUnit: "mm",
  gridSnapMm: 10,
  activeWireColor: "R",
  activeWireGauge: "2.5",
  activeWireStartPin: null,
  autoRouteDuctsEnabled: true,
  setAutoRouteDuctsEnabled: (enabled) => {
    const { sheets, activeSheetId, autoRouteDuctsEnabled } = get();
    if (enabled === autoRouteDuctsEnabled) return;
    pushHistory(sheets, autoRouteDuctsEnabled);
    saveBoolToStorage(AUTO_ROUTE_STORAGE_KEY, enabled);
    const updated = sheets.map((s) =>
      s.id === activeSheetId ? recomputeBoundWires(s, enabled, null) : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      autoRouteDuctsEnabled: enabled,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },
  showPinLabels: false,
  setShowPinLabels: (show) => {
    saveBoolToStorage(SHOW_PIN_LABELS_STORAGE_KEY, show);
    set({ showPinLabels: show });
  },
  toggleShowPinLabels: () =>
    set((s) => {
      const next = !s.showPinLabels;
      saveBoolToStorage(SHOW_PIN_LABELS_STORAGE_KEY, next);
      return { showPinLabels: next };
    }),
  selected: null,
  selectedIds: [],
  clipboardItems: [],
  isPinMarkingMode: false,
  activeMarkingAssetId: null,
  inspectorFocusNonce: 0,
  inspectorOpen: true,
  leftSidebarOpen: true,
  rightInspectorOpen: false,
  rightPanelTab: "inspector",
  canUndo: false,
  canRedo: false,
  recentPartIds: [],
  favoritePartIds: [],

  addRecentPart: (id) => {
    if (!(id in COMPONENT_CATALOG)) return;
    const next = [id, ...get().recentPartIds.filter((x) => x !== id)].slice(
      0,
      MAX_RECENT_PARTS
    );
    savePartIdsToStorage(RECENTS_STORAGE_KEY, next);
    set({ recentPartIds: next });
  },

  toggleFavoritePart: (id) => {
    if (!(id in COMPONENT_CATALOG)) return;
    const current = get().favoritePartIds;
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [id, ...current];
    savePartIdsToStorage(FAVORITES_STORAGE_KEY, next);
    set({ favoritePartIds: next });
  },

  setPartPreferences: ({ favoritePartIds, recentPartIds }) => {
    const nextFav = Array.isArray(favoritePartIds)
      ? favoritePartIds.filter((id): id is ComponentTemplateId => id in COMPONENT_CATALOG)
      : get().favoritePartIds;
    const nextRec = Array.isArray(recentPartIds)
      ? recentPartIds
          .filter((id): id is ComponentTemplateId => id in COMPONENT_CATALOG)
          .slice(0, MAX_RECENT_PARTS)
      : get().recentPartIds;
    savePartIdsToStorage(FAVORITES_STORAGE_KEY, nextFav);
    savePartIdsToStorage(RECENTS_STORAGE_KEY, nextRec);
    set({
      favoritePartIds: nextFav,
      recentPartIds: nextRec,
    });
  },

  hydratePartPreferences: () => {
    const savedAutoRoute = loadBoolFromStorage(AUTO_ROUTE_STORAGE_KEY);
    const savedPinLabels = loadBoolFromStorage(SHOW_PIN_LABELS_STORAGE_KEY);
    set({
      favoritePartIds: loadPartIdsFromStorage(FAVORITES_STORAGE_KEY),
      recentPartIds: loadPartIdsFromStorage(RECENTS_STORAGE_KEY).slice(
        0,
        MAX_RECENT_PARTS
      ),
      ...(savedAutoRoute !== null ? { autoRouteDuctsEnabled: savedAutoRoute } : {}),
      ...(savedPinLabels !== null ? { showPinLabels: savedPinLabels } : {}),
    });
  },

  undo: () => {
    if (historyStack.past.length === 0) return;
    const currentState = get();
    historyStack.future.push({
      sheets: currentState.sheets.map(cloneSheet),
      autoRouteDuctsEnabled: currentState.autoRouteDuctsEnabled,
    });
    const previous = historyStack.past.pop()!;

    let activeSheet = previous.sheets.find((s) => s.id === currentState.activeSheetId);
    if (!activeSheet) {
      activeSheet = previous.sheets[0];
    }

    saveBoolToStorage(AUTO_ROUTE_STORAGE_KEY, previous.autoRouteDuctsEnabled);
    set({
      sheets: previous.sheets,
      activeSheetId: activeSheet.id,
      autoRouteDuctsEnabled: previous.autoRouteDuctsEnabled,
      canUndo: historyStack.past.length > 0,
      canRedo: true,
      ...syncActiveSheetProjection(activeSheet),
    });
  },

  redo: () => {
    if (historyStack.future.length === 0) return;
    const currentState = get();
    historyStack.past.push({
      sheets: currentState.sheets.map(cloneSheet),
      autoRouteDuctsEnabled: currentState.autoRouteDuctsEnabled,
    });
    const next = historyStack.future.pop()!;

    let activeSheet = next.sheets.find((s) => s.id === currentState.activeSheetId);
    if (!activeSheet) {
      activeSheet = next.sheets[0];
    }

    saveBoolToStorage(AUTO_ROUTE_STORAGE_KEY, next.autoRouteDuctsEnabled);
    set({
      sheets: next.sheets,
      activeSheetId: activeSheet.id,
      autoRouteDuctsEnabled: next.autoRouteDuctsEnabled,
      canUndo: true,
      canRedo: historyStack.future.length > 0,
      ...syncActiveSheetProjection(activeSheet),
    });
  },

  setActiveSheet: (sheetId: string) => {
    const { sheets, activeSheetId } = get();
    if (sheetId === activeSheetId) return;
    const target = sheets.find((s) => s.id === sheetId);
    if (!target) return;

    set({
      activeSheetId: sheetId,
      selected: null,
      selectedIds: [],
      activeWireStartPin: null,
      isPinMarkingMode: false,
      activeMarkingAssetId: null,
      ...syncActiveSheetProjection(target),
    });
  },

  addSheet: (sheetType = "mounting-plate", name) => {
    const { sheets } = get();
    pushHistory(sheets);
    const id = makeUid("sheet");
    const typeLabel =
      sheetType === "door-cutout"
        ? "Door Cutout"
        : sheetType === "schematic"
        ? "Schematic"
        : "Mounting Plate";
    const sheetName =
      name || nextIncrementedName(`Sheet (${typeLabel})`, sheets.map((s) => s.name));
    const newSheet = createDefaultSheet(id, sheetName, sheetType);

    // New sheets start completely blank (no pre-populated hardware or demo components)
    newSheet.rails = [];
    newSheet.ducts = [];
    newSheet.components = [];
    newSheet.wires = [];
    newSheet.cadAssets = [];

    const updated = [...sheets, newSheet];
    set({
      sheets: updated,
      activeSheetId: id,
      selected: null,
      selectedIds: [],
      activeWireStartPin: null,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(newSheet),
    });
    return id;
  },

  renameSheet: (sheetId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const { sheets, activeSheetId } = get();
    pushHistory(sheets);
    const updated = sheets.map((s) =>
      s.id === sheetId ? { ...s, name: trimmed } : s
    );
    const active = updated.find((s) => s.id === activeSheetId) || updated[0];
    set({
      sheets: updated,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  duplicateSheet: (sheetId: string) => {
    const { sheets } = get();
    const source = sheets.find((s) => s.id === sheetId);
    if (!source) return null;
    pushHistory(sheets);

    const dup = cloneSheet(source);
    const newId = makeUid("sheet");
    dup.id = newId;
    dup.name = nextIncrementedName(source.name, sheets.map((s) => s.name));

    // Re-key components and pins to prevent ID collision
    const compIdMap = new Map<string, string>();
    dup.components = dup.components.map((c) => {
      const freshCompId = makeUid("comp");
      compIdMap.set(c.id, freshCompId);
      return {
        ...c,
        id: freshCompId,
        pins: c.pins.map((p, idx) => ({ ...p, id: `${freshCompId}-pin-${idx + 1}` })),
      };
    });

    dup.wires = dup.wires.map((w) => ({
      ...w,
      id: makeUid("wire"),
      fromComponentId: compIdMap.get(w.fromComponentId) ?? w.fromComponentId,
      toComponentId: compIdMap.get(w.toComponentId) ?? w.toComponentId,
    }));

    dup.rails = dup.rails.map((r) => ({ ...r, id: makeUid("rail") }));
    dup.ducts = dup.ducts.map((d) => ({ ...d, id: makeUid("duct") }));
    dup.cadAssets = dup.cadAssets.map((a) => ({ ...a, id: makeUid("cad") }));

    const updated = [...sheets, dup];
    set({
      sheets: updated,
      activeSheetId: newId,
      selected: null,
      selectedIds: [],
      activeWireStartPin: null,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(dup),
    });
    return newId;
  },

  deleteSheet: (sheetId: string) => {
    const { sheets, activeSheetId } = get();
    if (sheets.length <= 1) return false;
    pushHistory(sheets);

    const updated = sheets.filter((s) => s.id !== sheetId);
    let nextActiveId = activeSheetId;
    if (activeSheetId === sheetId) {
      nextActiveId = updated[0].id;
    }
    const nextActiveSheet = updated.find((s) => s.id === nextActiveId)!;

    set({
      sheets: updated,
      activeSheetId: nextActiveId,
      selected: null,
      selectedIds: [],
      activeWireStartPin: null,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(nextActiveSheet),
    });
    return true;
  },

  reorderSheets: (fromIndex: number, toIndex: number) => {
    const { sheets } = get();
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= sheets.length ||
      toIndex >= sheets.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    pushHistory(sheets);
    const updated = [...sheets];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    set({
      sheets: updated,
      canUndo: true,
      canRedo: false,
    });
  },

  setTheme: (theme) => {
    applyThemeToDom(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    applyThemeToDom(next);
    set({ theme: next });
  },
  setInspectorOpen: (open) => set({ inspectorOpen: open, rightInspectorOpen: open }),
  setLeftSidebarOpen: (open) => set({ leftSidebarOpen: open }),
  toggleLeftSidebar: () => set((s) => ({ leftSidebarOpen: !s.leftSidebarOpen })),
  setRightInspectorOpen: (open) => set({ rightInspectorOpen: open }),
  toggleRightInspector: () =>
    set((s) => ({ rightInspectorOpen: !s.rightInspectorOpen })),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab, rightInspectorOpen: true }),
  requestInspectorFocus: () =>
    set((state) => ({
      inspectorOpen: true,
      rightInspectorOpen: true,
      rightPanelTab: "inspector",
      inspectorFocusNonce: state.inspectorFocusNonce + 1,
    })),
  setViewportMode: (mode) => set({ viewportMode: mode }),
  setCanvasTool2D: (tool) => set({ canvasTool2D: tool, activeWireStartPin: null }),
  setActiveWireColor: (color) => set({ activeWireColor: color }),
  setActiveWireGauge: (gauge) => set({ activeWireGauge: gauge }),
  setActiveWireStartPin: (pin) => set({ activeWireStartPin: pin }),
  setDisplayUnit: (unit) => set({ displayUnit: unit }),
  setGridSnapMm: (snap) => set({ gridSnapMm: snap }),
  setSelected: (target) =>
    set({
      selected: target,
      selectedIds: target ? [target] : [],
    }),
  setSelectedIds: (targets) =>
    set({
      selectedIds: targets,
      selected: targets.length > 0 ? targets[0] : null,
    }),
  toggleSelectId: (target) => {
    const { selectedIds } = get();
    const exists = selectedIds.some((s) => s.id === target.id && s.kind === target.kind);
    let next: SelectedTarget[];
    if (exists) {
      next = selectedIds.filter((s) => !(s.id === target.id && s.kind === target.kind));
    } else {
      next = [...selectedIds, target];
    }
    set({
      selectedIds: next,
      selected: next.length > 0 ? next[next.length - 1] : null,
    });
  },
  clearSelection: () => set({ selected: null, selectedIds: [] }),

  pushUndoSnapshot: () => {
    const { sheets } = get();
    pushHistory(sheets);
    set({ canUndo: true, canRedo: false });
  },

  moveSelectedItems: (dxMm, dyMm) => {
    const { sheets, activeSheetId, selectedIds, enclosure, plateConfig } = get();
    if (selectedIds.length === 0 || (dxMm === 0 && dyMm === 0)) return;
    const activeSheet = sheets.find((s) => s.id === activeSheetId);
    if (!activeSheet) return;

    const { widthMm: plateW, heightMm: plateH } = getBackplateDimensions(
      enclosure,
      plateConfig
    );

    const compIds = new Set(selectedIds.filter((s) => s.kind === "component").map((s) => s.id));
    const cadIds = new Set(selectedIds.filter((s) => s.kind === "cad").map((s) => s.id));
    const railIds = new Set(selectedIds.filter((s) => s.kind === "rail").map((s) => s.id));
    const ductIds = new Set(selectedIds.filter((s) => s.kind === "duct").map((s) => s.id));

    const nextComponents = activeSheet.components.map((c) => {
      if (!compIds.has(c.id) || c.locked) return c;
      const dims = getRotatedDimensions(c.widthMm, c.heightMm, c.rotationDeg ?? 0);
      const targetX = c.xMm + dxMm;
      const targetY = c.yMm + dyMm;
      const clamped = clampToBackplate(targetX, targetY, dims.widthMm, dims.heightMm, plateW, plateH);
      return {
        ...c,
        xMm: clamped.xMm,
        yMm: clamped.yMm,
      };
    });

    const nextCadAssets = activeSheet.cadAssets.map((a) => {
      if (!cadIds.has(a.id) || a.locked) return a;
      const eff = getEffectiveCadBounds(a);
      const rot = a.rotationDeg ?? 0;
      const dims = getRotatedDimensions(eff.widthMm, eff.heightMm, rot);
      const rotOffset = rotateLocalPoint(eff.offsetX, eff.offsetY, rot);
      const targetX = a.xMm + rotOffset.xMm + dxMm;
      const targetY = a.yMm + rotOffset.yMm + dyMm;
      const clamped = clampToBackplate(targetX, targetY, dims.widthMm, dims.heightMm, plateW, plateH);
      return {
        ...a,
        xMm: clamped.xMm - rotOffset.xMm,
        yMm: clamped.yMm - rotOffset.yMm,
      };
    });

    const movedRailDeltas = new Map<string, { dx: number; dy: number; rail: DinRail }>();
    const nextRails = activeSheet.rails.map((r) => {
      if (!railIds.has(r.id) || r.locked) return r;
      const clamped = clampToBackplate(r.xMm + dxMm, r.yMm + dyMm, r.lengthMm, DIN_RAIL_HEIGHT_MM, plateW, plateH);
      const movedRail = {
        ...r,
        xMm: clamped.xMm,
        yMm: clamped.yMm,
      };
      movedRailDeltas.set(r.id, {
        dx: clamped.xMm - r.xMm,
        dy: clamped.yMm - r.yMm,
        rail: movedRail,
      });
      return movedRail;
    });

    const railMovedCompIds = new Set<string>();
    const finalComponents = nextComponents.map((c) => {
      if (compIds.has(c.id) || c.locked) return c;
      if (c.railId && movedRailDeltas.has(c.railId)) {
        const { dx, rail } = movedRailDeltas.get(c.railId)!;
        const dims = getRotatedDimensions(c.widthMm, c.heightMm, c.rotationDeg ?? 0);
        const minX = rail.xMm - rail.lengthMm / 2 + dims.widthMm / 2;
        const maxX = rail.xMm + rail.lengthMm / 2 - dims.widthMm / 2;
        const nextX = minX <= maxX ? Math.max(minX, Math.min(maxX, c.xMm + dx)) : rail.xMm;
        railMovedCompIds.add(c.id);
        return {
          ...c,
          xMm: nextX,
          yMm: rail.yMm,
        };
      }
      return c;
    }).map((c, _, arr) => {
      if (c.mountedToComponentId && railMovedCompIds.has(c.mountedToComponentId)) {
        const parent = arr.find((p) => p.id === c.mountedToComponentId);
        if (parent) {
          railMovedCompIds.add(c.id);
          return {
            ...c,
            xMm: parent.xMm,
            yMm: parent.yMm - parent.heightMm / 2 - c.heightMm / 2,
          };
        }
      }
      return c;
    });

    const nextDucts = activeSheet.ducts.map((d) => {
      if (!ductIds.has(d.id) || d.locked) return d;
      const clamped = clampToBackplate(d.xMm + dxMm, d.yMm + dyMm, d.widthMm, d.heightMm, plateW, plateH);
      return {
        ...d,
        xMm: clamped.xMm,
        yMm: clamped.yMm,
      };
    });

    const { autoRouteDuctsEnabled } = get();
    const affectedIds = new Set<string>([...compIds, ...cadIds, ...railMovedCompIds]);
    const updated = sheets.map((s) =>
      s.id === activeSheetId
        ? recomputeBoundWires(
            {
              ...s,
              components: finalComponents,
              cadAssets: nextCadAssets,
              rails: nextRails,
              ducts: nextDucts,
            },
            autoRouteDuctsEnabled,
            ductIds.size > 0 ? null : affectedIds
          )
        : s
    );

    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      ...syncActiveSheetProjection(active),
    });
  },

  nudgeSelectedItems: (dxMm, dyMm) => {
    const { sheets, activeSheetId, selectedIds, selected } = get();
    const effectiveIds = selectedIds.length > 0 ? selectedIds : selected ? [selected] : [];
    if (effectiveIds.length === 0 || (dxMm === 0 && dyMm === 0)) return;
    const activeSheet = sheets.find((s) => s.id === activeSheetId);
    if (!activeSheet) return;

    const hasMovable = effectiveIds.some((t) => {
      if (t.kind === "component") {
        const c = activeSheet.components.find((item) => item.id === t.id);
        return Boolean(c && !c.locked);
      }
      if (t.kind === "cad") {
        const a = activeSheet.cadAssets.find((item) => item.id === t.id);
        return Boolean(a && !a.locked);
      }
      return t.kind === "rail" || t.kind === "duct";
    });
    if (!hasMovable) return;

    pushHistory(sheets);
    if (selectedIds.length === 0 && selected) {
      set({ selectedIds: [selected] });
    }
    get().moveSelectedItems(dxMm, dyMm);
    set({ canUndo: true, canRedo: false });
  },

  copySelectedToClipboard: () => {
    const { sheets, activeSheetId, selectedIds, selected } = get();
    const activeSheet = sheets.find((s) => s.id === activeSheetId);
    if (!activeSheet) return 0;

    const effectiveIds = selectedIds.length > 0 ? selectedIds : selected ? [selected] : [];
    if (effectiveIds.length === 0) return 0;

    const copied: Array<PlacedComponent | CustomCadAsset | DinRail | WireDuct> = [];
    const seen = new Set<string>();

    for (const sel of effectiveIds) {
      if (sel.kind === "component" && !seen.has(`comp:${sel.id}`)) {
        const comp = activeSheet.components.find((c) => c.id === sel.id);
        if (comp) {
          seen.add(`comp:${sel.id}`);
          copied.push({
            ...comp,
            pins: comp.pins.map((p) => ({ ...p })),
          });
        }
      } else if (sel.kind === "cad" && !seen.has(`cad:${sel.id}`)) {
        const asset = activeSheet.cadAssets.find((a) => a.id === sel.id);
        if (asset) {
          seen.add(`cad:${sel.id}`);
          copied.push({
            ...asset,
            boundingBoxMm: { ...asset.boundingBoxMm },
            cropMm: asset.cropMm ? { ...asset.cropMm } : undefined,
            pins: asset.pins.map((p) => ({ ...p })),
          });
        }
      } else if (sel.kind === "rail" && !seen.has(`rail:${sel.id}`)) {
        const rail = activeSheet.rails.find((r) => r.id === sel.id);
        if (rail) {
          seen.add(`rail:${sel.id}`);
          copied.push({ ...rail });
        }
      } else if (sel.kind === "duct" && !seen.has(`duct:${sel.id}`)) {
        const duct = activeSheet.ducts.find((d) => d.id === sel.id);
        if (duct) {
          seen.add(`duct:${sel.id}`);
          copied.push({ ...duct });
        }
      }
    }

    if (copied.length > 0) {
      set({ clipboardItems: copied });
    }
    return copied.length;
  },

  pasteFromClipboard: (offsetMm = { x: 15, y: -15 }) => {
    const { sheets, activeSheetId, clipboardItems, enclosure, plateConfig } = get();
    if (clipboardItems.length === 0) return [];
    const activeSheet = sheets.find((s) => s.id === activeSheetId);
    if (!activeSheet) return [];

    pushHistory(sheets);

    const { widthMm: plateW, heightMm: plateH } = getBackplateDimensions(
      enclosure,
      plateConfig
    );

    const existingCompNames = activeSheet.components.map((c) => c.name);
    const existingCadNames = activeSheet.cadAssets.map((a) => a.name);
    const existingRailNames = activeSheet.rails.map((r) => r.name);
    const existingDuctNames = activeSheet.ducts.map((d) => d.name);
    const groupMap = new Map<string, string>();
    const mapGroupId = (gid?: string) => {
      if (!gid) return undefined;
      if (!groupMap.has(gid)) {
        groupMap.set(gid, makeUid("grp"));
      }
      return groupMap.get(gid);
    };

    const newComponents: PlacedComponent[] = [];
    const newCadAssets: CustomCadAsset[] = [];
    const newRails: DinRail[] = [];
    const newDucts: WireDuct[] = [];
    const pastedTargets: SelectedTarget[] = [];

    for (const item of clipboardItems) {
      if ("templateId" in item) {
        const newId = makeUid("comp");
        const nextName = nextIncrementedName(item.name, existingCompNames);
        existingCompNames.push(nextName);
        const dims = getRotatedDimensions(
          item.widthMm,
          item.heightMm,
          item.rotationDeg ?? 0
        );
        const clamped = clampToBackplate(
          item.xMm + offsetMm.x,
          item.yMm + offsetMm.y,
          dims.widthMm,
          dims.heightMm,
          plateW,
          plateH
        );
        const pastedComp: PlacedComponent = {
          ...item,
          id: newId,
          name: nextName,
          xMm: clamped.xMm,
          yMm: clamped.yMm,
          groupId: mapGroupId(item.groupId),
          locked: false,
          pins: item.pins.map((p, idx) => ({
            ...p,
            id: `${newId}-pin-${idx + 1}`,
          })),
        };
        newComponents.push(pastedComp);
        pastedTargets.push({ kind: "component", id: newId });
      } else if ("format" in item) {
        const newId = makeUid("cad");
        const nextName = nextIncrementedName(item.name, existingCadNames);
        existingCadNames.push(nextName);
        const eff = getEffectiveCadBounds(item);
        const rot = item.rotationDeg ?? 0;
        const dims = getRotatedDimensions(eff.widthMm, eff.heightMm, rot);
        const rotOffset = rotateLocalPoint(eff.offsetX, eff.offsetY, rot);
        const clamped = clampToBackplate(
          item.xMm + rotOffset.xMm + offsetMm.x,
          item.yMm + rotOffset.yMm + offsetMm.y,
          dims.widthMm,
          dims.heightMm,
          plateW,
          plateH
        );
        const pastedCad: CustomCadAsset = {
          ...item,
          id: newId,
          name: nextName,
          xMm: clamped.xMm - rotOffset.xMm,
          yMm: clamped.yMm - rotOffset.yMm,
          boundingBoxMm: { ...item.boundingBoxMm },
          cropMm: item.cropMm ? { ...item.cropMm } : undefined,
          groupId: mapGroupId(item.groupId),
          locked: false,
          pins: item.pins.map((p, idx) => ({
            ...p,
            id: `${newId}-pin-${idx + 1}`,
          })),
        };
        newCadAssets.push(pastedCad);
        pastedTargets.push({ kind: "cad", id: newId });
      } else if ("lengthMm" in item) {
        const newId = makeUid("rail");
        const nextName = nextIncrementedName(item.name, existingRailNames);
        existingRailNames.push(nextName);
        const clamped = clampToBackplate(
          item.xMm + offsetMm.x,
          item.yMm + offsetMm.y,
          item.lengthMm,
          DIN_RAIL_HEIGHT_MM,
          plateW,
          plateH
        );
        newRails.push({
          ...item,
          id: newId,
          name: nextName,
          xMm: clamped.xMm,
          yMm: clamped.yMm,
        });
        pastedTargets.push({ kind: "rail", id: newId });
      } else {
        const newId = makeUid("duct");
        const nextName = nextIncrementedName(item.name, existingDuctNames);
        existingDuctNames.push(nextName);
        const clamped = clampToBackplate(
          item.xMm + offsetMm.x,
          item.yMm + offsetMm.y,
          item.widthMm,
          item.heightMm,
          plateW,
          plateH
        );
        newDucts.push({
          ...item,
          id: newId,
          name: nextName,
          xMm: clamped.xMm,
          yMm: clamped.yMm,
        });
        pastedTargets.push({ kind: "duct", id: newId });
      }
    }

    const updated = sheets.map((s) =>
      s.id === activeSheetId
        ? {
            ...s,
            components: [...s.components, ...newComponents],
            cadAssets: [...s.cadAssets, ...newCadAssets],
            rails: [...s.rails, ...newRails],
            ducts: [...s.ducts, ...newDucts],
          }
        : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      selected: pastedTargets[0] ?? null,
      selectedIds: pastedTargets,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
    return pastedTargets;
  },

  groupSelectedItems: () => {
    const { sheets, activeSheetId, selectedIds } = get();
    const groupable = selectedIds.filter(
      (s) =>
        s.kind === "component" ||
        s.kind === "cad" ||
        s.kind === "rail" ||
        s.kind === "duct"
    );
    if (groupable.length < 2) return null;

    const compIds = new Set(
      groupable.filter((s) => s.kind === "component").map((s) => s.id)
    );
    const cadIds = new Set(
      groupable.filter((s) => s.kind === "cad").map((s) => s.id)
    );
    const railIds = new Set(
      groupable.filter((s) => s.kind === "rail").map((s) => s.id)
    );
    const ductIds = new Set(
      groupable.filter((s) => s.kind === "duct").map((s) => s.id)
    );
    const groupId = makeUid("grp");

    pushHistory(sheets);
    const updated = sheets.map((s) =>
      s.id === activeSheetId
        ? {
            ...s,
            components: s.components.map((c) =>
              compIds.has(c.id) ? { ...c, groupId } : c
            ),
            cadAssets: s.cadAssets.map((a) =>
              cadIds.has(a.id) ? { ...a, groupId } : a
            ),
            rails: s.rails.map((r) =>
              railIds.has(r.id) ? { ...r, groupId } : r
            ),
            ducts: s.ducts.map((d) =>
              ductIds.has(d.id) ? { ...d, groupId } : d
            ),
          }
        : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
    return groupId;
  },

  ungroupSelectedItems: () => {
    const { sheets, activeSheetId, selectedIds, selected } = get();
    const activeSheet = sheets.find((s) => s.id === activeSheetId);
    if (!activeSheet) return;

    const effectiveIds = selectedIds.length > 0 ? selectedIds : selected ? [selected] : [];
    const compIds = new Set(
      effectiveIds.filter((s) => s.kind === "component").map((s) => s.id)
    );
    const cadIds = new Set(
      effectiveIds.filter((s) => s.kind === "cad").map((s) => s.id)
    );
    const railIds = new Set(
      effectiveIds.filter((s) => s.kind === "rail").map((s) => s.id)
    );
    const ductIds = new Set(
      effectiveIds.filter((s) => s.kind === "duct").map((s) => s.id)
    );

    const targetGroupIds = new Set<string>();
    for (const c of activeSheet.components) {
      if (compIds.has(c.id) && c.groupId) targetGroupIds.add(c.groupId);
    }
    for (const a of activeSheet.cadAssets) {
      if (cadIds.has(a.id) && a.groupId) targetGroupIds.add(a.groupId);
    }
    for (const r of activeSheet.rails) {
      if (railIds.has(r.id) && r.groupId) targetGroupIds.add(r.groupId);
    }
    for (const d of activeSheet.ducts) {
      if (ductIds.has(d.id) && d.groupId) targetGroupIds.add(d.groupId);
    }
    if (targetGroupIds.size === 0) return;

    pushHistory(sheets);
    const updated = sheets.map((s) =>
      s.id === activeSheetId
        ? {
            ...s,
            components: s.components.map((c) =>
              c.groupId && targetGroupIds.has(c.groupId)
                ? { ...c, groupId: undefined }
                : c
            ),
            cadAssets: s.cadAssets.map((a) =>
              a.groupId && targetGroupIds.has(a.groupId)
                ? { ...a, groupId: undefined }
                : a
            ),
            rails: s.rails.map((r) =>
              r.groupId && targetGroupIds.has(r.groupId)
                ? { ...r, groupId: undefined }
                : r
            ),
            ducts: s.ducts.map((d) =>
              d.groupId && targetGroupIds.has(d.groupId)
                ? { ...d, groupId: undefined }
                : d
            ),
          }
        : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  renameGroup: (groupId, newName) => {
    const { sheets, activeSheetId } = get();
    const cleanName = newName.trim();
    pushHistory(sheets);
    const updated = sheets.map((s) =>
      s.id === activeSheetId
        ? {
            ...s,
            components: s.components.map((c) =>
              c.groupId === groupId ? { ...c, groupName: cleanName || undefined } : c
            ),
            cadAssets: s.cadAssets.map((a) =>
              a.groupId === groupId ? { ...a, groupName: cleanName || undefined } : a
            ),
            rails: s.rails.map((r) =>
              r.groupId === groupId ? { ...r, groupName: cleanName || undefined } : r
            ),
            ducts: s.ducts.map((d) =>
              d.groupId === groupId ? { ...d, groupName: cleanName || undefined } : d
            ),
          }
        : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  toggleLockSelectedItems: (forceLocked) => {
    const { sheets, activeSheetId, selectedIds, selected } = get();
    const activeSheet = sheets.find((s) => s.id === activeSheetId);
    if (!activeSheet) return;

    const effectiveIds = selectedIds.length > 0 ? selectedIds : selected ? [selected] : [];
    const compIds = new Set(
      effectiveIds.filter((s) => s.kind === "component").map((s) => s.id)
    );
    const cadIds = new Set(
      effectiveIds.filter((s) => s.kind === "cad").map((s) => s.id)
    );
    const railIds = new Set(
      effectiveIds.filter((s) => s.kind === "rail").map((s) => s.id)
    );
    const ductIds = new Set(
      effectiveIds.filter((s) => s.kind === "duct").map((s) => s.id)
    );
    if (
      compIds.size === 0 &&
      cadIds.size === 0 &&
      railIds.size === 0 &&
      ductIds.size === 0
    ) {
      return;
    }

    const selectedComps = activeSheet.components.filter((c) => compIds.has(c.id));
    const selectedCads = activeSheet.cadAssets.filter((a) => cadIds.has(a.id));
    const selectedRails = activeSheet.rails.filter((r) => railIds.has(r.id));
    const selectedDucts = activeSheet.ducts.filter((d) => ductIds.has(d.id));
    const allCurrentlyLocked =
      selectedComps.every((c) => Boolean(c.locked)) &&
      selectedCads.every((a) => Boolean(a.locked)) &&
      selectedRails.every((r) => Boolean(r.locked)) &&
      selectedDucts.every((d) => Boolean(d.locked));
    const nextLocked = forceLocked !== undefined ? forceLocked : !allCurrentlyLocked;

    pushHistory(sheets);
    const updated = sheets.map((s) =>
      s.id === activeSheetId
        ? {
            ...s,
            components: s.components.map((c) =>
              compIds.has(c.id) ? { ...c, locked: nextLocked } : c
            ),
            cadAssets: s.cadAssets.map((a) =>
              cadIds.has(a.id) ? { ...a, locked: nextLocked } : a
            ),
            rails: s.rails.map((r) =>
              railIds.has(r.id) ? { ...r, locked: nextLocked } : r
            ),
            ducts: s.ducts.map((d) =>
              ductIds.has(d.id) ? { ...d, locked: nextLocked } : d
            ),
          }
        : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  deleteSelectedItems: () => {
    const { sheets, activeSheetId, selectedIds } = get();
    if (selectedIds.length === 0) return;
    const activeSheet = sheets.find((s) => s.id === activeSheetId);
    if (!activeSheet) return;

    // Never delete locked items
    const compIds = new Set(
      selectedIds
        .filter((s) => s.kind === "component")
        .map((s) => s.id)
        .filter((id) => !activeSheet.components.find((c) => c.id === id)?.locked)
    );
    const cadIds = new Set(
      selectedIds
        .filter((s) => s.kind === "cad")
        .map((s) => s.id)
        .filter((id) => !activeSheet.cadAssets.find((a) => a.id === id)?.locked)
    );
    const railIds = new Set(
      selectedIds
        .filter((s) => s.kind === "rail")
        .map((s) => s.id)
        .filter((id) => !activeSheet.rails.find((r) => r.id === id)?.locked)
    );
    const ductIds = new Set(
      selectedIds
        .filter((s) => s.kind === "duct")
        .map((s) => s.id)
        .filter((id) => !activeSheet.ducts.find((d) => d.id === id)?.locked)
    );
    const wireIds = new Set(selectedIds.filter((s) => s.kind === "wire").map((s) => s.id));

    if (
      compIds.size === 0 &&
      cadIds.size === 0 &&
      railIds.size === 0 &&
      ductIds.size === 0 &&
      wireIds.size === 0
    ) {
      return;
    }

    pushHistory(sheets);

    const nextComponents = activeSheet.components
      .filter((c) => !compIds.has(c.id))
      .map((c) => (c.railId && railIds.has(c.railId) ? { ...c, railId: null } : c));

    const nextCadAssets = activeSheet.cadAssets.filter((a) => !cadIds.has(a.id));
    const nextRails = activeSheet.rails.filter((r) => !railIds.has(r.id));
    const nextDucts = activeSheet.ducts.filter((d) => !ductIds.has(d.id));

    // Remove wires either explicitly selected or connected to deleted components/CAD assets
    const nextWires = activeSheet.wires.filter(
      (w) =>
        !wireIds.has(w.id) &&
        !compIds.has(w.fromComponentId) &&
        !compIds.has(w.toComponentId) &&
        !cadIds.has(w.fromComponentId) &&
        !cadIds.has(w.toComponentId)
    );

    const updated = sheets.map((s) =>
      s.id === activeSheetId
        ? {
            ...s,
            components: nextComponents,
            cadAssets: nextCadAssets,
            rails: nextRails,
            ducts: nextDucts,
            wires: nextWires,
          }
        : s
    );

    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      selected: null,
      selectedIds: [],
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  alignSelectedItems: (mode: "left" | "center" | "top") => {
    const { sheets, activeSheetId, selectedIds, enclosure, plateConfig } = get();
    if (selectedIds.length < 2) return;
    const activeSheet = sheets.find((s) => s.id === activeSheetId);
    if (!activeSheet) return;

    pushHistory(sheets);
    const { widthMm: plateW, heightMm: plateH } = getBackplateDimensions(enclosure, plateConfig);

    type ItemRef = {
      id: string;
      kind: "component" | "cad";
      xMm: number;
      yMm: number;
      wMm: number;
      hMm: number;
      left: number;
      center: number;
      top: number;
    };

    const targets: ItemRef[] = [];
    for (const sel of selectedIds) {
      if (sel.kind === "component") {
        const c = activeSheet.components.find((x) => x.id === sel.id);
        if (c) {
          const dims = getRotatedDimensions(c.widthMm, c.heightMm, c.rotationDeg ?? 0);
          targets.push({
            id: c.id,
            kind: "component",
            xMm: c.xMm,
            yMm: c.yMm,
            wMm: dims.widthMm,
            hMm: dims.heightMm,
            left: c.xMm - dims.widthMm / 2,
            center: c.xMm,
            top: c.yMm + dims.heightMm / 2,
          });
        }
      } else if (sel.kind === "cad") {
        const a = activeSheet.cadAssets.find((x) => x.id === sel.id);
        if (a) {
          const eff = getEffectiveCadBounds(a);
          const rot = a.rotationDeg ?? 0;
          const dims = getRotatedDimensions(eff.widthMm, eff.heightMm, rot);
          const rotOffset = rotateLocalPoint(eff.offsetX, eff.offsetY, rot);
          const cx = a.xMm + rotOffset.xMm;
          const cy = a.yMm + rotOffset.yMm;
          targets.push({
            id: a.id,
            kind: "cad",
            xMm: cx,
            yMm: cy,
            wMm: dims.widthMm,
            hMm: dims.heightMm,
            left: cx - dims.widthMm / 2,
            center: cx,
            top: cy + dims.heightMm / 2,
          });
        }
      }
    }

    if (targets.length < 2) return;

    const compPosMap = new Map<string, { x: number; y: number }>();
    const cadPosMap = new Map<string, { x: number; y: number }>();

    if (mode === "left") {
      const minLeft = Math.min(...targets.map((t) => t.left));
      for (const t of targets) {
        const nextX = minLeft + t.wMm / 2;
        const clamped = clampToBackplate(nextX, t.yMm, t.wMm, t.hMm, plateW, plateH);
        if (t.kind === "component") compPosMap.set(t.id, { x: clamped.xMm, y: clamped.yMm });
        else cadPosMap.set(t.id, { x: clamped.xMm, y: clamped.yMm });
      }
    } else if (mode === "center") {
      const avgCenter = targets.reduce((sum, t) => sum + t.center, 0) / targets.length;
      for (const t of targets) {
        const clamped = clampToBackplate(avgCenter, t.yMm, t.wMm, t.hMm, plateW, plateH);
        if (t.kind === "component") compPosMap.set(t.id, { x: clamped.xMm, y: clamped.yMm });
        else cadPosMap.set(t.id, { x: clamped.xMm, y: clamped.yMm });
      }
    } else if (mode === "top") {
      const maxTop = Math.max(...targets.map((t) => t.top));
      for (const t of targets) {
        const nextY = maxTop - t.hMm / 2;
        const clamped = clampToBackplate(t.xMm, nextY, t.wMm, t.hMm, plateW, plateH);
        if (t.kind === "component") compPosMap.set(t.id, { x: clamped.xMm, y: clamped.yMm });
        else cadPosMap.set(t.id, { x: clamped.xMm, y: clamped.yMm });
      }
    }

    const updated = sheets.map((s) => {
      if (s.id !== activeSheetId) return s;
      return {
        ...s,
        components: s.components.map((c) => {
          const pos = compPosMap.get(c.id);
          return pos ? { ...c, xMm: pos.x, yMm: pos.y } : c;
        }),
        cadAssets: s.cadAssets.map((a) => {
          const pos = cadPosMap.get(a.id);
          return pos ? { ...a, xMm: pos.x, yMm: pos.y } : a;
        }),
      };
    });

    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  setPinMarkingMode: (enabled, assetId = null) =>
    set({ isPinMarkingMode: enabled, activeMarkingAssetId: assetId }),

  updateTitleBlock: (partial) => {
    const { sheets, activeSheetId } = get();
    pushHistory(sheets);
    const updated = sheets.map((s) =>
      s.id === activeSheetId
        ? { ...s, titleBlock: { ...s.titleBlock, ...partial } }
        : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  setDoorMode: (mode) => {
    const { sheets, activeSheetId } = get();
    pushHistory(sheets);
    const updated = sheets.map((s) =>
      s.id === activeSheetId
        ? { ...s, enclosure: { ...s.enclosure, doorMode: mode } }
        : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  updateEnclosure: (partial) => {
    const { sheets, activeSheetId } = get();
    pushHistory(sheets);
    const updated = sheets.map((s) => {
      if (s.id !== activeSheetId) return s;
      const nextEnclosure = { ...s.enclosure, ...partial };
      const nextPlateConfig = {
        ...s.plateConfig,
        ...(partial.plateMode ? { mode: partial.plateMode } : {}),
        ...(partial.manualPlateWidthMm !== undefined
          ? { manualWidthMm: partial.manualPlateWidthMm }
          : {}),
        ...(partial.manualPlateHeightMm !== undefined
          ? { manualHeightMm: partial.manualPlateHeightMm }
          : {}),
      };
      return {
        ...s,
        enclosure: nextEnclosure,
        plateConfig: nextPlateConfig,
      };
    });
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  updatePlateConfig: (partial) => {
    const { sheets, activeSheetId } = get();
    pushHistory(sheets);
    const updated = sheets.map((s) => {
      if (s.id !== activeSheetId) return s;
      const nextPlate = { ...s.plateConfig, ...partial };
      const nextEnclosure = {
        ...s.enclosure,
        plateMode: nextPlate.mode,
        manualPlateWidthMm: nextPlate.manualWidthMm,
        manualPlateHeightMm: nextPlate.manualHeightMm,
      };
      return {
        ...s,
        plateConfig: nextPlate,
        enclosure: nextEnclosure,
      };
    });
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  addWire: (wire) => {
    const { sheets, activeSheetId, autoRouteDuctsEnabled } = get();
    pushHistory(sheets);
    const id = `wire-${Date.now()}`;
    const activeSheet = sheets.find((s) => s.id === activeSheetId)!;
    let waypoints = wire.waypoints;
    if (!waypoints && autoRouteDuctsEnabled && activeSheet.ducts.length > 0) {
      const p1 = resolvePinExitInfo(
        activeSheet.components,
        activeSheet.cadAssets,
        wire.fromComponentId,
        wire.fromPinId
      );
      const p2 = wire.toFreePoint
        ? {
            xMm: wire.toFreePoint.xMm,
            yMm: wire.toFreePoint.yMm,
            exitDir: undefined,
            stubPt: undefined,
          }
        : resolvePinExitInfo(
            activeSheet.components,
            activeSheet.cadAssets,
            wire.toComponentId,
            wire.toPinId
          );
      if (p1 && p2) {
        const obstacles = buildComponentObstacles(
          activeSheet.components,
          activeSheet.cadAssets
        );
        const pts = routeWireThroughDucts(
          { x: p1.xMm, y: p1.yMm },
          { x: p2.xMm, y: p2.yMm },
          activeSheet.ducts,
          activeSheet.rails,
          activeSheet.wires.length,
          {
            startExitDir: p1.exitDir,
            endExitDir: p2.exitDir,
            startStubPt: p1.stubPt,
            endStubPt: p2.stubPt,
            obstacles,
          }
        );
        waypoints = pts.map((p) => ({ xMm: p.x, yMm: p.y }));
      }
    }
    const newWire: WireConnection = { ...wire, id, ...(waypoints ? { waypoints } : {}) };
    const updated = sheets.map((s) =>
      s.id === activeSheetId ? { ...s, wires: [...s.wires, newWire] } : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      selected: { kind: "wire", id },
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  updateWire: (id, partial, options) => {
    const { sheets, activeSheetId } = get();
    if (!options?.skipHistory) {
      pushHistory(sheets);
    }
    const updated = sheets.map((s) =>
      s.id === activeSheetId
        ? {
            ...s,
            wires: s.wires.map((w) => (w.id === id ? { ...w, ...partial } : w)),
          }
        : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      ...(options?.skipHistory ? {} : { canUndo: true, canRedo: false }),
      ...syncActiveSheetProjection(active),
    });
  },

  updateWires: (ids, partial) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const { sheets, activeSheetId } = get();
    pushHistory(sheets);
    const updated = sheets.map((s) =>
      s.id === activeSheetId
        ? {
            ...s,
            wires: s.wires.map((w) => (idSet.has(w.id) ? { ...w, ...partial } : w)),
          }
        : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  removeWire: (id) => {
    const { sheets, activeSheetId, selected, selectedIds } = get();
    pushHistory(sheets);
    const updated = sheets.map((s) =>
      s.id === activeSheetId
        ? { ...s, wires: s.wires.filter((w) => w.id !== id) }
        : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      selected: selected?.id === id ? null : selected,
      selectedIds: selectedIds.filter((s) => s.id !== id),
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  autoRouteWire: (id) => {
    const { sheets, activeSheetId } = get();
    const activeSheet = sheets.find((s) => s.id === activeSheetId);
    if (!activeSheet) return;
    const wireIdx = activeSheet.wires.findIndex((w) => w.id === id);
    if (wireIdx === -1) return;
    const wire = activeSheet.wires[wireIdx];
    const p1 = resolvePinExitInfo(
      activeSheet.components,
      activeSheet.cadAssets,
      wire.fromComponentId,
      wire.fromPinId
    );
    const p2 = resolvePinExitInfo(
      activeSheet.components,
      activeSheet.cadAssets,
      wire.toComponentId,
      wire.toPinId
    );
    if (!p1 || !p2) return;

    pushHistory(sheets);
    const obstacles = buildComponentObstacles(
      activeSheet.components,
      activeSheet.cadAssets
    );
    const pts = routeWireThroughDucts(
      { x: p1.xMm, y: p1.yMm },
      { x: p2.xMm, y: p2.yMm },
      activeSheet.ducts,
      activeSheet.rails,
      wireIdx,
      {
        startExitDir: p1.exitDir,
        endExitDir: p2.exitDir,
        startStubPt: p1.stubPt,
        endStubPt: p2.stubPt,
        obstacles,
      }
    );
    const waypoints = pts.map((p) => ({ xMm: p.x, yMm: p.y }));
    const updated = sheets.map((s) =>
      s.id === activeSheetId
        ? {
            ...s,
            wires: s.wires.map((w) => (w.id === id ? { ...w, waypoints } : w)),
          }
        : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  autoRouteAllWires: () => {
    const { sheets, activeSheetId } = get();
    const activeSheet = sheets.find((s) => s.id === activeSheetId);
    if (!activeSheet || activeSheet.wires.length === 0) return;
    pushHistory(sheets);
    const obstacles = buildComponentObstacles(
      activeSheet.components,
      activeSheet.cadAssets
    );
    const routedWires = activeSheet.wires.map((wire, idx) => {
      const p1 = resolvePinExitInfo(
        activeSheet.components,
        activeSheet.cadAssets,
        wire.fromComponentId,
        wire.fromPinId
      );
      const p2 = resolvePinExitInfo(
        activeSheet.components,
        activeSheet.cadAssets,
        wire.toComponentId,
        wire.toPinId
      );
      if (!p1 || !p2) return wire;
      const pts = routeWireThroughDucts(
        { x: p1.xMm, y: p1.yMm },
        { x: p2.xMm, y: p2.yMm },
        activeSheet.ducts,
        activeSheet.rails,
        idx,
        {
          startExitDir: p1.exitDir,
          endExitDir: p2.exitDir,
          startStubPt: p1.stubPt,
          endStubPt: p2.stubPt,
          obstacles,
        }
      );
      return {
        ...wire,
        waypoints: pts.map((p) => ({ xMm: p.x, yMm: p.y })),
      };
    });
    const updated = sheets.map((s) =>
      s.id === activeSheetId ? { ...s, wires: routedWires } : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  autoNumberWires: (sheetId) => {
    const { sheets, activeSheetId } = get();
    const targetId = sheetId || activeSheetId;
    const targetSheet = sheets.find((s) => s.id === targetId);
    if (!targetSheet || targetSheet.wires.length === 0) return;
    pushHistory(sheets);
    const numberedWires = generateWireNumbers(targetSheet.wires);
    const updated = sheets.map((s) =>
      s.id === targetId ? { ...s, wires: numberedWires } : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  addRail: (customPos) => {
    const { sheets, activeSheetId, gridSnapMm, enclosure, plateConfig } = get();
    pushHistory(sheets);
    const activeSheet = sheets.find((s) => s.id === activeSheetId)!;
    const { rails } = activeSheet;
    const { widthMm } = getBackplateDimensions(enclosure, plateConfig);
    const newY = customPos?.yMm ?? (rails.length > 0 ? rails[rails.length - 1].yMm - 80 : 0);
    const newX = customPos?.xMm ?? 0;
    const snappedY = snapToGrid(newY, gridSnapMm);
    const snappedX = snapToGrid(newX, gridSnapMm);
    const id = makeUid("rail");
    const newRail: DinRail = {
      id,
      name: nextIncrementedName("DIN Rail", rails.map((r) => r.name)),
      xMm: snappedX,
      yMm: snappedY,
      lengthMm: Math.min(460, widthMm - 40),
    };
    const updated = sheets.map((s) =>
      s.id === activeSheetId ? { ...s, rails: [...s.rails, newRail] } : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      selected: { kind: "rail", id },
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  duplicateRail: (id, offsetMm = { x: 0, y: -120 }) => {
    const { sheets, activeSheetId, enclosure, plateConfig, gridSnapMm } = get();
    const activeSheet = sheets.find((s) => s.id === activeSheetId)!;
    const source = activeSheet.rails.find((r) => r.id === id);
    if (!source) return null;
    pushHistory(sheets);

    const { widthMm, heightMm } = getBackplateDimensions(enclosure, plateConfig);
    const rawX = snapToGrid(source.xMm + offsetMm.x, gridSnapMm);
    const rawY = snapToGrid(source.yMm + offsetMm.y, gridSnapMm);
    const clamped = clampToBackplate(
      rawX,
      rawY,
      source.lengthMm,
      DIN_RAIL_HEIGHT_MM,
      widthMm,
      heightMm
    );
    const newId = makeUid("rail");
    const duplicated: DinRail = {
      ...source,
      id: newId,
      name: nextIncrementedName(source.name, activeSheet.rails.map((r) => r.name)),
      xMm: clamped.xMm,
      yMm: clamped.yMm,
    };
    const updated = sheets.map((s) =>
      s.id === activeSheetId ? { ...s, rails: [...s.rails, duplicated] } : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      selected: { kind: "rail", id: newId },
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
    return newId;
  },

  updateRail: (id, partial, options) => {
    const { sheets, activeSheetId, autoRouteDuctsEnabled } = get();
    const activeSheet = sheets.find((s) => s.id === activeSheetId);
    const prevRail = activeSheet?.rails.find((r) => r.id === id);
    if (!activeSheet || !prevRail) return;
    if (prevRail.locked && partial.locked !== false) return;

    const nextRail: DinRail = { ...prevRail, ...partial };
    const dx = nextRail.xMm - prevRail.xMm;
    const dy = nextRail.yMm - prevRail.yMm;
    const lengthChanged = nextRail.lengthMm !== prevRail.lengthMm;

    if (!options?.skipHistory) {
      pushHistory(sheets);
    }

    const groupId = prevRail.groupId;
    const movedCompIds = new Set<string>();
    const updated = sheets.map((s) => {
      if (s.id !== activeSheetId) return s;

      const nextRails = s.rails.map((r) => {
        if (r.id === id) return nextRail;
        if (groupId && r.groupId === groupId && !r.locked && (dx !== 0 || dy !== 0)) {
          return { ...r, xMm: r.xMm + dx, yMm: r.yMm + dy };
        }
        return r;
      });
      const nextDucts =
        groupId && (dx !== 0 || dy !== 0)
          ? s.ducts.map((d) =>
              d.groupId === groupId && !d.locked
                ? { ...d, xMm: d.xMm + dx, yMm: d.yMm + dy }
                : d
            )
          : s.ducts;
      const nextCadAssets =
        groupId && (dx !== 0 || dy !== 0)
          ? s.cadAssets.map((a) => {
              if (a.groupId === groupId && !a.locked) {
                movedCompIds.add(a.id);
                return { ...a, xMm: a.xMm + dx, yMm: a.yMm + dy };
              }
              return a;
            })
          : s.cadAssets;

      if (dx === 0 && dy === 0 && !lengthChanged) {
        return { ...s, rails: nextRails };
      }

      const movedRailIds = new Set<string>([id]);
      if (groupId) {
        for (const r of s.rails) {
          if (r.groupId === groupId && !r.locked) movedRailIds.add(r.id);
        }
      }

      // Move all components bound to moved rail(s) or in the same group
      const movedDirect = s.components.map((c) => {
        if (c.railId && movedRailIds.has(c.railId)) {
          const targetRail = nextRails.find((r) => r.id === c.railId) ?? nextRail;
          const dims = getRotatedDimensions(c.widthMm, c.heightMm, c.rotationDeg ?? 0);
          const minX = targetRail.xMm - targetRail.lengthMm / 2 + dims.widthMm / 2;
          const maxX = targetRail.xMm + targetRail.lengthMm / 2 - dims.widthMm / 2;
          const rawX = c.xMm + dx;
          const nextX =
            minX <= maxX ? Math.max(minX, Math.min(maxX, rawX)) : targetRail.xMm;
          movedCompIds.add(c.id);
          return {
            ...c,
            xMm: nextX,
            yMm: targetRail.yMm,
          };
        }
        if (groupId && c.groupId === groupId && !c.locked && (dx !== 0 || dy !== 0)) {
          movedCompIds.add(c.id);
          return { ...c, xMm: c.xMm + dx, yMm: c.yMm + dy };
        }
        return c;
      });

      // Also move child components mounted to parents on this rail (e.g., TOR under Contactor)
      const nextComponents = movedDirect.map((c) => {
        if (c.mountedToComponentId && movedCompIds.has(c.mountedToComponentId)) {
          const parent = movedDirect.find((p) => p.id === c.mountedToComponentId);
          if (parent) {
            movedCompIds.add(c.id);
            return {
              ...c,
              xMm: parent.xMm,
              yMm: parent.yMm - parent.heightMm / 2 - c.heightMm / 2,
            };
          }
        }
        return c;
      });

      return recomputeBoundWires(
        {
          ...s,
          rails: nextRails,
          ducts: nextDucts,
          cadAssets: nextCadAssets,
          components: nextComponents,
        },
        autoRouteDuctsEnabled,
        movedCompIds.size > 0 ? movedCompIds : null
      );
    });

    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      ...(options?.skipHistory ? {} : { canUndo: true, canRedo: false }),
      ...syncActiveSheetProjection(active),
    });
  },

  removeRail: (id) => {
    const { sheets, activeSheetId, selected, selectedIds } = get();
    const activeSheet = sheets.find((s) => s.id === activeSheetId);
    if (activeSheet?.rails.find((r) => r.id === id)?.locked) return;
    pushHistory(sheets);
    const updated = sheets.map((s) =>
      s.id === activeSheetId
        ? {
            ...s,
            rails: s.rails.filter((r) => r.id !== id),
            components: s.components.map((c) =>
              c.railId === id ? { ...c, railId: null } : c
            ),
          }
        : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      selected: selected?.id === id ? null : selected,
      selectedIds: selectedIds.filter((s) => s.id !== id),
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  addDuct: (orientation = "horizontal", customPos) => {
    const { sheets, activeSheetId, enclosure, plateConfig, gridSnapMm } = get();
    pushHistory(sheets);
    const activeSheet = sheets.find((s) => s.id === activeSheetId)!;
    const { widthMm, heightMm } = getBackplateDimensions(enclosure, plateConfig);
    const id = makeUid("duct");
    const rawX = customPos ? snapToGrid(customPos.xMm, gridSnapMm) : 0;
    const rawY = customPos ? snapToGrid(customPos.yMm, gridSnapMm) : 0;
    const newDuct: WireDuct = {
      id,
      name: nextIncrementedName(
        orientation === "horizontal" ? "Horiz Duct" : "Vert Duct",
        activeSheet.ducts.map((d) => d.name)
      ),
      xMm: rawX,
      yMm: rawY,
      widthMm: orientation === "horizontal" ? Math.min(460, widthMm - 20) : 40,
      heightMm: orientation === "vertical" ? Math.min(500, heightMm - 40) : 40,
      depthMm: 60,
      orientation,
    };
    const updated = sheets.map((s) =>
      s.id === activeSheetId ? { ...s, ducts: [...s.ducts, newDuct] } : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      selected: { kind: "duct", id },
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  duplicateDuct: (id, offsetMm) => {
    const { sheets, activeSheetId, enclosure, plateConfig, gridSnapMm } = get();
    const activeSheet = sheets.find((s) => s.id === activeSheetId)!;
    const source = activeSheet.ducts.find((d) => d.id === id);
    if (!source) return null;
    pushHistory(sheets);

    const defaultOffset =
      source.orientation === "vertical" ? { x: 80, y: 0 } : { x: 0, y: -120 };
    const effOffset = offsetMm ?? defaultOffset;
    const { widthMm, heightMm } = getBackplateDimensions(enclosure, plateConfig);
    const rawX = snapToGrid(source.xMm + effOffset.x, gridSnapMm);
    const rawY = snapToGrid(source.yMm + effOffset.y, gridSnapMm);
    const clamped = clampToBackplate(
      rawX,
      rawY,
      source.widthMm,
      source.heightMm,
      widthMm,
      heightMm
    );
    const newId = makeUid("duct");
    const duplicated: WireDuct = {
      ...source,
      id: newId,
      name: nextIncrementedName(source.name, activeSheet.ducts.map((d) => d.name)),
      xMm: clamped.xMm,
      yMm: clamped.yMm,
    };
    const updated = sheets.map((s) =>
      s.id === activeSheetId ? { ...s, ducts: [...s.ducts, duplicated] } : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      selected: { kind: "duct", id: newId },
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
    return newId;
  },

  updateDuct: (id, partial, options) => {
    const { sheets, activeSheetId, autoRouteDuctsEnabled } = get();
    const activeSheet = sheets.find((s) => s.id === activeSheetId);
    const prevDuct = activeSheet?.ducts.find((d) => d.id === id);
    if (!activeSheet || !prevDuct) return;
    if (prevDuct.locked && partial.locked !== false) return;

    const nextDuct: WireDuct = { ...prevDuct, ...partial };
    const dx = nextDuct.xMm - prevDuct.xMm;
    const dy = nextDuct.yMm - prevDuct.yMm;

    if (!options?.skipHistory) {
      pushHistory(sheets);
    }

    const groupId = prevDuct.groupId;
    const updated = sheets.map((s) => {
      if (s.id !== activeSheetId) return s;
      const nextDucts = s.ducts.map((d) => {
        if (d.id === id) return nextDuct;
        if (groupId && d.groupId === groupId && !d.locked && (dx !== 0 || dy !== 0)) {
          return { ...d, xMm: d.xMm + dx, yMm: d.yMm + dy };
        }
        return d;
      });
      if (!groupId || (dx === 0 && dy === 0)) {
        return { ...s, ducts: nextDucts };
      }
      const movedIds = new Set<string>();
      const nextRails = s.rails.map((r) =>
        r.groupId === groupId && !r.locked ? { ...r, xMm: r.xMm + dx, yMm: r.yMm + dy } : r
      );
      const nextCadAssets = s.cadAssets.map((a) => {
        if (a.groupId === groupId && !a.locked) {
          movedIds.add(a.id);
          return { ...a, xMm: a.xMm + dx, yMm: a.yMm + dy };
        }
        return a;
      });
      const nextComponents = s.components.map((c) => {
        if (c.groupId === groupId && !c.locked) {
          movedIds.add(c.id);
          return { ...c, xMm: c.xMm + dx, yMm: c.yMm + dy };
        }
        return c;
      });
      return recomputeBoundWires(
        {
          ...s,
          ducts: nextDucts,
          rails: nextRails,
          cadAssets: nextCadAssets,
          components: nextComponents,
        },
        autoRouteDuctsEnabled,
        movedIds.size > 0 ? movedIds : null
      );
    });
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      ...(options?.skipHistory ? {} : { canUndo: true, canRedo: false }),
      ...syncActiveSheetProjection(active),
    });
  },

  removeDuct: (id) => {
    const { sheets, activeSheetId, selected, selectedIds } = get();
    const activeSheet = sheets.find((s) => s.id === activeSheetId);
    if (activeSheet?.ducts.find((d) => d.id === id)?.locked) return;
    pushHistory(sheets);
    const updated = sheets.map((s) =>
      s.id === activeSheetId
        ? { ...s, ducts: s.ducts.filter((d) => d.id !== id) }
        : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      selected: selected?.id === id ? null : selected,
      selectedIds: selectedIds.filter((s) => s.id !== id),
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  alignComponentsOnRail: (railId, mode) => {
    const { sheets, activeSheetId } = get();
    const activeSheet = sheets.find((s) => s.id === activeSheetId)!;
    const targetRail = activeSheet.rails.find((r) => r.id === railId);
    if (!targetRail) return;

    const attached = activeSheet.components.filter((c) => c.railId === railId);
    if (attached.length === 0) return;
    pushHistory(sheets);

    const sorted = [...attached].sort((a, b) => a.xMm - b.xMm);
    const railLeft = targetRail.xMm - targetRail.lengthMm / 2;
    const railRight = targetRail.xMm + targetRail.lengthMm / 2;
    const totalCompWidth = sorted.reduce((sum, c) => {
      const dims = getRotatedDimensions(c.widthMm, c.heightMm, c.rotationDeg ?? 0);
      return sum + dims.widthMm;
    }, 0);

    const positions = new Map<string, number>();

    if (mode === "left") {
      let curX = railLeft + 15;
      for (const comp of sorted) {
        const dims = getRotatedDimensions(comp.widthMm, comp.heightMm, comp.rotationDeg ?? 0);
        positions.set(comp.id, curX + dims.widthMm / 2);
        curX += dims.widthMm + 6;
      }
    } else if (mode === "right") {
      let curX = railRight - 15;
      for (let i = sorted.length - 1; i >= 0; i--) {
        const comp = sorted[i];
        const dims = getRotatedDimensions(comp.widthMm, comp.heightMm, comp.rotationDeg ?? 0);
        positions.set(comp.id, curX - dims.widthMm / 2);
        curX -= dims.widthMm + 6;
      }
    } else if (mode === "center") {
      const gap = 8;
      const totalBlockWidth = totalCompWidth + Math.max(0, sorted.length - 1) * gap;
      let curX = targetRail.xMm - totalBlockWidth / 2;
      for (const comp of sorted) {
        const dims = getRotatedDimensions(comp.widthMm, comp.heightMm, comp.rotationDeg ?? 0);
        positions.set(comp.id, curX + dims.widthMm / 2);
        curX += dims.widthMm + gap;
      }
    } else if (mode === "distribute") {
      if (sorted.length === 1) {
        positions.set(sorted[0].id, targetRail.xMm);
      } else {
        const availableSpan = targetRail.lengthMm - 30;
        const spacing = (availableSpan - totalCompWidth) / (sorted.length - 1);
        const effectiveSpacing = Math.max(4, spacing);
        let curX = railLeft + 15;
        for (const comp of sorted) {
          const dims = getRotatedDimensions(comp.widthMm, comp.heightMm, comp.rotationDeg ?? 0);
          positions.set(comp.id, curX + dims.widthMm / 2);
          curX += dims.widthMm + effectiveSpacing;
        }
      }
    }

    const updated = sheets.map((s) =>
      s.id === activeSheetId
        ? {
            ...s,
            components: s.components.map((c) => {
              if (!positions.has(c.id)) return c;
              return {
                ...c,
                xMm: Number(positions.get(c.id)!.toFixed(2)),
                yMm: targetRail.yMm,
              };
            }),
          }
        : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  alignItemToPlate: (target, edge) => {
    const { sheets, activeSheetId, enclosure, plateConfig } = get();
    const { widthMm: plateW, heightMm: plateH } = getBackplateDimensions(
      enclosure,
      plateConfig
    );
    pushHistory(sheets);
    const updated = sheets.map((s) => {
      if (s.id !== activeSheetId) return s;
      if (target.kind === "duct") {
        return {
          ...s,
          ducts: s.ducts.map((d) => {
            if (d.id !== target.id) return d;
            const pos = computeAlignToPlatePosition(
              d.widthMm,
              d.heightMm,
              d.xMm,
              d.yMm,
              plateW,
              plateH,
              edge
            );
            return { ...d, ...pos };
          }),
        };
      }
      if (target.kind === "rail") {
        return {
          ...s,
          rails: s.rails.map((r) => {
            if (r.id !== target.id) return r;
            const pos = computeAlignToPlatePosition(
              r.lengthMm,
              DIN_RAIL_HEIGHT_MM,
              r.xMm,
              r.yMm,
              plateW,
              plateH,
              edge
            );
            return { ...r, ...pos };
          }),
        };
      }
      if (target.kind === "component") {
        return {
          ...s,
          components: s.components.map((c) => {
            if (c.id !== target.id) return c;
            const dims = getRotatedDimensions(
              c.widthMm,
              c.heightMm,
              c.rotationDeg ?? 0
            );
            const pos = computeAlignToPlatePosition(
              dims.widthMm,
              dims.heightMm,
              c.xMm,
              c.yMm,
              plateW,
              plateH,
              edge
            );
            return { ...c, ...pos };
          }),
        };
      }
      return {
        ...s,
        cadAssets: s.cadAssets.map((a) => {
          if (a.id !== target.id) return a;
          const bounds = getEffectiveCadBounds(a);
          const dims = getRotatedDimensions(bounds.widthMm, bounds.heightMm, a.rotationDeg ?? 0);
          const pos = computeAlignToPlatePosition(
            dims.widthMm,
            dims.heightMm,
            a.xMm + bounds.offsetX,
            a.yMm + bounds.offsetY,
            plateW,
            plateH,
            edge
          );
          return {
            ...a,
            xMm: pos.xMm - bounds.offsetX,
            yMm: pos.yMm - bounds.offsetY,
          };
        }),
      };
    });
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  alignComponentToRail: (componentId, edge) => {
    const { sheets, activeSheetId } = get();
    const activeSheet = sheets.find((s) => s.id === activeSheetId);
    if (!activeSheet) return;
    const comp = activeSheet.components.find((c) => c.id === componentId);
    if (!comp || !comp.railId) return;
    const rail = activeSheet.rails.find((r) => r.id === comp.railId);
    if (!rail) return;

    const dims = getRotatedDimensions(
      comp.widthMm,
      comp.heightMm,
      comp.rotationDeg ?? 0
    );
    const nextX = computeAlignToRailX(dims.widthMm, rail, edge);
    pushHistory(sheets);
    const updated = sheets.map((s) =>
      s.id === activeSheetId
        ? {
            ...s,
            components: s.components.map((c) =>
              c.id === componentId
                ? { ...c, xMm: Number(nextX.toFixed(2)), yMm: rail.yMm }
                : c
            ),
          }
        : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  autoResizeToFit: (target) => {
    const { sheets, activeSheetId, enclosure, plateConfig } = get();
    const activeSheet = sheets.find((s) => s.id === activeSheetId);
    if (!activeSheet) return;
    const { widthMm: plateW, heightMm: plateH } = getBackplateDimensions(
      enclosure,
      plateConfig
    );
    pushHistory(sheets);

    const updated = sheets.map((s) => {
      if (s.id !== activeSheetId) return s;
      if (target.kind === "rail") {
        const rail = s.rails.find((r) => r.id === target.id);
        if (!rail) return s;
        const { xMm, widthMm } = computeAutoResizeWidth({
          targetId: rail.id,
          targetKind: "rail",
          anchorXMm: rail.xMm,
          yMm: rail.yMm,
          bandHeightMm: DIN_RAIL_HEIGHT_MM,
          plateWidthMm: plateW,
          rails: s.rails,
          ducts: s.ducts,
          components: s.components,
          cadAssets: s.cadAssets,
        });
        return {
          ...s,
          rails: s.rails.map((r) =>
            r.id === rail.id ? { ...r, xMm, lengthMm: widthMm } : r
          ),
        };
      }
      const duct = s.ducts.find((d) => d.id === target.id);
      if (!duct) return s;
      if (duct.orientation === "horizontal") {
        const { xMm, widthMm } = computeAutoResizeWidth({
          targetId: duct.id,
          targetKind: "duct",
          anchorXMm: duct.xMm,
          yMm: duct.yMm,
          bandHeightMm: duct.heightMm,
          plateWidthMm: plateW,
          rails: s.rails,
          ducts: s.ducts,
          components: s.components,
          cadAssets: s.cadAssets,
        });
        return {
          ...s,
          ducts: s.ducts.map((d) =>
            d.id === duct.id ? { ...d, xMm, widthMm } : d
          ),
        };
      }
      const { yMm, heightMm } = computeAutoResizeHeight({
        targetId: duct.id,
        xMm: duct.xMm,
        anchorYMm: duct.yMm,
        bandWidthMm: duct.widthMm,
        plateHeightMm: plateH,
        rails: s.rails,
        ducts: s.ducts,
        components: s.components,
        cadAssets: s.cadAssets,
      });
      return {
        ...s,
        ducts: s.ducts.map((d) =>
          d.id === duct.id ? { ...d, yMm, heightMm } : d
        ),
      };
    });
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  autoResizeSelectedToFit: () => {
    const { sheets, activeSheetId, selectedIds, enclosure, plateConfig } = get();
    if (selectedIds.length === 0) return;
    const activeSheet = sheets.find((s) => s.id === activeSheetId);
    if (!activeSheet) return;

    const orientations = selectedIds.map((sel) => {
      if (sel.kind === "rail") return "horizontal";
      if (sel.kind === "duct") {
        return activeSheet.ducts.find((d) => d.id === sel.id)?.orientation ?? null;
      }
      return null;
    });
    const allHorizontal = orientations.every((o) => o === "horizontal");
    const allVertical = orientations.every((o) => o === "vertical");
    if (!allHorizontal && !allVertical) return;

    const { widthMm: plateW, heightMm: plateH } = getBackplateDimensions(
      enclosure,
      plateConfig
    );
    const railSet = new Set(
      selectedIds.filter((s) => s.kind === "rail").map((s) => s.id)
    );
    const ductSet = new Set(
      selectedIds.filter((s) => s.kind === "duct").map((s) => s.id)
    );
    pushHistory(sheets);

    const updated = sheets.map((s) => {
      if (s.id !== activeSheetId) return s;
      return {
        ...s,
        rails: allHorizontal
          ? s.rails.map((r) => {
              if (!railSet.has(r.id)) return r;
              const { xMm, widthMm } = computeAutoResizeWidth({
                targetId: r.id,
                targetKind: "rail",
                anchorXMm: r.xMm,
                yMm: r.yMm,
                bandHeightMm: DIN_RAIL_HEIGHT_MM,
                plateWidthMm: plateW,
                rails: s.rails,
                ducts: s.ducts,
                components: s.components,
                cadAssets: s.cadAssets,
              });
              return { ...r, xMm, lengthMm: widthMm };
            })
          : s.rails,
        ducts: s.ducts.map((d) => {
          if (!ductSet.has(d.id)) return d;
          if (allHorizontal && d.orientation === "horizontal") {
            const { xMm, widthMm } = computeAutoResizeWidth({
              targetId: d.id,
              targetKind: "duct",
              anchorXMm: d.xMm,
              yMm: d.yMm,
              bandHeightMm: d.heightMm,
              plateWidthMm: plateW,
              rails: s.rails,
              ducts: s.ducts,
              components: s.components,
              cadAssets: s.cadAssets,
            });
            return { ...d, xMm, widthMm };
          }
          if (allVertical && d.orientation === "vertical") {
            const { yMm, heightMm } = computeAutoResizeHeight({
              targetId: d.id,
              xMm: d.xMm,
              anchorYMm: d.yMm,
              bandWidthMm: d.widthMm,
              plateHeightMm: plateH,
              rails: s.rails,
              ducts: s.ducts,
              components: s.components,
              cadAssets: s.cadAssets,
            });
            return { ...d, yMm, heightMm };
          }
          return d;
        }),
      };
    });

    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  addComponent: (templateId, nearYMm, customPos) => {
    const template = COMPONENT_CATALOG[templateId];
    if (!template) return;
    const { sheets, activeSheetId, gridSnapMm, selected } = get();
    const activeSheet = sheets.find((s) => s.id === activeSheetId)!;

    let mountedToComponentId: string | undefined;
    let snapResult: { railId: string | null; xMm: number; yMm: number; zMm: number };
    const mounting = template.mountingType ?? "din_rail";

    if (mounting === "parent_mount" || templateId === "tor") {
      const targetTemplates = template.behavior?.mountTargetTemplateIds ?? ["contactor"];
      const availableParents = activeSheet.components.filter(
        (c) =>
          targetTemplates.includes(c.templateId) &&
          !activeSheet.components.some(
            (other) =>
              other.templateId === templateId &&
              other.mountedToComponentId === c.id
          )
      );
      if (availableParents.length === 0) {
        return;
      }
      let targetParent =
        selected?.kind === "component"
          ? availableParents.find((c) => c.id === selected.id)
          : undefined;
      if (!targetParent && customPos) {
        targetParent = [...availableParents].sort((a, b) => {
          const da = Math.hypot(a.xMm - customPos.xMm, a.yMm - customPos.yMm);
          const db = Math.hypot(b.xMm - customPos.xMm, b.yMm - customPos.yMm);
          return da - db;
        })[0];
      }
      targetParent = targetParent ?? availableParents[0];
      mountedToComponentId = targetParent.id;
      snapResult = {
        railId: null,
        xMm: targetParent.xMm,
        yMm:
          targetParent.yMm -
          targetParent.heightMm / 2 -
          template.heightMm / 2,
        zMm: targetParent.zMm,
      };
    } else if (mounting === "din_rail") {
      // DIN-rail components can ONLY be placed on an existing DIN rail, never on a duct or floating
      if (activeSheet.rails.length === 0) {
        return;
      }
      const targetX = customPos?.xMm ?? 0;
      const targetY = customPos?.yMm ?? nearYMm ?? activeSheet.rails[0].yMm;
      snapResult = snapComponentToNearestRail(
        targetX,
        targetY,
        template.widthMm,
        template.depthMm,
        activeSheet.rails,
        gridSnapMm
      );
      if (!snapResult.railId) {
        return;
      }
      const rail = activeSheet.rails.find((r) => r.id === snapResult.railId)!;
      if (template.behavior?.sideBySideSnap) {
        const railBounds = {
          minX: rail.xMm - rail.lengthMm / 2 + template.widthMm / 2,
          maxX: rail.xMm + rail.lengthMm / 2 - template.widthMm / 2,
        };
        const sideSnap = snapSideBySideOnRail(
          snapResult.xMm,
          template.widthMm,
          snapResult.railId,
          activeSheet.components,
          "",
          railBounds
        );
        snapResult = { ...snapResult, xMm: sideSnap.xMm };
      }
      const ductFreeX = clampToDuctFreeRailX(
        snapResult.xMm,
        rail,
        template.widthMm,
        template.heightMm,
        activeSheet.ducts
      );
      if (ductFreeX === null) {
        return;
      }
      snapResult = { ...snapResult, xMm: ductFreeX };
    } else if (mounting === "screw_plate") {
      // screw_plate: free mount on backplate (no DIN snap), but never overlapping Wire Ducts
      const rawX = snapToGrid(customPos?.xMm ?? 0, gridSnapMm);
      const rawY = snapToGrid(customPos?.yMm ?? nearYMm ?? 0, gridSnapMm);
      const resolved = resolveDuctFreePlatePosition(
        rawX,
        rawY,
        template.widthMm,
        template.heightMm,
        activeSheet.ducts
      );
      if (!resolved) {
        return;
      }
      snapResult = {
        railId: null,
        xMm: resolved.xMm,
        yMm: resolved.yMm,
        zMm: template.depthMm / 2,
      };
    } else {
      // door_cutout: mounts on door face (no DIN rail snap, unaffected by backplate ducts)
      snapResult = {
        railId: null,
        xMm: snapToGrid(customPos?.xMm ?? 0, gridSnapMm),
        yMm: snapToGrid(customPos?.yMm ?? nearYMm ?? 0, gridSnapMm),
        zMm: template.depthMm / 2,
      };
    }

    pushHistory(sheets);

    const id = makeUid("comp");
    const prefix = template.tagPrefix || template.shortName;
    const existingNames = new Set(activeSheet.components.map((c) => c.name));
    let nextTagNum = 1;
    while (existingNames.has(`${prefix}${nextTagNum}`)) {
      nextTagNum += 1;
    }
    const autoTagName = `${prefix}${nextTagNum}`;

    const newComponent: PlacedComponent = {
      id,
      templateId,
      name: autoTagName,
      mountingType: mounting,
      xMm: snapResult.xMm,
      yMm: snapResult.yMm,
      zMm: snapResult.zMm,
      rotationDeg: 0,
      railId: snapResult.railId,
      mountedToComponentId,
      widthMm: template.widthMm,
      heightMm: template.heightMm,
      depthMm: template.depthMm,
      color: template.color,
      accentColor: template.accentColor,
      pins: template.pins.map((p, idx) => ({
        ...p,
        id: `${id}-pin-${idx + 1}`,
      })),
    };

    const updated = sheets.map((s) =>
      s.id === activeSheetId
        ? { ...s, components: [...s.components, newComponent] }
        : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    const nextRecents = [
      templateId,
      ...get().recentPartIds.filter((x) => x !== templateId),
    ].slice(0, MAX_RECENT_PARTS);
    savePartIdsToStorage(RECENTS_STORAGE_KEY, nextRecents);
    set({
      sheets: updated,
      selected: { kind: "component", id },
      recentPartIds: nextRecents,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  rotateComponent: (id, deltaDeg = 90) => {
    const { sheets, activeSheetId, autoRouteDuctsEnabled } = get();
    pushHistory(sheets);
    const updated = sheets.map((s) =>
      s.id === activeSheetId
        ? recomputeBoundWires(
            {
              ...s,
              components: s.components.map((c) => {
                if (c.id !== id) return c;
                const current = c.rotationDeg ?? 0;
                const nextDeg = (((current + deltaDeg) % 360) + 360) % 360 as RotationDeg;
                return { ...c, rotationDeg: nextDeg };
              }),
            },
            autoRouteDuctsEnabled,
            new Set([id])
          )
        : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  duplicateComponent: (id, offsetMm = { x: 20, y: 0 }) => {
    const { sheets, activeSheetId, gridSnapMm, enclosure, plateConfig } = get();
    const activeSheet = sheets.find((s) => s.id === activeSheetId)!;
    const source = activeSheet.components.find((c) => c.id === id);
    if (!source) return null;
    pushHistory(sheets);

    const newId = makeUid("comp");
    const targetX = source.xMm + offsetMm.x;
    const targetY = source.yMm + offsetMm.y;

    const snapResult = snapComponentToNearestRail(
      targetX,
      targetY,
      source.widthMm,
      source.depthMm,
      activeSheet.rails,
      gridSnapMm,
      source.railId ? 20 : Infinity
    );

    const { widthMm: plateW, heightMm: plateH } = getBackplateDimensions(
      enclosure,
      plateConfig
    );
    const clamped = clampToBackplate(
      snapResult.xMm,
      snapResult.yMm,
      source.widthMm,
      source.heightMm,
      plateW,
      plateH
    );

    const duplicated: PlacedComponent = {
      ...source,
      id: newId,
      name: nextIncrementedName(source.name, activeSheet.components.map((c) => c.name)),
      xMm: clamped.xMm,
      yMm: clamped.yMm,
      zMm: snapResult.zMm,
      railId: snapResult.railId,
      pins: source.pins.map((p, idx) => ({
        ...p,
        id: `${newId}-pin-${idx + 1}`,
      })),
    };

    const updated = sheets.map((s) =>
      s.id === activeSheetId
        ? { ...s, components: [...s.components, duplicated] }
        : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      selected: { kind: "component", id: newId },
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
    return newId;
  },

  snapComponentToRail: (id) => {
    const { sheets, activeSheetId, gridSnapMm } = get();
    const activeSheet = sheets.find((s) => s.id === activeSheetId)!;
    const comp = activeSheet.components.find((c) => c.id === id);
    if (!comp) return;
    pushHistory(sheets);

    const snapResult = snapComponentToNearestRail(
      comp.xMm,
      comp.yMm,
      comp.widthMm,
      comp.depthMm,
      activeSheet.rails,
      gridSnapMm
    );

    const updated = sheets.map((s) =>
      s.id === activeSheetId
        ? {
            ...s,
            components: s.components.map((c) =>
              c.id === id
                ? {
                    ...c,
                    xMm: snapResult.xMm,
                    yMm: snapResult.yMm,
                    zMm: snapResult.zMm,
                    railId: snapResult.railId,
                  }
                : c
            ),
          }
        : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  updateComponent: (id, partial) => {
    const { sheets, activeSheetId } = get();
    pushHistory(sheets);
    const updated = sheets.map((s) =>
      s.id === activeSheetId
        ? {
            ...s,
            components: s.components.map((c) => (c.id === id ? { ...c, ...partial } : c)),
          }
        : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  moveComponent: (id, targetXMm, targetYMm, options) => {
    const { sheets, activeSheetId, gridSnapMm, enclosure, plateConfig } = get();
    const activeSheet = sheets.find((s) => s.id === activeSheetId)!;
    const comp = activeSheet.components.find((c) => c.id === id);
    if (!comp || comp.locked) return;

    const { widthMm: plateW, heightMm: plateH } = getBackplateDimensions(
      enclosure,
      plateConfig
    );

    // Mounted TOR stays attached to a compatible Contactor (can re-mount to another nearby Contactor)
    if (comp.mountingType === "parent_mount" && comp.mountedToComponentId) {
      const targetTemplates =
        COMPONENT_CATALOG[comp.templateId]?.behavior?.mountTargetTemplateIds ?? ["contactor"];
      const availableContactors = activeSheet.components.filter(
        (c) =>
          targetTemplates.includes(c.templateId) &&
          !activeSheet.components.some(
            (other) =>
              other.id !== comp.id &&
              other.mountedToComponentId === c.id
          )
      );
      let targetParent = availableContactors.find(
        (c) => c.id === comp.mountedToComponentId
      );
      const nearest = [...availableContactors].sort((a, b) => {
        const da = Math.hypot(a.xMm - targetXMm, a.yMm - a.heightMm / 2 - comp.heightMm / 2 - targetYMm);
        const db = Math.hypot(b.xMm - targetXMm, b.yMm - b.heightMm / 2 - comp.heightMm / 2 - targetYMm);
        return da - db;
      })[0];
      if (nearest) {
        const dist = Math.hypot(
          nearest.xMm - targetXMm,
          nearest.yMm - nearest.heightMm / 2 - comp.heightMm / 2 - targetYMm
        );
        if (dist <= 60) {
          targetParent = nearest;
        }
      }
      if (!targetParent) return;
      const mountedX = targetParent.xMm;
      const mountedY =
        targetParent.yMm - targetParent.heightMm / 2 - comp.heightMm / 2;
      const { autoRouteDuctsEnabled } = get();
      const updated = sheets.map((s) =>
        s.id === activeSheetId
          ? recomputeBoundWires(
              {
                ...s,
                components: s.components.map((c) =>
                  c.id === id
                    ? {
                        ...c,
                        xMm: mountedX,
                        yMm: mountedY,
                        zMm: targetParent.zMm,
                        railId: null,
                        mountedToComponentId: targetParent.id,
                      }
                    : c
                ),
              },
              autoRouteDuctsEnabled,
              new Set([id])
            )
          : s
      );
      const active = updated.find((s) => s.id === activeSheetId)!;
      set({
        sheets: updated,
        ...syncActiveSheetProjection(active),
      });
      return;
    }

    const template = COMPONENT_CATALOG[comp.templateId];
    const effectiveMounting =
      comp.mountingType ?? template?.mountingType ?? "din_rail";
    const rotDims = getRotatedDimensions(
      comp.widthMm,
      comp.heightMm,
      comp.rotationDeg ?? 0
    );

    let snapResult: { railId: string | null; xMm: number; yMm: number; zMm: number };
    let effectiveX: number;
    let effectiveY: number;

    if (effectiveMounting === "din_rail") {
      // DIN-rail components can ONLY move along DIN rails and never onto Wire Ducts
      if (activeSheet.rails.length === 0) return;

      snapResult = snapComponentToNearestRail(
        targetXMm,
        targetYMm,
        rotDims.widthMm,
        comp.depthMm,
        activeSheet.rails,
        gridSnapMm
      );
      if (!snapResult.railId) return;

      const rail = activeSheet.rails.find((r) => r.id === snapResult.railId);
      if (!rail) return;

      const railMinX = rail.xMm - rail.lengthMm / 2 + rotDims.widthMm / 2;
      const railMaxX = rail.xMm + rail.lengthMm / 2 - rotDims.widthMm / 2;
      let candidateX = options?.skipGridSnapX
        ? Math.max(railMinX, Math.min(railMaxX, targetXMm))
        : snapResult.xMm;

      if (template?.behavior?.sideBySideSnap && !options?.skipGridSnapX) {
        const sideSnap = snapSideBySideOnRail(
          targetXMm,
          rotDims.widthMm,
          snapResult.railId,
          activeSheet.components.filter(
            (other) => !comp.groupId || other.groupId !== comp.groupId
          ),
          comp.id,
          { minX: railMinX, maxX: railMaxX }
        );
        if (sideSnap.snappedToNeighborId) {
          candidateX = sideSnap.xMm;
        }
      }

      const ductFreeX = clampToDuctFreeRailX(
        candidateX,
        rail,
        rotDims.widthMm,
        rotDims.heightMm,
        activeSheet.ducts
      );
      if (ductFreeX === null) {
        // Entire rail is blocked by a duct; stay at previous valid position
        return;
      }

      // Always lock Y to DIN rail (ignore skipGridSnapY so alignment guides cannot pull off-rail)
      effectiveX = ductFreeX;
      effectiveY = rail.yMm;
    } else if (effectiveMounting === "screw_plate") {
      // screw_plate: free on backplate (no DIN snap), but cannot overlap Wire Ducts
      const rawX = options?.skipGridSnapX
        ? targetXMm
        : snapToGrid(targetXMm, gridSnapMm);
      const rawY = options?.skipGridSnapY
        ? targetYMm
        : snapToGrid(targetYMm, gridSnapMm);

      const resolved = resolveDuctFreePlatePosition(
        rawX,
        rawY,
        rotDims.widthMm,
        rotDims.heightMm,
        activeSheet.ducts,
        { xMm: comp.xMm, yMm: comp.yMm }
      );
      if (!resolved) return;

      snapResult = {
        railId: null,
        xMm: resolved.xMm,
        yMm: resolved.yMm,
        zMm: comp.depthMm / 2,
      };
      effectiveX = resolved.xMm;
      effectiveY = resolved.yMm;
    } else {
      // door_cutout: free positioning on door (no DIN snap, unaffected by backplate ducts)
      snapResult = {
        railId: null,
        xMm: snapToGrid(targetXMm, gridSnapMm),
        yMm: snapToGrid(targetYMm, gridSnapMm),
        zMm: comp.depthMm / 2,
      };
      effectiveX = options?.skipGridSnapX ? targetXMm : snapResult.xMm;
      effectiveY = options?.skipGridSnapY ? targetYMm : snapResult.yMm;
    }

    const clamped = clampToBackplate(
      effectiveX,
      effectiveY,
      rotDims.widthMm,
      rotDims.heightMm,
      plateW,
      plateH
    );

    if (
      effectiveMounting === "screw_plate" &&
      overlapsAnyDuct(
        clamped.xMm,
        clamped.yMm,
        rotDims.widthMm,
        rotDims.heightMm,
        activeSheet.ducts
      )
    ) {
      return;
    }

    const deltaX = clamped.xMm - comp.xMm;
    const deltaY = clamped.yMm - comp.yMm;
    const { autoRouteDuctsEnabled } = get();
    const movedIds = new Set<string>([id]);
    for (const c of activeSheet.components) {
      if (
        c.mountedToComponentId === id ||
        (comp.groupId && c.groupId === comp.groupId && !c.locked)
      ) {
        movedIds.add(c.id);
      }
    }
    for (const a of activeSheet.cadAssets) {
      if (comp.groupId && a.groupId === comp.groupId && !a.locked) {
        movedIds.add(a.id);
      }
    }

    const updated = sheets.map((s) =>
      s.id === activeSheetId
        ? recomputeBoundWires(
            {
              ...s,
              components: s.components.map((c) => {
                if (c.id === id) {
                  return {
                    ...c,
                    xMm: clamped.xMm,
                    yMm: clamped.yMm,
                    zMm: snapResult.zMm,
                    railId: snapResult.railId,
                  };
                }
                if (c.mountedToComponentId === id) {
                  return {
                    ...c,
                    xMm: clamped.xMm,
                    yMm: clamped.yMm - comp.heightMm / 2 - c.heightMm / 2,
                    zMm: snapResult.zMm,
                    railId: null,
                  };
                }
                if (comp.groupId && c.groupId === comp.groupId && !c.locked) {
                  const subClamped = clampToBackplate(
                    c.xMm + deltaX,
                    c.yMm + deltaY,
                    c.widthMm,
                    c.heightMm,
                    plateW,
                    plateH
                  );
                  return {
                    ...c,
                    xMm: subClamped.xMm,
                    yMm: subClamped.yMm,
                  };
                }
                return c;
              }),
              cadAssets: s.cadAssets.map((a) => {
                if (comp.groupId && a.groupId === comp.groupId && !a.locked) {
                  const subClamped = clampToBackplate(
                    a.xMm + deltaX,
                    a.yMm + deltaY,
                    a.boundingBoxMm.w,
                    a.boundingBoxMm.h,
                    plateW,
                    plateH
                  );
                  return {
                    ...a,
                    xMm: subClamped.xMm,
                    yMm: subClamped.yMm,
                  };
                }
                return a;
              }),
            },
            autoRouteDuctsEnabled,
            movedIds
          )
        : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      ...syncActiveSheetProjection(active),
    });
  },

  removeComponent: (id) => {
    const { sheets, activeSheetId, selected, selectedIds } = get();
    const activeSheet = sheets.find((s) => s.id === activeSheetId);
    if (activeSheet?.components.find((c) => c.id === id)?.locked) return;
    pushHistory(sheets);
    const removedIds = new Set<string>([id]);
    if (activeSheet) {
      for (const c of activeSheet.components) {
        if (c.mountedToComponentId === id) {
          removedIds.add(c.id);
        }
      }
    }
    const updated = sheets.map((s) =>
      s.id === activeSheetId
        ? {
            ...s,
            components: s.components.filter((c) => !removedIds.has(c.id)),
            wires: s.wires.filter(
              (w) =>
                !removedIds.has(w.fromComponentId) &&
                !removedIds.has(w.toComponentId)
            ),
          }
        : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      selected: selected && removedIds.has(selected.id) ? null : selected,
      selectedIds: selectedIds.filter((s) => !removedIds.has(s.id)),
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  addCadAsset: (asset) => {
    const { sheets, activeSheetId } = get();
    pushHistory(sheets);
    const updated = sheets.map((s) =>
      s.id === activeSheetId ? { ...s, cadAssets: [...s.cadAssets, asset] } : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      selected: { kind: "cad", id: asset.id },
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  rotateCadAsset: (id, deltaDeg = 90) => {
    const { sheets, activeSheetId, autoRouteDuctsEnabled } = get();
    pushHistory(sheets);
    const updated = sheets.map((s) =>
      s.id === activeSheetId
        ? recomputeBoundWires(
            {
              ...s,
              cadAssets: s.cadAssets.map((a) => {
                if (a.id !== id) return a;
                const current = a.rotationDeg ?? 0;
                const nextDeg = (((current + deltaDeg) % 360) + 360) % 360 as RotationDeg;
                return { ...a, rotationDeg: nextDeg };
              }),
            },
            autoRouteDuctsEnabled,
            new Set([id])
          )
        : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  duplicateCadAsset: (id, offsetMm = { x: 20, y: 0 }) => {
    const { sheets, activeSheetId, enclosure, plateConfig, gridSnapMm } = get();
    const activeSheet = sheets.find((s) => s.id === activeSheetId)!;
    const source = activeSheet.cadAssets.find((a) => a.id === id);
    if (!source) return null;
    pushHistory(sheets);

    const newId = makeUid("cad");
    const { widthMm: plateW, heightMm: plateH } = getBackplateDimensions(
      enclosure,
      plateConfig
    );
    const rawX = snapToGrid(source.xMm + offsetMm.x, gridSnapMm);
    const rawY = snapToGrid(source.yMm + offsetMm.y, gridSnapMm);
    const clamped = clampToBackplate(
      rawX,
      rawY,
      source.boundingBoxMm.w,
      source.boundingBoxMm.h,
      plateW,
      plateH
    );

    const duplicated: CustomCadAsset = {
      ...source,
      id: newId,
      name: nextIncrementedName(source.name, activeSheet.cadAssets.map((a) => a.name)),
      xMm: clamped.xMm,
      yMm: clamped.yMm,
      pins: source.pins.map((p, idx) => ({
        ...p,
        id: `${newId}-pin-${idx + 1}`,
      })),
    };

    const updated = sheets.map((s) =>
      s.id === activeSheetId ? { ...s, cadAssets: [...s.cadAssets, duplicated] } : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      selected: { kind: "cad", id: newId },
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
    return newId;
  },

  addCustomDrawnComponent: ({
    name,
    xMm,
    yMm,
    widthMm,
    heightMm,
    depthMm = 5,
    materialType = "copper",
    drawShape = "rectangle",
  }) => {
    const { sheets, activeSheetId } = get();
    const activeSheet = sheets.find((s) => s.id === activeSheetId)!;
    pushHistory(sheets);

    const newId = `busbar-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const defaultPrefix = materialType === "copper" ? "Busbar" : "Plate";
    const finalName = name || nextIncrementedName(defaultPrefix, activeSheet.cadAssets.map((a) => a.name));

    const newAsset: CustomCadAsset = {
      id: newId,
      name: finalName,
      fileName: `${finalName.toLowerCase().replace(/\s+/g, "-")}.custom`,
      format: "dxf",
      sourceUnit: "mm",
      xMm,
      yMm,
      zMm: depthMm / 2 + 2,
      rotationDeg: 0,
      boundingBoxMm: {
        w: widthMm,
        h: heightMm,
        d: depthMm,
      },
      pins: [],
      materialType,
      drawShape,
    };

    const updated = sheets.map((s) =>
      s.id === activeSheetId ? { ...s, cadAssets: [...s.cadAssets, newAsset] } : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      selected: { kind: "cad", id: newId },
      canvasTool2D: "select",
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
    return newId;
  },

  updateCadAsset: (id, partial, options) => {
    const { sheets, activeSheetId, autoRouteDuctsEnabled } = get();
    const activeSheet = sheets.find((s) => s.id === activeSheetId);
    const prevAsset = activeSheet?.cadAssets.find((a) => a.id === id);
    if (!activeSheet || !prevAsset) return;
    if (prevAsset.locked && partial.locked !== false) return;

    if (!options?.skipHistory) {
      pushHistory(sheets);
    }
    const updated = sheets.map((s) => {
      if (s.id !== activeSheetId) return s;
      const nextSheet = {
        ...s,
        cadAssets: s.cadAssets.map((a) => (a.id === id ? { ...a, ...partial } : a)),
      };
      if (
        partial.xMm !== undefined ||
        partial.yMm !== undefined ||
        partial.boundingBoxMm !== undefined ||
        partial.pins !== undefined
      ) {
        return recomputeBoundWires(nextSheet, autoRouteDuctsEnabled, new Set([id]));
      }
      return nextSheet;
    });
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      ...(options?.skipHistory ? {} : { canUndo: true, canRedo: false }),
      ...syncActiveSheetProjection(active),
    });
  },

  moveCadAsset: (id, targetXMm, targetYMm, options) => {
    const { sheets, activeSheetId, gridSnapMm, enclosure, plateConfig } = get();
    const activeSheet = sheets.find((s) => s.id === activeSheetId)!;
    const asset = activeSheet.cadAssets.find((a) => a.id === id);
    if (!asset || asset.locked) return;

    const snapResult = snapComponentToNearestRail(
      targetXMm,
      targetYMm,
      asset.boundingBoxMm.w,
      asset.boundingBoxMm.d,
      activeSheet.rails,
      gridSnapMm,
      25
    );

    const effectiveX = options?.skipGridSnapX ? targetXMm : snapResult.xMm;
    const effectiveY = options?.skipGridSnapY ? targetYMm : snapResult.yMm;

    const { widthMm: plateW, heightMm: plateH } = getBackplateDimensions(
      enclosure,
      plateConfig
    );
    const clamped = clampToBackplate(
      effectiveX,
      effectiveY,
      asset.boundingBoxMm.w,
      asset.boundingBoxMm.h,
      plateW,
      plateH
    );

    const deltaX = clamped.xMm - asset.xMm;
    const deltaY = clamped.yMm - asset.yMm;

    const updated = sheets.map((s) =>
      s.id === activeSheetId
        ? {
            ...s,
            cadAssets: s.cadAssets.map((a) => {
              if (a.id === id) {
                return {
                  ...a,
                  xMm: clamped.xMm,
                  yMm: clamped.yMm,
                  zMm: snapResult.snappedToRail ? snapResult.zMm : a.zMm,
                };
              }
              if (asset.groupId && a.groupId === asset.groupId && !a.locked) {
                const subClamped = clampToBackplate(
                  a.xMm + deltaX,
                  a.yMm + deltaY,
                  a.boundingBoxMm.w,
                  a.boundingBoxMm.h,
                  plateW,
                  plateH
                );
                return {
                  ...a,
                  xMm: subClamped.xMm,
                  yMm: subClamped.yMm,
                };
              }
              return a;
            }),
            components: s.components.map((c) => {
              if (asset.groupId && c.groupId === asset.groupId && !c.locked) {
                const subClamped = clampToBackplate(
                  c.xMm + deltaX,
                  c.yMm + deltaY,
                  c.widthMm,
                  c.heightMm,
                  plateW,
                  plateH
                );
                return {
                  ...c,
                  xMm: subClamped.xMm,
                  yMm: subClamped.yMm,
                };
              }
              return c;
            }),
          }
        : s
    ).map((s) =>
      s.id === activeSheetId
        ? recomputeBoundWires(s, get().autoRouteDuctsEnabled, null)
        : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      ...syncActiveSheetProjection(active),
    });
  },

  removeCadAsset: (id) => {
    const { sheets, activeSheetId, selected, isPinMarkingMode, activeMarkingAssetId } = get();
    const activeSheet = sheets.find((s) => s.id === activeSheetId);
    if (activeSheet?.cadAssets.find((a) => a.id === id)?.locked) return;
    pushHistory(sheets);
    const updated = sheets.map((s) =>
      s.id === activeSheetId
        ? {
            ...s,
            cadAssets: s.cadAssets.filter((a) => a.id !== id),
            wires: s.wires.filter(
              (w) => w.fromComponentId !== id && w.toComponentId !== id
            ),
          }
        : s
    );
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      selected: selected?.id === id ? null : selected,
      isPinMarkingMode: activeMarkingAssetId === id ? false : isPinMarkingMode,
      activeMarkingAssetId: activeMarkingAssetId === id ? null : activeMarkingAssetId,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  addPinToAsset: (assetId, pin) => {
    const { sheets, activeSheetId } = get();
    pushHistory(sheets);
    const updated = sheets.map((s) => {
      if (s.id !== activeSheetId) return s;
      return {
        ...s,
        cadAssets: s.cadAssets.map((a) => {
          if (a.id !== assetId) return a;
          const newPin: PinTerminal = {
            ...pin,
            id: `pin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          };
          return { ...a, pins: [...a.pins, newPin] };
        }),
      };
    });
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  removePinFromAsset: (assetId, pinId) => {
    const { sheets, activeSheetId } = get();
    pushHistory(sheets);
    const updated = sheets.map((s) => {
      if (s.id !== activeSheetId) return s;
      return {
        ...s,
        cadAssets: s.cadAssets.map((a) =>
          a.id === assetId
            ? { ...a, pins: a.pins.filter((p) => p.id !== pinId) }
            : a
        ),
        wires: s.wires.filter(
          (w) =>
            !(
              (w.fromComponentId === assetId && w.fromPinId === pinId) ||
              (w.toComponentId === assetId && w.toPinId === pinId)
            )
        ),
      };
    });
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  updatePinInAsset: (assetId, pinId, partial) => {
    const { sheets, activeSheetId } = get();
    pushHistory(sheets);
    const updated = sheets.map((s) => {
      if (s.id !== activeSheetId) return s;
      return {
        ...s,
        cadAssets: s.cadAssets.map((a) =>
          a.id === assetId
            ? {
                ...a,
                pins: a.pins.map((p) => (p.id === pinId ? { ...p, ...partial } : p)),
              }
            : a
        ),
      };
    });
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  updateComponentPin: (componentId, pinId, partial) => {
    const { sheets, activeSheetId } = get();
    pushHistory(sheets);
    const updated = sheets.map((s) => {
      if (s.id !== activeSheetId) return s;
      return {
        ...s,
        components: s.components.map((c) =>
          c.id === componentId
            ? {
                ...c,
                pins: c.pins.map((p) => (p.id === pinId ? { ...p, ...partial } : p)),
              }
            : c
        ),
      };
    });
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  removePinFromComponent: (componentId, pinId) => {
    const { sheets, activeSheetId } = get();
    pushHistory(sheets);
    const updated = sheets.map((s) => {
      if (s.id !== activeSheetId) return s;
      return {
        ...s,
        components: s.components.map((c) =>
          c.id === componentId
            ? { ...c, pins: c.pins.filter((p) => p.id !== pinId) }
            : c
        ),
        wires: s.wires.filter(
          (w) =>
            !(
              (w.fromComponentId === componentId && w.fromPinId === pinId) ||
              (w.toComponentId === componentId && w.toPinId === pinId)
            )
        ),
      };
    });
    const active = updated.find((s) => s.id === activeSheetId)!;
    set({
      sheets: updated,
      canUndo: true,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  loadProjectState: (params) => {
    if (!params.sheets || params.sheets.length === 0) return;
    historyStack = { past: [], future: [] };
    const validActiveId =
      params.activeSheetId &&
      params.sheets.some((s) => s.id === params.activeSheetId)
        ? params.activeSheetId
        : params.sheets[0].id;
    const active = params.sheets.find((s) => s.id === validActiveId)!;

    set({
      sheets: params.sheets,
      activeSheetId: validActiveId,
      displayUnit: params.displayUnit ?? get().displayUnit,
      gridSnapMm: params.gridSnapMm ?? get().gridSnapMm,
      autoRouteDuctsEnabled:
        params.autoRouteDuctsEnabled ?? get().autoRouteDuctsEnabled,
      showPinLabels: params.showPinLabels ?? get().showPinLabels,
      selected: null,
      selectedIds: [],
      isPinMarkingMode: false,
      activeMarkingAssetId: null,
      canUndo: false,
      canRedo: false,
      ...syncActiveSheetProjection(active),
    });
  },

  resetToDefaultProject: () => {
    historyStack = { past: [], future: [] };
    const defaultSheet = createDefaultSheet();
    set({
      sheets: [defaultSheet],
      activeSheetId: defaultSheet.id,
      displayUnit: "mm",
      gridSnapMm: 10,
      selected: null,
      selectedIds: [],
      isPinMarkingMode: false,
      activeMarkingAssetId: null,
      canUndo: false,
      canRedo: false,
      ...syncActiveSheetProjection(defaultSheet),
    });
  },
}));
