"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignStartVertical,
  ArrowRightLeft,
  ChevronRight,
  Copy,
  Focus,
  Layers,
  Lock,
  Magnet,
  Maximize2,
  Network,
  Plus,
  RotateCw,
  Sliders,
  Trash2,
  Unlock,
  Users,
} from "lucide-react";
import { usePanelStore } from "@/store/usePanelStore";
import type { GridSnapMm, WireColorCode } from "@/types/panel";
import { saveCustomCadToLibrary, updateCustomCadCloudId } from "@/lib/indexed-db";

export type ContextMenuTarget =
  | { kind: "component"; id: string }
  | { kind: "cad"; id: string }
  | { kind: "rail"; id: string }
  | { kind: "duct"; id: string }
  | { kind: "wire"; id: string }
  | { kind: "multi" }
  | { kind: "canvas"; worldPos: { xMm: number; yMm: number } };

export interface ContextMenuState {
  x: number; // Client viewport X (px)
  y: number; // Client viewport Y (px)
  target: ContextMenuTarget;
}

interface ContextMenuProps {
  menu: ContextMenuState | null;
  onClose: () => void;
  onFitToScreen?: () => void;
}

const WIRE_COLORS: { code: WireColorCode; label: string; hex: string }[] = [
  { code: "R", label: "R (L1 - Red)", hex: "#dc2626" },
  { code: "S", label: "S (L2 - Yellow)", hex: "#eab308" },
  { code: "T", label: "T (L3 - Blue)", hex: "#2563eb" },
  { code: "N", label: "N (Neutral - Cyan)", hex: "#0284c7" },
  { code: "PE", label: "PE (Earth - Green)", hex: "#16a34a" },
  { code: "DC+", label: "+24V (Red)", hex: "#ef4444" },
  { code: "DC-", label: "0V GND (Dark)", hex: "#1e293b" },
];

const WIRE_GAUGES = ["0.75", "1.0", "1.5", "2.5", "4.0", "6.0", "10.0", "16.0"];

