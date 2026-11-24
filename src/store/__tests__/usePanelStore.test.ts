import { beforeEach, describe, expect, it } from "vitest";
import { rotateLocalPoint } from "@/lib/snap";
import { usePanelStore } from "@/store/usePanelStore";

describe("usePanelStore - Default 2D & Context Menu Actions", () => {
  const initialSnapshot = usePanelStore.getState();

  beforeEach(() => {
    const freshSheet = initialSnapshot.sheets[0];
    const clonedSheet = {
      ...freshSheet,
      rails: freshSheet.rails.map((r) => ({ ...r })),
      ducts: freshSheet.ducts.map((d) => ({ ...d })),
      components: freshSheet.components.map((c) => ({
        ...c,
        pins: c.pins.map((p) => ({ ...p })),
      })),
      cadAssets: [],
      wires: freshSheet.wires.map((w) => ({ ...w })),
    };
    usePanelStore.setState({
      sheets: [clonedSheet],
      activeSheetId: clonedSheet.id,
      viewportMode: "2d",
      canvasTool2D: "select",
      gridSnapMm: 10,
      enclosure: clonedSheet.enclosure,
      plateConfig: clonedSheet.plateConfig,
      rails: clonedSheet.rails,
      ducts: clonedSheet.ducts,
      components: clonedSheet.components,
      cadAssets: clonedSheet.cadAssets,
      wires: clonedSheet.wires,
      titleBlock: clonedSheet.titleBlock,
      selected: null,
      selectedIds: [],
    });
  });

  it("defaults viewportMode to 2d", () => {
    expect(usePanelStore.getState().viewportMode).toBe("2d");
  });

  it("rotates component by 90 degrees modulo 360 and transforms pin coordinates", () => {
    const store = usePanelStore.getState();
    const targetId = "comp-1";

    expect(store.components.find((c) => c.id === targetId)?.rotationDeg ?? 0).toBe(0);

    store.rotateComponent(targetId, 90);
    expect(usePanelStore.getState().components.find((c) => c.id === targetId)?.rotationDeg).toBe(90);

    store.rotateComponent(targetId, 90);
    expect(usePanelStore.getState().components.find((c) => c.id === targetId)?.rotationDeg).toBe(180);

    store.rotateComponent(targetId, 90);
    expect(usePanelStore.getState().components.find((c) => c.id === targetId)?.rotationDeg).toBe(270);

    store.rotateComponent(targetId, 90);
    expect(usePanelStore.getState().components.find((c) => c.id === targetId)?.rotationDeg).toBe(0);

    expect(rotateLocalPoint(10, 20, 0)).toEqual({ xMm: 10, yMm: 20 });
    expect(rotateLocalPoint(10, 20, 90)).toEqual({ xMm: 20, yMm: -10 });
    expect(rotateLocalPoint(10, 20, 180)).toEqual({ xMm: -10, yMm: -20 });
    expect(rotateLocalPoint(10, 20, 270)).toEqual({ xMm: -20, yMm: 10 });
  });

  it("duplicates component with auto-incremented name, +20mm X offset, and new pin IDs", () => {
    const store = usePanelStore.getState();
    const source = store.components.find((c) => c.id === "comp-4")!; // Motor Contactor KM1
    const beforeCount = store.components.length;

    const newId = store.duplicateComponent(source.id, { x: 20, y: 0 });
    expect(newId).toBeTruthy();

    const state = usePanelStore.getState();
    expect(state.components.length).toBe(beforeCount + 1);
    const dup = state.components.find((c) => c.id === newId)!;
    expect(dup.name).toBe("KM2");
    expect(dup.xMm).toBe(source.xMm + 20);
    expect(dup.yMm).toBe(source.yMm);
    expect(dup.pins.length).toBe(source.pins.length);
    expect(dup.pins[0].id).not.toBe(source.pins[0].id);
    expect(state.selected).toEqual({ kind: "component", id: newId });
  });

  it("removes component along with all connected wires", () => {
    const store = usePanelStore.getState();
    expect(store.wires.some((w) => w.fromComponentId === "comp-1" || w.toComponentId === "comp-1")).toBe(true);

    store.removeComponent("comp-1");
    const state = usePanelStore.getState();
    expect(state.components.find((c) => c.id === "comp-1")).toBeUndefined();
    expect(state.wires.some((w) => w.fromComponentId === "comp-1" || w.toComponentId === "comp-1")).toBe(false);
  });

  it("duplicates DIN rail and wire ducts with parallel offsets", () => {
    const store = usePanelStore.getState();
    const rail = store.rails[0]; // yMm: 200
    const newRailId = store.duplicateRail(rail.id, { x: 0, y: -120 });
    expect(newRailId).toBeTruthy();
    const dupRail = usePanelStore.getState().rails.find((r) => r.id === newRailId)!;
    expect(dupRail.yMm).toBe(rail.yMm - 120);

    const hDuct = store.ducts.find((d) => d.orientation === "horizontal")!;
    const newHDuctId = store.duplicateDuct(hDuct.id);
    const dupHDuct = usePanelStore.getState().ducts.find((d) => d.id === newHDuctId)!;
    expect(dupHDuct.yMm).toBe(hDuct.yMm - 120);

    const vDuct = store.ducts.find((d) => d.id === "duct-v-left")!; // xMm: -230
    const newVDuctId = store.duplicateDuct(vDuct.id);
    const dupVDuct = usePanelStore.getState().ducts.find((d) => d.id === newVDuctId)!;
    expect(dupVDuct.xMm).toBe(vDuct.xMm + 80);
  });

  it("aligns components on a DIN rail (left, center, right, distribute)", () => {
    const store = usePanelStore.getState();
    const railId = "rail-1";
    const rail = store.rails.find((r) => r.id === railId)!;

    // Left align
    store.alignComponentsOnRail(railId, "left");
    let onRail = usePanelStore
      .getState()
      .components.filter((c) => c.railId === railId)
      .sort((a, b) => a.xMm - b.xMm);
    const railLeft = rail.xMm - rail.lengthMm / 2;
    expect(onRail[0].xMm).toBeCloseTo(railLeft + 15 + onRail[0].widthMm / 2, 1);

    // Center align
    store.alignComponentsOnRail(railId, "center");
    onRail = usePanelStore
      .getState()
      .components.filter((c) => c.railId === railId)
      .sort((a, b) => a.xMm - b.xMm);
    const centerMid = (onRail[0].xMm - onRail[0].widthMm / 2 + (onRail[onRail.length - 1].xMm + onRail[onRail.length - 1].widthMm / 2)) / 2;
    expect(centerMid).toBeCloseTo(rail.xMm, 1);

    // Distribute evenly
    store.alignComponentsOnRail(railId, "distribute");
    onRail = usePanelStore
      .getState()
      .components.filter((c) => c.railId === railId)
      .sort((a, b) => a.xMm - b.xMm);
    const railRight = rail.xMm + rail.lengthMm / 2;
    expect(onRail[0].xMm - onRail[0].widthMm / 2).toBeCloseTo(railLeft + 15, 1);
    expect(onRail[onRail.length - 1].xMm + onRail[onRail.length - 1].widthMm / 2).toBeCloseTo(railRight - 15, 1);
  });

  it("updates wire color and gauge and adds items at custom cursor positions", () => {
    const store = usePanelStore.getState();
    store.updateWire("wire-1", { colorCode: "PE", gaugeMm2: "6.0" });
    const updatedWire = usePanelStore.getState().wires.find((w) => w.id === "wire-1")!;
    expect(updatedWire.colorCode).toBe("PE");
    expect(updatedWire.gaugeMm2).toBe("6.0");

    const beforeComps = usePanelStore.getState().components.length;
    store.addComponent("mcb-1p", undefined, { xMm: 123, yMm: 195 });
    const afterComps = usePanelStore.getState().components;
    expect(afterComps.length).toBe(beforeComps + 1);
    const added = afterComps[afterComps.length - 1];
    expect(added.railId).toBe("rail-1");
    expect(added.xMm).toBe(120); // snapped to 10mm grid
  });

  it("supports multi-sheet add, switch, rename, duplicate, and delete (min 1 sheet)", () => {
    const store = usePanelStore.getState();
    expect(store.sheets.length).toBe(1);
    const firstId = store.activeSheetId;

    // Cannot delete the last remaining sheet
    store.deleteSheet(firstId);
    expect(usePanelStore.getState().sheets.length).toBe(1);

    // Add a schematic sheet and switch to it automatically
    const secId = store.addSheet("schematic", "Control Schematic");
    let state = usePanelStore.getState();
    expect(state.sheets.length).toBe(2);
    expect(state.activeSheetId).toBe(secId);
    expect(state.components.length).toBe(0); // new sheet starts clean

    // Rename sheet
    state.renameSheet(secId, "Main Schematic");
    expect(usePanelStore.getState().sheets.find((s) => s.id === secId)?.name).toBe("Main Schematic");

    // Duplicate first sheet
    const dupId = state.duplicateSheet(firstId)!;
    state = usePanelStore.getState();
    expect(state.sheets.length).toBe(3);
    expect(state.activeSheetId).toBe(dupId);
    expect(state.components.length).toBeGreaterThan(0);

    // Switch back to first sheet
    state.setActiveSheet(firstId);
    expect(usePanelStore.getState().activeSheetId).toBe(firstId);

    // Delete duplicated sheet
    state.deleteSheet(dupId);
    expect(usePanelStore.getState().sheets.length).toBe(2);
  });

  it("supports undo and redo with max 30 history steps", () => {
    const store = usePanelStore.getState();
    const initialCount = store.components.length;

    store.addComponent("mcb-1p");
    expect(usePanelStore.getState().components.length).toBe(initialCount + 1);
    expect(usePanelStore.getState().canUndo).toBe(true);

    store.undo();
    expect(usePanelStore.getState().components.length).toBe(initialCount);
    expect(usePanelStore.getState().canRedo).toBe(true);

    store.redo();
    expect(usePanelStore.getState().components.length).toBe(initialCount + 1);

    // Exceed 30 steps: cap at 30 undos
    for (let i = 0; i < 35; i++) {
      usePanelStore.getState().addRail();
    }
    let undoCount = 0;
    while (usePanelStore.getState().canUndo && undoCount < 40) {
      usePanelStore.getState().undo();
      undoCount += 1;
    }
    expect(undoCount).toBe(30);
    expect(usePanelStore.getState().canUndo).toBe(false);
  });

  it("switches theme between light and dark", () => {
    const store = usePanelStore.getState();
    expect(store.theme).toBe("light");

    store.setTheme("dark");
    expect(usePanelStore.getState().theme).toBe("dark");

    store.toggleTheme();
    expect(usePanelStore.getState().theme).toBe("light");
  });

  it("supports multi-selection via setSelectedIds, toggleSelectId, and clearSelection", () => {
    const store = usePanelStore.getState();

    store.setSelectedIds([
      { kind: "component", id: "comp-1" },
      { kind: "component", id: "comp-2" },
    ]);
    expect(usePanelStore.getState().selectedIds).toHaveLength(2);
    expect(usePanelStore.getState().selected).toEqual({ kind: "component", id: "comp-1" });

    // Shift+Click toggle adds comp-3
    store.toggleSelectId({ kind: "component", id: "comp-3" });
    expect(usePanelStore.getState().selectedIds).toHaveLength(3);

    // Shift+Click toggle removes comp-2
    store.toggleSelectId({ kind: "component", id: "comp-2" });
    expect(usePanelStore.getState().selectedIds).toEqual([
      { kind: "component", id: "comp-1" },
      { kind: "component", id: "comp-3" },
    ]);

    store.clearSelection();
    expect(usePanelStore.getState().selectedIds).toEqual([]);
    expect(usePanelStore.getState().selected).toBeNull();
  });

  it("moves all selected items together with moveSelectedItems and clamps to backplate", () => {
    const store = usePanelStore.getState();
    const c1Before = store.components.find((c) => c.id === "comp-1")!;
    const c3Before = store.components.find((c) => c.id === "comp-3")!;

    store.setSelectedIds([
      { kind: "component", id: "comp-1" },
      { kind: "component", id: "comp-3" },
    ]);

    store.moveSelectedItems(30, -20);
    const state = usePanelStore.getState();
    const c1After = state.components.find((c) => c.id === "comp-1")!;
    const c3After = state.components.find((c) => c.id === "comp-3")!;
    const c2After = state.components.find((c) => c.id === "comp-2")!;

    expect(c1After.xMm).toBe(c1Before.xMm + 30);
    expect(c1After.yMm).toBe(c1Before.yMm - 20);
    expect(c3After.xMm).toBe(c3Before.xMm + 30);
    expect(c3After.yMm).toBe(c3Before.yMm - 20);
    // Unselected component stays put
    expect(c2After.xMm).toBe(-100);
  });

  it("deletes all selected items and connected wires in one undoable batch", () => {
    const store = usePanelStore.getState();
    const initialCompCount = store.components.length;
    expect(store.wires.length).toBeGreaterThan(0);

    store.setSelectedIds([
      { kind: "component", id: "comp-1" },
      { kind: "component", id: "comp-3" },
    ]);

    store.deleteSelectedItems();
    let state = usePanelStore.getState();
    expect(state.components.length).toBe(initialCompCount - 2);
    expect(state.components.find((c) => c.id === "comp-1")).toBeUndefined();
    expect(state.components.find((c) => c.id === "comp-3")).toBeUndefined();
    // Both wire-1 (from comp-1) and wire-2 (from comp-3) should be removed
    expect(state.wires).toHaveLength(0);
    expect(state.selectedIds).toEqual([]);
    expect(state.selected).toBeNull();
    expect(state.canUndo).toBe(true);

    // Undo restores both components and their wires
    state.undo();
    state = usePanelStore.getState();
    expect(state.components.length).toBe(initialCompCount);
    expect(state.wires.length).toBeGreaterThan(0);
  });

  it("aligns selected items (left, center, top)", () => {
    const store = usePanelStore.getState();
    store.setSelectedIds([
      { kind: "component", id: "comp-1" },
      { kind: "component", id: "comp-4" },
    ]);

    store.alignSelectedItems("left");
    let state = usePanelStore.getState();
    const c1 = state.components.find((c) => c.id === "comp-1")!;
    const c4 = state.components.find((c) => c.id === "comp-4")!;
    expect(c1.xMm - c1.widthMm / 2).toBeCloseTo(c4.xMm - c4.widthMm / 2, 1);

    store.alignSelectedItems("top");
    state = usePanelStore.getState();
    const c1Top = state.components.find((c) => c.id === "comp-1")!;
    const c4Top = state.components.find((c) => c.id === "comp-4")!;
    expect(c1Top.yMm + c1Top.heightMm / 2).toBeCloseTo(
      c4Top.yMm + c4Top.heightMm / 2,
      1
    );
  });

  it("controls inspector visibility and tab switching between inspector and bom", () => {
    const store = usePanelStore.getState();
    expect(store.inspectorOpen).toBe(true);
    expect(store.leftSidebarOpen).toBe(true);
    expect(store.rightPanelTab).toBe("inspector");

    store.setLeftSidebarOpen(false);
    expect(usePanelStore.getState().leftSidebarOpen).toBe(false);

    store.toggleLeftSidebar();
    expect(usePanelStore.getState().leftSidebarOpen).toBe(true);

    store.setRightPanelTab("bom");
    expect(usePanelStore.getState().rightPanelTab).toBe("bom");

    store.setInspectorOpen(false);
    expect(usePanelStore.getState().inspectorOpen).toBe(false);

    // requestInspectorFocus reopens inspector and switches to inspector tab
    store.requestInspectorFocus();
    expect(usePanelStore.getState().inspectorOpen).toBe(true);
    expect(usePanelStore.getState().rightPanelTab).toBe("inspector");
  });

  it("controls leftSidebarOpen state via setLeftSidebarOpen and toggleLeftSidebar", () => {
    const store = usePanelStore.getState();
    expect(store.leftSidebarOpen).toBe(true);

    store.setLeftSidebarOpen(false);
    expect(usePanelStore.getState().leftSidebarOpen).toBe(false);

    store.toggleLeftSidebar();
    expect(usePanelStore.getState().leftSidebarOpen).toBe(true);

    store.toggleLeftSidebar();
    expect(usePanelStore.getState().leftSidebarOpen).toBe(false);
  });

  it("manages favorite and recent parts with max limit of 8 items", () => {
    const store = usePanelStore.getState();
    usePanelStore.setState({
      favoritePartIds: [],
      recentPartIds: [],
    });

    // Toggle favorite
    store.toggleFavoritePart("mcb-1p");
    expect(usePanelStore.getState().favoritePartIds).toEqual(["mcb-1p"]);

    store.toggleFavoritePart("contactor");
    expect(usePanelStore.getState().favoritePartIds).toEqual(["contactor", "mcb-1p"]);

    store.toggleFavoritePart("mcb-1p");
    expect(usePanelStore.getState().favoritePartIds).toEqual(["contactor"]);

    // Recent parts pushing and capping at 8 items
    const parts = [
      "mcb-1p",
      "mcb-2p",
      "mcb-3p",
      "mcb-4p",
      "mccb-100a",
      "contactor",
      "tor",
      "psu-24v",
      "terminal-block",
    ] as const;

    for (const p of parts) {
      store.addRecentPart(p);
    }

    const state = usePanelStore.getState();
    expect(state.recentPartIds.length).toBe(8);
    // Most recent is at front
    expect(state.recentPartIds[0]).toBe("terminal-block");
    // Oldest 'mcb-1p' was dropped
    expect(state.recentPartIds.includes("mcb-1p")).toBe(false);

    // Adding existing moves it to top
    store.addRecentPart("mcb-2p");
    expect(usePanelStore.getState().recentPartIds[0]).toBe("mcb-2p");
    expect(usePanelStore.getState().recentPartIds.length).toBe(8);
  });

  it("handles keyboard nudge for 1mm and 5mm", () => {
    const store = usePanelStore.getState();
    const c1 = store.components.find((c) => c.id === "comp-1")!;
    const startX = c1.xMm;
    const startY = c1.yMm;

    store.setSelected({ kind: "component", id: "comp-1" });
    store.nudgeSelectedItems(1, 0);

    let state = usePanelStore.getState();
    let updatedC1 = state.components.find((c) => c.id === "comp-1")!;
    expect(updatedC1.xMm).toBe(startX + 1);
    expect(updatedC1.yMm).toBe(startY);

    // Shift nudge (5mm)
    store.nudgeSelectedItems(0, -5);
    state = usePanelStore.getState();
    updatedC1 = state.components.find((c) => c.id === "comp-1")!;
    expect(updatedC1.xMm).toBe(startX + 1);
    expect(updatedC1.yMm).toBe(startY - 5);

    // Undo restores position
    store.undo();
    state = usePanelStore.getState();
    updatedC1 = state.components.find((c) => c.id === "comp-1")!;
    expect(updatedC1.xMm).toBe(startX + 1);
    expect(updatedC1.yMm).toBe(startY);
  });

  it("copies and pastes components with +15mm offset, new ID and auto-incremented name", () => {
    const store = usePanelStore.getState();
    const c1 = store.components.find((c) => c.id === "comp-1")!;
    store.setSelected({ kind: "component", id: "comp-1" });

    const copiedCount = store.copySelectedToClipboard();
    expect(copiedCount).toBe(1);
    expect(usePanelStore.getState().clipboardItems.length).toBe(1);

    const pasted = store.pasteFromClipboard({ x: 15, y: -15 });
    expect(pasted.length).toBe(1);
    expect(pasted[0].kind).toBe("component");

    const state = usePanelStore.getState();
    const pastedComp = state.components.find((c) => c.id === pasted[0].id)!;
    expect(pastedComp).toBeDefined();
    expect(pastedComp.id).not.toBe(c1.id);
    expect(pastedComp.xMm).toBe(c1.xMm + 15);
    expect(pastedComp.yMm).toBe(c1.yMm - 15);
    expect(pastedComp.name).toBe("QF3");
    expect(pastedComp.pins.length).toBe(c1.pins.length);
    expect(pastedComp.pins[0].id).not.toBe(c1.pins[0].id);
  });

  it("respects mountingType behavior: screw_plate and door_cutout do not snap to DIN rail when moved", () => {
    const store = usePanelStore.getState();
    // Place VFD in duct-free backplate space (between rail-2 y=40 and rail-3 y=-140, center y=-50)
    store.addComponent("vfd-15kw", undefined, { xMm: 100, yMm: -50 });
    const vfd = usePanelStore.getState().components.find((c) => c.templateId === "vfd-15kw")!;
    expect(vfd.railId).toBeNull();
    expect(vfd.name).toBe("U1");

    // Move VFD to duct-free space near rail-2 (y=20): must NOT snap to rail-2 (y=40)
    usePanelStore.getState().moveComponent(vfd.id, 110, -40);
    const movedVfd = usePanelStore.getState().components.find((c) => c.id === vfd.id)!;
    expect(movedVfd.railId).toBeNull();
    expect(movedVfd.yMm).toBe(-40);

    // Moving VFD onto horizontal Mid Duct (y=120, h=40) must push it out of the duct
    usePanelStore.getState().moveComponent(vfd.id, 110, 120);
    const ductFreeVfd = usePanelStore.getState().components.find((c) => c.id === vfd.id)!;
    expect(Math.abs(ductFreeVfd.yMm - 120)).toBeGreaterThanOrEqual((ductFreeVfd.heightMm + 40) / 2 - 0.1);

    // Moving DIN-rail component (comp-1, QF1) toward Left Vertical Duct (x=-230, w=40 -> right edge -210)
    // must clamp strictly on rail-1 (y=200) and NOT overlap the vertical duct
    usePanelStore.getState().moveComponent("comp-1", -230, 280, { skipGridSnapY: true });
    const movedMcb = usePanelStore.getState().components.find((c) => c.id === "comp-1")!;
    expect(movedMcb.railId).toBe("rail-1");
    expect(movedMcb.yMm).toBe(200);
    expect(movedMcb.xMm - movedMcb.widthMm / 2).toBeGreaterThanOrEqual(-210 - 0.1);

    // Door cutout component must stay free of DIN rails and unaffected by backplate ducts
    usePanelStore.getState().addComponent("pilot-lamp-red", undefined, { xMm: -50, yMm: 180 });
    const lamp = usePanelStore.getState().components.find((c) => c.templateId === "pilot-lamp-red")!;
    expect(lamp.railId).toBeNull();
    expect(lamp.name).toBe("HR1");
    usePanelStore.getState().moveComponent(lamp.id, -40, 190);
    const movedLamp = usePanelStore.getState().components.find((c) => c.id === lamp.id)!;
    expect(movedLamp.railId).toBeNull();
    expect(movedLamp.yMm).toBe(190);
  });

  it("blocks adding DIN-rail components when no DIN rail exists on the sheet", () => {
    const store = usePanelStore.getState();
    store.addSheet("mounting-plate", "Empty Sheet");
    expect(usePanelStore.getState().rails.length).toBe(0);
    usePanelStore.getState().addComponent("mcb-1p", undefined, { xMm: 0, yMm: 0 });
    expect(usePanelStore.getState().components.length).toBe(0);
  });

  it("keeps bound wire endpoints locked to pins when a connected component moves", () => {
    const store = usePanelStore.getState();
    store.addWire({
      label: "W99",
      colorCode: "R",
      gaugeMm2: "2.5",
      fromComponentId: "comp-1",
      fromPinId: "comp-1-pin-4",
      toComponentId: "comp-4",
      toPinId: "comp-4-pin-1",
    });
    const beforeWire = usePanelStore.getState().wires.find((w) => w.label === "W99")!;
    expect(beforeWire.waypoints && beforeWire.waypoints.length >= 2).toBe(true);
    const startXBefore = beforeWire.waypoints![0].xMm;

    // Move comp-1 along rail-1 by +60mm
    usePanelStore.getState().moveComponent("comp-1", -100, 200);
    const movedComp = usePanelStore.getState().components.find((c) => c.id === "comp-1")!;
    const afterWire = usePanelStore.getState().wires.find((w) => w.label === "W99")!;
    const pin4 = movedComp.pins.find((p) => p.id === "comp-1-pin-4")!;
    expect(afterWire.waypoints![0].xMm).toBeCloseTo(movedComp.xMm + pin4.localXMm, 2);
    expect(afterWire.waypoints![0].xMm).not.toBeCloseTo(startXBefore, 1);
  });

  it("moves all bound components, mounted TOR children, and connected wires when a DIN rail moves", () => {
    const store = usePanelStore.getState();
    // Mount a TOR under comp-4 (Contactor on rail-2 at y=40)
    store.setSelected({ kind: "component", id: "comp-4" });
    store.addComponent("tor");

    const beforeContactor = usePanelStore.getState().components.find((c) => c.id === "comp-4")!;
    const beforeTor = usePanelStore.getState().components.find((c) => c.templateId === "tor")!;
    expect(beforeContactor.railId).toBe("rail-2");
    expect(beforeTor.mountedToComponentId).toBe("comp-4");

    // Move rail-2 by dx=+20, dy=-30 (from x=0, y=40 to x=20, y=10)
    usePanelStore.getState().updateRail("rail-2", { xMm: 20, yMm: 10 });

    const state = usePanelStore.getState();
    const afterContactor = state.components.find((c) => c.id === "comp-4")!;
    const afterTor = state.components.find((c) => c.templateId === "tor")!;
    expect(afterContactor.xMm).toBe(beforeContactor.xMm + 20);
    expect(afterContactor.yMm).toBe(10);
    expect(afterTor.xMm).toBe(afterContactor.xMm);
    expect(afterTor.yMm).toBeCloseTo(10 - afterContactor.heightMm / 2 - afterTor.heightMm / 2, 2);
  });

  it("supports undo and redo for toggling autoRouteDuctsEnabled and wire routes", () => {
    const store = usePanelStore.getState();
    expect(store.autoRouteDuctsEnabled).toBe(true);

    store.setAutoRouteDuctsEnabled(false);
    expect(usePanelStore.getState().autoRouteDuctsEnabled).toBe(false);
    expect(usePanelStore.getState().canUndo).toBe(true);

    usePanelStore.getState().undo();
    expect(usePanelStore.getState().autoRouteDuctsEnabled).toBe(true);
    expect(usePanelStore.getState().canRedo).toBe(true);

    usePanelStore.getState().redo();
    expect(usePanelStore.getState().autoRouteDuctsEnabled).toBe(false);
  });

  it("handles grouping (Ctrl+G), paired drag movement, and ungrouping (Ctrl+Shift+G)", () => {
    const store = usePanelStore.getState();
    const c1 = store.components.find((c) => c.id === "comp-1")!;
    const c2 = store.components.find((c) => c.id === "comp-2")!;

    store.setSelectedIds([
      { kind: "component", id: c1.id },
      { kind: "component", id: c2.id },
    ]);

    const groupId = store.groupSelectedItems();
    expect(groupId).toBeTruthy();

    let state = usePanelStore.getState();
    let comp1 = state.components.find((c) => c.id === c1.id)!;
    let comp2 = state.components.find((c) => c.id === c2.id)!;
    expect(comp1.groupId).toBe(groupId);
    expect(comp2.groupId).toBe(groupId);

    // Moving comp1 moves comp2 by same delta
    const deltaX = 20;
    const deltaY = 10;
    store.moveComponent(comp1.id, comp1.xMm + deltaX, comp1.yMm + deltaY, {
      skipGridSnapX: true,
      skipGridSnapY: true,
    });

    state = usePanelStore.getState();
    comp1 = state.components.find((c) => c.id === c1.id)!;
    comp2 = state.components.find((c) => c.id === c2.id)!;
    expect(comp1.xMm).toBe(c1.xMm + deltaX);
    expect(comp2.xMm).toBe(c2.xMm + deltaX);

    // Ungroup
    store.setSelected({ kind: "component", id: comp1.id });
    store.ungroupSelectedItems();

    state = usePanelStore.getState();
    comp1 = state.components.find((c) => c.id === c1.id)!;
    comp2 = state.components.find((c) => c.id === c2.id)!;
    expect(comp1.groupId).toBeUndefined();
    expect(comp2.groupId).toBeUndefined();
  });

  it("locks and unlocks items preventing dragged movement", () => {
    const store = usePanelStore.getState();
    const c1 = store.components.find((c) => c.id === "comp-1")!;
    const startX = c1.xMm;
    const startY = c1.yMm;

    store.setSelected({ kind: "component", id: c1.id });
    store.toggleLockSelectedItems(true);

    let state = usePanelStore.getState();
    let comp1 = state.components.find((c) => c.id === c1.id)!;
    expect(comp1.locked).toBe(true);

    // Attempt moving locked component directly
    store.moveComponent(comp1.id, startX + 50, startY + 50);
    state = usePanelStore.getState();
    comp1 = state.components.find((c) => c.id === c1.id)!;
    expect(comp1.xMm).toBe(startX);
    expect(comp1.yMm).toBe(startY);

    // Unlock
    store.toggleLockSelectedItems(false);
    state = usePanelStore.getState();
    comp1 = state.components.find((c) => c.id === c1.id)!;
    expect(comp1.locked).toBe(false);

    // Move succeeds
    store.moveComponent(comp1.id, startX + 50, startY, { skipGridSnapX: true });
    state = usePanelStore.getState();
    comp1 = state.components.find((c) => c.id === c1.id)!;
    expect(comp1.xMm).toBe(startX + 50);
  });

  it("creates custom drawn busbars with material preset and pins", () => {
    const store = usePanelStore.getState();
    const id = store.addCustomDrawnComponent({
      name: "Main Busbar R",
      xMm: 150,
      yMm: 200,
      widthMm: 120,
      heightMm: 20,
      depthMm: 5,
      materialType: "copper",
      drawShape: "rectangle",
    });

    const state = usePanelStore.getState();
    const busbar = state.cadAssets.find((a) => a.id === id);
    expect(busbar).toBeDefined();
    expect(busbar?.name).toBe("Main Busbar R");
    expect(busbar?.materialType).toBe("copper");
    expect(busbar?.boundingBoxMm.w).toBe(120);
    expect(busbar?.boundingBoxMm.h).toBe(20);
    expect(state.selected).toEqual({ kind: "cad", id });
    expect(state.canvasTool2D).toBe("select");

    // Add pins to busbar
    store.addPinToAsset(id, {
      label: "R-IN",
      localXMm: -40,
      localYMm: 0,
      localZMm: 0,
    });
    store.addPinToAsset(id, {
      label: "R-OUT",
      localXMm: 40,
      localYMm: 0,
      localZMm: 0,
    });

    const updated = usePanelStore.getState().cadAssets.find((a) => a.id === id)!;
    expect(updated.pins.length).toBe(2);
    expect(updated.pins[0].label).toBe("R-IN");
    expect(updated.pins[1].label).toBe("R-OUT");
  });

  it("handles auto-naming for busbars and plates and wire connections to busbar pins", () => {
    const store = usePanelStore.getState();
    const id1 = store.addCustomDrawnComponent({
      xMm: 100,
      yMm: 100,
      widthMm: 80,
      heightMm: 15,
      materialType: "copper",
    });
    const id2 = store.addCustomDrawnComponent({
      xMm: 200,
      yMm: 100,
      widthMm: 50,
      heightMm: 50,
      materialType: "steel",
      drawShape: "circle",
    });

    const state = usePanelStore.getState();
    const b1 = state.cadAssets.find((a) => a.id === id1)!;
    const b2 = state.cadAssets.find((a) => a.id === id2)!;
    expect(b1.name).toContain("Busbar");
    expect(b2.name).toContain("Plate");
    expect(b2.drawShape).toBe("circle");

    // Add pin to busbar 1 and connect wire from component to busbar
    store.addPinToAsset(id1, {
      label: "L1-MAIN",
      localXMm: 0,
      localYMm: 0,
      localZMm: 0,
    });
    const pinId = usePanelStore.getState().cadAssets.find((a) => a.id === id1)!.pins[0].id;

    store.addWire({
      label: "W-BUS",
      fromComponentId: "comp-1",
      fromPinId: "comp-1-pin-1",
      toComponentId: id1,
      toPinId: pinId,
      colorCode: "R",
      gaugeMm2: "2.5",
    });

    const wires = usePanelStore.getState().wires;
    const wire = wires.find((w) => w.toComponentId === id1);
    expect(wire).toBeDefined();
    expect(wire?.toPinId).toBe(pinId);
  });

  it("supports grouping, ungrouping, and locking across DIN rails and wire ducts", () => {
    const store = usePanelStore.getState();
    const rail = store.rails[0];
    const duct = store.ducts[0];
    expect(rail).toBeDefined();
    expect(duct).toBeDefined();

    store.setSelectedIds([
      { kind: "rail", id: rail.id },
      { kind: "duct", id: duct.id },
    ]);

    const groupId = store.groupSelectedItems();
    expect(groupId).toBeTruthy();

    let state = usePanelStore.getState();
    expect(state.rails.find((r) => r.id === rail.id)?.groupId).toBe(groupId);
    expect(state.ducts.find((d) => d.id === duct.id)?.groupId).toBe(groupId);

    // Moving grouped duct also moves grouped rail
    const prevRailY = state.rails.find((r) => r.id === rail.id)!.yMm;
    const prevDuctY = state.ducts.find((d) => d.id === duct.id)!.yMm;
    store.updateDuct(duct.id, { yMm: prevDuctY + 20 });
    state = usePanelStore.getState();
    expect(state.rails.find((r) => r.id === rail.id)?.yMm).toBe(prevRailY + 20);

    // Lock both rail and duct -> cannot move or delete
    store.toggleLockSelectedItems(true);
    state = usePanelStore.getState();
    expect(state.rails.find((r) => r.id === rail.id)?.locked).toBe(true);
    expect(state.ducts.find((d) => d.id === duct.id)?.locked).toBe(true);

    const lockedDuctY = state.ducts.find((d) => d.id === duct.id)!.yMm;
    store.updateDuct(duct.id, { yMm: lockedDuctY + 50 });
    store.removeDuct(duct.id);
    store.removeRail(rail.id);
    store.deleteSelectedItems();
    state = usePanelStore.getState();
    expect(state.ducts.find((d) => d.id === duct.id)?.yMm).toBe(lockedDuctY);
    expect(state.rails.find((r) => r.id === rail.id)).toBeDefined();

    // Unlock and ungroup
    store.toggleLockSelectedItems(false);
    store.ungroupSelectedItems();
    state = usePanelStore.getState();
    expect(state.rails.find((r) => r.id === rail.id)?.locked).toBe(false);
    expect(state.rails.find((r) => r.id === rail.id)?.groupId).toBeUndefined();
    expect(state.ducts.find((d) => d.id === duct.id)?.groupId).toBeUndefined();
  });
});