export function ContextMenu({ menu, onClose, onFitToScreen }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);

  // Store actions
  const rails = usePanelStore((s) => s.rails);
  const ducts = usePanelStore((s) => s.ducts);
  const components = usePanelStore((s) => s.components);
  const cadAssets = usePanelStore((s) => s.cadAssets);
  const wires = usePanelStore((s) => s.wires);
  const gridSnapMm = usePanelStore((s) => s.gridSnapMm);

  const rotateComponent = usePanelStore((s) => s.rotateComponent);
  const duplicateComponent = usePanelStore((s) => s.duplicateComponent);
  const snapComponentToRail = usePanelStore((s) => s.snapComponentToRail);
  const removeComponent = usePanelStore((s) => s.removeComponent);

  const rotateCadAsset = usePanelStore((s) => s.rotateCadAsset);
  const duplicateCadAsset = usePanelStore((s) => s.duplicateCadAsset);
  const removeCadAsset = usePanelStore((s) => s.removeCadAsset);

  const duplicateRail = usePanelStore((s) => s.duplicateRail);
  const removeRail = usePanelStore((s) => s.removeRail);
  const alignComponentsOnRail = usePanelStore((s) => s.alignComponentsOnRail);
  const alignItemToPlate = usePanelStore((s) => s.alignItemToPlate);
  const alignComponentToRail = usePanelStore((s) => s.alignComponentToRail);
  const autoResizeToFit = usePanelStore((s) => s.autoResizeToFit);
  const autoResizeSelectedToFit = usePanelStore((s) => s.autoResizeSelectedToFit);

  const duplicateDuct = usePanelStore((s) => s.duplicateDuct);
  const removeDuct = usePanelStore((s) => s.removeDuct);

  const updateWire = usePanelStore((s) => s.updateWire);
  const removeWire = usePanelStore((s) => s.removeWire);
  const autoRouteWire = usePanelStore((s) => s.autoRouteWire);
  const autoRouteAllWires = usePanelStore((s) => s.autoRouteAllWires);

  const addRail = usePanelStore((s) => s.addRail);
  const addDuct = usePanelStore((s) => s.addDuct);
  const addComponent = usePanelStore((s) => s.addComponent);
  const setGridSnapMm = usePanelStore((s) => s.setGridSnapMm);
  const setSelected = usePanelStore((s) => s.setSelected);
  const selectedIds = usePanelStore((s) => s.selectedIds);
  const deleteSelectedItems = usePanelStore((s) => s.deleteSelectedItems);
  const alignSelectedItems = usePanelStore((s) => s.alignSelectedItems);
  const requestInspectorFocus = usePanelStore((s) => s.requestInspectorFocus);
  const clipboardItems = usePanelStore((s) => s.clipboardItems);
  const copySelectedToClipboard = usePanelStore((s) => s.copySelectedToClipboard);
  const pasteFromClipboard = usePanelStore((s) => s.pasteFromClipboard);
  const groupSelectedItems = usePanelStore((s) => s.groupSelectedItems);
  const ungroupSelectedItems = usePanelStore((s) => s.ungroupSelectedItems);
  const renameGroup = usePanelStore((s) => s.renameGroup);
  const toggleLockSelectedItems = usePanelStore((s) => s.toggleLockSelectedItems);

  // Position clamping & auto-fit into viewport
  useLayoutEffect(() => {
    if (!menu) return;
    const padding = 8;
    const menuEl = menuRef.current;
    const width = menuEl ? menuEl.offsetWidth : 240;
    const height = menuEl ? menuEl.offsetHeight : 280;

    let nextX = menu.x;
    let nextY = menu.y;

    if (nextX + width > window.innerWidth - padding) {
      nextX = Math.max(padding, window.innerWidth - width - padding);
    }
    if (nextY + height > window.innerHeight - padding) {
      nextY = Math.max(padding, window.innerHeight - height - padding);
    }

    setAdjustedPos({ x: nextX, y: nextY });
    setOpenSubmenu(null);
  }, [menu]);

  // Click outside, scroll, resize, escape handlers
  useEffect(() => {
    if (!menu) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    const handleScrollOrResize = () => {
      onClose();
    };

    window.addEventListener("mousedown", handlePointerDown, true);
    window.addEventListener("touchstart", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown, true);
      window.removeEventListener("touchstart", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  const { target } = menu;

  const currentComp =
    target.kind === "component"
      ? components.find((c) => c.id === target.id)
      : null;
  const currentCad =
    target.kind === "cad" ? cadAssets.find((a) => a.id === target.id) : null;
  const currentRail =
    target.kind === "rail" ? rails.find((r) => r.id === target.id) : null;
  const currentDuct =
    target.kind === "duct" ? ducts.find((d) => d.id === target.id) : null;
  const currentWire =
    target.kind === "wire" ? wires.find((w) => w.id === target.id) : null;

  const flipSubmenuLeft =
    typeof window !== "undefined" && adjustedPos.x + 410 > window.innerWidth;
  const submenuPosClass = flipSubmenuLeft
    ? "right-full mr-1"
    : "left-full ml-1";

  const menuPanelClass =
    "fixed z-50 min-w-[210px] rounded-xl border border-[#e2e8f0] dark:border-white/10 bg-white/98 dark:bg-[#111318]/98 p-1.5 font-sans text-xs text-[#0f172a] dark:text-slate-200 shadow-xl dark:shadow-2xl backdrop-blur-xl select-none animate-in fade-in-50 zoom-in-95 duration-100";
  const submenuPanelBase =
    "rounded-lg border border-[#e2e8f0] dark:border-slate-700/80 bg-white/98 dark:bg-[#12161f]/98 p-1 shadow-xl dark:shadow-2xl backdrop-blur-md";
  const menuHeaderClass =
    "border-b border-[#e2e8f0] dark:border-slate-800/80 px-2.5 py-1.5 font-sans text-[10px] text-[#64748b] dark:text-slate-400";
  const menuItemClass =
    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white";
  const menuDangerClass =
    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300";

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="CAD Context Menu"
      style={{
        left: `${adjustedPos.x}px`,
        top: `${adjustedPos.y}px`,
      }}
      className={menuPanelClass}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* COMPONENT TARGET */}
      {target.kind === "component" && currentComp && (
        <>
          <div className="border-b border-[#e2e8f0] dark:border-slate-800/80 px-2.5 py-1.5 font-sans text-[10px] text-[#64748b] dark:text-slate-400">
            <div className="font-semibold text-slate-900 dark:text-white truncate max-w-[220px]">
              {currentComp.name}
            </div>
          </div>

          <div className="py-1">
            <button
              type="button"
              onClick={() => {
                rotateComponent(currentComp.id, 90);
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
            >
              <RotateCw className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
              <span>Rotate 90°</span>
              <span className="ml-auto font-sans text-[9px] text-slate-500">R</span>
            </button>

            <button
              type="button"
              onClick={() => {
                copySelectedToClipboard();
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
            >
              <Copy className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
              <span>Copy</span>
              <span className="ml-auto font-sans text-[9px] text-slate-500">Ctrl+C</span>
            </button>

            {clipboardItems.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  pasteFromClipboard();
                  onClose();
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
              >
                <Copy className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                <span>Paste</span>
                <span className="ml-auto font-sans text-[9px] text-slate-500">Ctrl+V</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                toggleLockSelectedItems();
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
            >
              {currentComp.locked ? (
                <>
                  <Unlock className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                  <span>Unlock Position</span>
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                  <span>Lock Position</span>
                </>
              )}
            </button>

            {currentComp.groupId && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const next = window.prompt("Rename Group:", currentComp.groupName || currentComp.groupId);
                    if (next !== null) {
                      renameGroup(currentComp.groupId!, next);
                    }
                    onClose();
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                >
                  <Users className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                  <span>Rename Group</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    ungroupSelectedItems();
                    onClose();
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                >
                  <Layers className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                  <span>Ungroup (Ctrl+Shift+G)</span>
                  <span className="ml-auto font-sans text-[9px] text-slate-500">Ctrl+Shift+G</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                duplicateComponent(currentComp.id, { x: 20, y: 0 });
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
            >
              <Copy className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
              <span>Duplicate</span>
              <span className="ml-auto font-sans text-[9px] text-slate-500">+20mm</span>
            </button>

            <button
              type="button"
              onClick={() => {
                snapComponentToRail(currentComp.id);
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
            >
              <Magnet className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
              <span>Snap to DIN Rail</span>
            </button>

            {/* Align Component (to Rail if mounted on rail, or to Mounting Plate) */}
            <div
              className="relative"
              onMouseEnter={() => setOpenSubmenu("comp-align")}
              onMouseLeave={() => setOpenSubmenu(null)}
            >
              <button
                type="button"
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
              >
                <span className="flex items-center gap-2">
                  <ArrowRightLeft className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                  {currentComp.railId ? "Align to Rail" : "Align to Plate"}
                </span>
                <ChevronRight className="h-3 w-3 text-slate-500" />
              </button>

              {openSubmenu === "comp-align" && (
                <div className={`absolute top-0 ${submenuPosClass} w-40 rounded-lg border border-[#e2e8f0] dark:border-slate-700/80 bg-white/98 dark:bg-[#12161f]/98 p-1 shadow-xl dark:shadow-2xl backdrop-blur-md`}>
                  {currentComp.railId ? (
                    <>
                      {(["left", "center", "right"] as const).map((edge) => (
                        <button
                          key={edge}
                          type="button"
                          onClick={() => {
                            alignComponentToRail(currentComp.id, edge);
                            onClose();
                          }}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left capitalize text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                        >
                          {edge === "left" && <AlignLeft className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />}
                          {edge === "center" && <AlignCenter className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />}
                          {edge === "right" && <AlignRight className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />}
                          <span>Align {edge}</span>
                        </button>
                      ))}
                    </>
                  ) : (
                    <>
                      {(["top", "bottom", "left", "right"] as const).map((edge) => (
                        <button
                          key={edge}
                          type="button"
                          onClick={() => {
                            alignItemToPlate({ kind: "component", id: currentComp.id }, edge);
                            onClose();
                          }}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left capitalize text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                        >
                          <AlignJustify className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                          <span>Align {edge}</span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setSelected({ kind: "component", id: currentComp.id });
                requestInspectorFocus();
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
            >
              <Sliders className="h-3.5 w-3.5 text-slate-400" />
              <span>Edit Tag / Properties</span>
            </button>
          </div>

          <div className="border-t border-[#e2e8f0] dark:border-slate-800/80 pt-1">
            <button
              type="button"
              onClick={() => {
                removeComponent(currentComp.id);
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete Component</span>
            </button>
          </div>
        </>
      )}

      {/* CAD ASSET TARGET */}
      {target.kind === "cad" && currentCad && (
        <>
          <div className="border-b border-[#e2e8f0] dark:border-slate-800/80 px-2.5 py-1.5 font-sans text-[10px] text-[#64748b] dark:text-slate-400">
            <div className="font-semibold text-slate-900 dark:text-white truncate max-w-[220px]">
              {currentCad.name}
            </div>
          </div>

          <div className="py-1">
            <button
              type="button"
              onClick={() => {
                rotateCadAsset(currentCad.id, 90);
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
            >
              <RotateCw className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
              <span>Rotate 90°</span>
            </button>

            <button
              type="button"
              onClick={() => {
                copySelectedToClipboard();
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
            >
              <Copy className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
              <span>Copy</span>
              <span className="ml-auto font-sans text-[9px] text-slate-500">Ctrl+C</span>
            </button>

            {clipboardItems.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  pasteFromClipboard();
                  onClose();
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
              >
                <Copy className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                <span>Paste</span>
                <span className="ml-auto font-sans text-[9px] text-slate-500">Ctrl+V</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                toggleLockSelectedItems();
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
            >
              {currentCad.locked ? (
                <>
                  <Unlock className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                  <span>Unlock Position</span>
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                  <span>Lock Position</span>
                </>
              )}
            </button>

            {currentCad.groupId && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const next = window.prompt("Rename Group:", currentCad.groupName || currentCad.groupId);
                    if (next !== null) {
                      renameGroup(currentCad.groupId!, next);
                    }
                    onClose();
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                >
                  <Users className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                  <span>Rename Group</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    ungroupSelectedItems();
                    onClose();
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                >
                  <Layers className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                  <span>Ungroup (Ctrl+Shift+G)</span>
                  <span className="ml-auto font-sans text-[9px] text-slate-500">Ctrl+Shift+G</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                duplicateCadAsset(currentCad.id, { x: 20, y: 0 });
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
            >
              <Copy className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
              <span>Duplicate</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                try {
                  const saved = await saveCustomCadToLibrary(currentCad);
                  fetch("/api/custom-parts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name: currentCad.name,
                      format: currentCad.format,
                      bounding_box: currentCad.cropMm
                        ? { ...currentCad.boundingBoxMm, cropMm: currentCad.cropMm, materialType: currentCad.materialType, drawShape: currentCad.drawShape }
                        : { ...currentCad.boundingBoxMm, materialType: currentCad.materialType, drawShape: currentCad.drawShape },
                      pins: currentCad.pins,
                      cad_data: currentCad.rawText || currentCad.dataUrl || null,
                    }),
                  })
                    .then((res) => (res.ok ? res.json() : null))
                    .then((data) => {
                      const cloudId = data?.part?.id;
                      if (typeof cloudId === "string" && cloudId) {
                        updateCustomCadCloudId(saved.id, cloudId).catch(() => {});
                      }
                    })
                    .catch(() => {});
                } catch {
                  // ignore
                }
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
            >
              <Plus className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
              <span>Save to My CAD Library</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelected({ kind: "cad", id: currentCad.id });
                requestInspectorFocus();
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
            >
              <Sliders className="h-3.5 w-3.5 text-slate-400" />
              <span>Edit CAD Properties</span>
            </button>
          </div>

          <div className="border-t border-[#e2e8f0] dark:border-slate-800/80 pt-1">
            <button
              type="button"
              onClick={() => {
                removeCadAsset(currentCad.id);
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete CAD Asset</span>
            </button>
          </div>
        </>
      )}

      {/* DIN RAIL TARGET */}
      {target.kind === "rail" && currentRail && (
        <>
          <div className="border-b border-[#e2e8f0] dark:border-slate-800/80 px-2.5 py-1.5 font-sans text-[10px] text-[#64748b] dark:text-slate-400">
            <div className="font-semibold text-slate-900 dark:text-white truncate max-w-[220px]">
              {currentRail.name}
            </div>
          </div>

          <div className="py-1">
            <button
              type="button"
              onClick={() => {
                duplicateRail(currentRail.id, { x: 0, y: -120 });
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
            >
              <Copy className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
              <span>Duplicate Parallel</span>
              <span className="ml-auto font-sans text-[9px] text-slate-500">-120mm</span>
            </button>

            {/* Align Components Submenu */}
            <div
              className="relative"
              onMouseEnter={() => setOpenSubmenu("align")}
              onMouseLeave={() => setOpenSubmenu(null)}
            >
              <button
                type="button"
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
              >
                <span className="flex items-center gap-2">
                  <ArrowRightLeft className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                  Align Components
                </span>
                <ChevronRight className="h-3 w-3 text-slate-500" />
              </button>

              {openSubmenu === "align" && (
                <div className={`absolute top-0 ${submenuPosClass} w-44 rounded-lg border border-[#e2e8f0] dark:border-slate-700/80 bg-white/98 dark:bg-[#12161f]/98 p-1 shadow-xl dark:shadow-2xl backdrop-blur-md`}>
                  <button
                    type="button"
                    onClick={() => {
                      alignComponentsOnRail(currentRail.id, "distribute");
                      onClose();
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                  >
                    <AlignJustify className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                    <span>Distribute Evenly</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      alignComponentsOnRail(currentRail.id, "left");
                      onClose();
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                  >
                    <AlignLeft className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                    <span>Align Left</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      alignComponentsOnRail(currentRail.id, "center");
                      onClose();
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                  >
                    <AlignCenter className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                    <span>Align Center</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      alignComponentsOnRail(currentRail.id, "right");
                      onClose();
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                  >
                    <AlignRight className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                    <span>Align Right</span>
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                autoResizeToFit({ kind: "rail", id: currentRail.id });
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
            >
              <Maximize2 className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
              <span>Auto-Resize to Width</span>
            </button>

            <div
              className="relative"
              onMouseEnter={() => setOpenSubmenu("rail-plate-align")}
              onMouseLeave={() => setOpenSubmenu(null)}
            >
              <button
                type="button"
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
              >
                <span className="flex items-center gap-2">
                  <ArrowRightLeft className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                  Align to Plate
                </span>
                <ChevronRight className="h-3 w-3 text-slate-500" />
              </button>

              {openSubmenu === "rail-plate-align" && (
                <div className={`absolute top-0 ${submenuPosClass} w-40 rounded-lg border border-[#e2e8f0] dark:border-slate-700/80 bg-white/98 dark:bg-[#12161f]/98 p-1 shadow-xl dark:shadow-2xl backdrop-blur-md`}>
                  {(["top", "bottom", "left", "right"] as const).map((edge) => (
                    <button
                      key={edge}
                      type="button"
                      onClick={() => {
                        alignItemToPlate({ kind: "rail", id: currentRail.id }, edge);
                        onClose();
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left capitalize text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                    >
                      <AlignJustify className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                      <span>Align {edge}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-[#e2e8f0] dark:border-slate-800/80 pt-1">
            <button
              type="button"
              onClick={() => {
                removeRail(currentRail.id);
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete DIN Rail</span>
            </button>
          </div>
        </>
      )}

      {/* WIRE DUCT TARGET */}
      {target.kind === "duct" && currentDuct && (
        <>
          <div className="border-b border-[#e2e8f0] dark:border-slate-800/80 px-2.5 py-1.5 font-sans text-[10px] text-[#64748b] dark:text-slate-400">
            <div className="font-semibold text-slate-900 dark:text-white truncate max-w-[220px]">
              {currentDuct.name}
            </div>
          </div>

          <div className="py-1">
            <button
              type="button"
              onClick={() => {
                duplicateDuct(currentDuct.id);
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
            >
              <Copy className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
              <span>Duplicate Parallel</span>
              <span className="ml-auto font-sans text-[9px] text-slate-500">
                {currentDuct.orientation === "vertical" ? "+80mm" : "-120mm"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                autoResizeToFit({ kind: "duct", id: currentDuct.id });
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
            >
              <Maximize2 className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
              <span>
                {currentDuct.orientation === "horizontal"
                  ? "Auto-Resize to Width"
                  : "Auto-Resize to Height"}
              </span>
            </button>

            <div
              className="relative"
              onMouseEnter={() => setOpenSubmenu("duct-plate-align")}
              onMouseLeave={() => setOpenSubmenu(null)}
            >
              <button
                type="button"
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
              >
                <span className="flex items-center gap-2">
                  <ArrowRightLeft className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                  Align to Plate
                </span>
                <ChevronRight className="h-3 w-3 text-slate-500" />
              </button>

              {openSubmenu === "duct-plate-align" && (
                <div className={`absolute top-0 ${submenuPosClass} w-40 rounded-lg border border-[#e2e8f0] dark:border-slate-700/80 bg-white/98 dark:bg-[#12161f]/98 p-1 shadow-xl dark:shadow-2xl backdrop-blur-md`}>
                  {(["top", "bottom", "left", "right"] as const).map((edge) => (
                    <button
                      key={edge}
                      type="button"
                      onClick={() => {
                        alignItemToPlate({ kind: "duct", id: currentDuct.id }, edge);
                        onClose();
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left capitalize text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                    >
                      <AlignJustify className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                      <span>Align {edge}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-[#e2e8f0] dark:border-slate-800/80 pt-1">
            <button
              type="button"
              onClick={() => {
                removeDuct(currentDuct.id);
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete Wire Duct</span>
            </button>
          </div>
        </>
      )}

      {/* WIRE CONNECTION TARGET */}
      {target.kind === "wire" && currentWire && (
        <>
          <div className="border-b border-[#e2e8f0] dark:border-slate-800/80 px-2.5 py-1.5 font-sans text-[10px] text-[#64748b] dark:text-slate-400">
            <div className="font-semibold text-slate-900 dark:text-white truncate max-w-[220px]">
              Wire {currentWire.label} ({currentWire.colorCode})
            </div>
          </div>

          <div className="py-1">
            {/* Color Submenu */}
            <div
              className="relative"
              onMouseEnter={() => setOpenSubmenu("color")}
              onMouseLeave={() => setOpenSubmenu(null)}
            >
              <button
                type="button"
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
              >
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full border border-slate-600"
                    style={{
                      backgroundColor:
                        WIRE_COLORS.find((c) => c.code === currentWire.colorCode)?.hex ||
                        "#2563eb",
                    }}
                  />
                  <span>Change Wire Color</span>
                </span>
                <ChevronRight className="h-3 w-3 text-slate-500" />
              </button>

              {openSubmenu === "color" && (
                <div className={`absolute top-0 ${submenuPosClass} w-48 rounded-lg border border-[#e2e8f0] dark:border-slate-700/80 bg-white/98 dark:bg-[#12161f]/98 p-1 shadow-xl dark:shadow-2xl backdrop-blur-md`}>
                  {WIRE_COLORS.map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => {
                        updateWire(currentWire.id, { colorCode: c.code });
                        onClose();
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                    >
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: c.hex }}
                      />
                      <span>{c.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Gauge Submenu */}
            <div
              className="relative"
              onMouseEnter={() => setOpenSubmenu("gauge")}
              onMouseLeave={() => setOpenSubmenu(null)}
            >
              <button
                type="button"
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
              >
                <span className="flex items-center gap-2">
                  <Sliders className="h-3.5 w-3.5 text-slate-400" />
                  <span>Cross-Section (mm²)</span>
                </span>
                <ChevronRight className="h-3 w-3 text-slate-500" />
              </button>

              {openSubmenu === "gauge" && (
                <div className={`absolute top-0 ${submenuPosClass} w-36 rounded-lg border border-[#e2e8f0] dark:border-slate-700/80 bg-white/98 dark:bg-[#12161f]/98 p-1 shadow-xl dark:shadow-2xl backdrop-blur-md`}>
                  {WIRE_GAUGES.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => {
                        updateWire(currentWire.id, { gaugeMm2: g });
                        onClose();
                      }}
                      className={`flex w-full items-center justify-between rounded px-2 py-1 text-left font-sans text-[11px] ${
                        currentWire.gaugeMm2 === g
                          ? "bg-slate-900 text-white dark:bg-white dark:text-black font-semibold"
                          : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      <span>{g} mm²</span>
                      {currentWire.gaugeMm2 === g && <span>✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Auto-Route via Duct */}
            <button
              type="button"
              onClick={() => {
                autoRouteWire(currentWire.id);
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
            >
              <Network className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
              <span>Auto-Route via Duct</span>
            </button>
          </div>

          <div className="border-t border-[#e2e8f0] dark:border-slate-800/80 pt-1">
            <button
              type="button"
              onClick={() => {
                removeWire(currentWire.id);
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete Wire</span>
            </button>
          </div>
        </>
      )}

      {/* MULTI-SELECT TARGET */}
      {target.kind === "multi" && (() => {
        const orientations = selectedIds.map((sel) => {
          if (sel.kind === "rail") return "horizontal";
          if (sel.kind === "duct") {
            return ducts.find((d) => d.id === sel.id)?.orientation ?? null;
          }
          return null;
        });
        const hasResizable = selectedIds.some(
          (sel) => sel.kind === "rail" || sel.kind === "duct"
        );
        const allHorizontal =
          selectedIds.length > 0 && orientations.every((o) => o === "horizontal");
        const allVertical =
          selectedIds.length > 0 && orientations.every((o) => o === "vertical");
        const canAutoResize = allHorizontal || allVertical;

        return (
          <>
          <div className="border-b border-[#e2e8f0] dark:border-slate-800/80 px-2.5 py-1.5 font-sans text-[10px] text-[#64748b] dark:text-slate-400">
            <div className="font-semibold text-slate-900 dark:text-white">
              {selectedIds.length} ITEMS SELECTED
            </div>
          </div>

          <div className="py-1">
            {hasResizable && (
              <button
                type="button"
                disabled={!canAutoResize}
                title={
                  !canAutoResize
                    ? "Requires all selected items to have the same orientation"
                    : undefined
                }
                onClick={() => {
                  autoResizeSelectedToFit();
                  onClose();
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white disabled:opacity-40 disabled:pointer-events-none"
              >
                <Maximize2 className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                <span>
                  {allVertical ? "Auto-Resize to Height" : "Auto-Resize to Width"}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                copySelectedToClipboard();
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
            >
              <Copy className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
              <span>Copy Selected</span>
              <span className="ml-auto font-sans text-[9px] text-slate-500">Ctrl+C</span>
            </button>

            {clipboardItems.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  pasteFromClipboard();
                  onClose();
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
              >
                <Copy className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                <span>Paste</span>
                <span className="ml-auto font-sans text-[9px] text-slate-500">Ctrl+V</span>
              </button>
            )}

            <button
              type="button"
              disabled={selectedIds.length < 2}
              onClick={() => {
                groupSelectedItems();
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white disabled:opacity-40"
            >
              <Users className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
              <span>Group (Ctrl+G)</span>
              <span className="ml-auto font-sans text-[9px] text-slate-500">Ctrl+G</span>
            </button>

            <button
              type="button"
              onClick={() => {
                ungroupSelectedItems();
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
            >
              <Layers className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
              <span>Ungroup (Ctrl+Shift+G)</span>
              <span className="ml-auto font-sans text-[9px] text-slate-500">Ctrl+Shift+G</span>
            </button>

            <button
              type="button"
              onClick={() => {
                toggleLockSelectedItems();
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
            >
              <Lock className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
              <span>Lock / Unlock Position</span>
            </button>

            <div
              className="relative"
              onMouseEnter={() => setOpenSubmenu("align-multi")}
              onMouseLeave={() => setOpenSubmenu(null)}
            >
              <button
                type="button"
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
              >
                <span className="flex items-center gap-2">
                  <AlignLeft className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                  <span>Align Selected</span>
                </span>
                <ChevronRight className="h-3 w-3 text-slate-500" />
              </button>

              {openSubmenu === "align-multi" && (
                <div className={`absolute top-0 ${submenuPosClass} w-44 rounded-lg border border-[#e2e8f0] dark:border-slate-700/80 bg-white/98 dark:bg-[#12161f]/98 p-1 shadow-xl dark:shadow-2xl backdrop-blur-md`}>
                  <button
                    type="button"
                    onClick={() => {
                      alignSelectedItems("left");
                      onClose();
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                  >
                    <AlignLeft className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                    <span>Rata Kiri (Align Left)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      alignSelectedItems("center");
                      onClose();
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                  >
                    <AlignCenter className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                    <span>Rata Tengah (Center)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      alignSelectedItems("top");
                      onClose();
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                  >
                    <AlignStartVertical className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                    <span>Rata Atas (Align Top)</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-[#e2e8f0] dark:border-slate-800/80 pt-1">
            <button
              type="button"
              onClick={() => {
                deleteSelectedItems();
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete Selected ({selectedIds.length})</span>
            </button>
          </div>
          </>
        );
      })()}

      {/* EMPTY CANVAS AREA TARGET */}
      {target.kind === "canvas" && (
        <>
          <div className="border-b border-[#e2e8f0] dark:border-slate-800/80 px-2.5 py-1.5 font-sans text-[10px] text-[#64748b] dark:text-slate-400">
            <div className="font-semibold text-slate-900 dark:text-white">CANVAS WORKSPACE</div>
          </div>

          <div className="py-1">
            {clipboardItems.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  pasteFromClipboard();
                  onClose();
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
              >
                <Copy className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                <span>Paste (Ctrl+V)</span>
                <span className="ml-auto font-sans text-[9px] text-slate-500">
                  {clipboardItems.length} items
                </span>
              </button>
            )}

            {/* Quick Add Submenu */}
            <div
              className="relative"
              onMouseEnter={() => setOpenSubmenu("quickadd")}
              onMouseLeave={() => setOpenSubmenu(null)}
            >
              <button
                type="button"
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
              >
                <span className="flex items-center gap-2">
                  <Plus className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                  <span>Quick Add Here</span>
                </span>
                <ChevronRight className="h-3 w-3 text-slate-500" />
              </button>

              {openSubmenu === "quickadd" && (
                <div className={`absolute top-0 ${submenuPosClass} w-48 rounded-lg border border-[#e2e8f0] dark:border-slate-700/80 bg-white/98 dark:bg-[#12161f]/98 p-1 shadow-xl dark:shadow-2xl backdrop-blur-md`}>
                  <button
                    type="button"
                    onClick={() => {
                      addRail(target.worldPos);
                      onClose();
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                  >
                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                    <span>DIN Rail 35mm</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      addDuct("horizontal", target.worldPos);
                      onClose();
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                  >
                    <span className="h-2 w-2 rounded-full bg-slate-400" />
                    <span>Wire Duct (H)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      addDuct("vertical", target.worldPos);
                      onClose();
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                  >
                    <span className="h-2 w-2 rounded-full bg-slate-400" />
                    <span>Wire Duct (V)</span>
                  </button>
                  <div className="my-1 border-t border-slate-800" />
                  <button
                    type="button"
                    onClick={() => {
                      addComponent("mcb-1p", undefined, target.worldPos);
                      onClose();
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                  >
                    <span className="h-2 w-2 rounded-full bg-sky-500" />
                    <span>MCB 1P</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      addComponent("mcb-3p", undefined, target.worldPos);
                      onClose();
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                  >
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    <span>MCB 3P</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      addComponent("contactor", undefined, target.worldPos);
                      onClose();
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                  >
                    <span className="h-2 w-2 rounded-full bg-cyan-400" />
                    <span>Contactor KM1</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      addComponent("terminal-block", undefined, target.worldPos);
                      onClose();
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                  >
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span>Terminal Block</span>
                  </button>
                </div>
              )}
            </div>

            {/* Fit to screen */}
            {onFitToScreen && (
              <button
                type="button"
                onClick={() => {
                  onFitToScreen();
                  onClose();
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
              >
                <Maximize2 className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                <span>Fit to Screen / Reset View</span>
              </button>
            )}

            {/* Auto-Route All Wires */}
            <button
              type="button"
              disabled={wires.length === 0}
              onClick={() => {
                autoRouteAllWires();
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white disabled:opacity-40"
            >
              <Network className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
              <span>Auto-Route All Wires</span>
            </button>

            {/* Switch Grid Snap Submenu */}
            <div
              className="relative"
              onMouseEnter={() => setOpenSubmenu("snap")}
              onMouseLeave={() => setOpenSubmenu(null)}
            >
              <button
                type="button"
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
              >
                <span className="flex items-center gap-2">
                  <Sliders className="h-3.5 w-3.5 text-slate-400" />
                  <span>Grid Snap ({gridSnapMm}mm)</span>
                </span>
                <ChevronRight className="h-3 w-3 text-slate-500" />
              </button>

              {openSubmenu === "snap" && (
                <div className={`absolute top-0 ${submenuPosClass} w-32 rounded-lg border border-[#e2e8f0] dark:border-slate-700/80 bg-white/98 dark:bg-[#12161f]/98 p-1 shadow-xl dark:shadow-2xl backdrop-blur-md`}>
                  {([1, 5, 10, 25] as GridSnapMm[]).map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => {
                        setGridSnapMm(val);
                        onClose();
                      }}
                      className={`flex w-full items-center justify-between rounded px-2 py-1 text-left font-sans text-[11px] ${
                        gridSnapMm === val
                          ? "bg-slate-900 text-white dark:bg-white dark:text-black font-semibold"
                          : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      <span>{val} mm</span>
                      {gridSnapMm === val && <span>✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-[#e2e8f0] dark:border-slate-800/80 pt-1">
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              <Focus className="h-3.5 w-3.5" />
              <span>Clear Selection</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
