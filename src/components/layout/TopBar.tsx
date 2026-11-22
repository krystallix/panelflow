"use client";

import { usePanelStore } from "@/store/usePanelStore";
import type { DoorMode, GridSnapMm, LengthUnit } from "@/types/panel";
import {
  Layers,
  Box,
  Eye,
  EyeOff,
  Maximize2,
  Grid3X3,
  Download,
  Plus,
} from "lucide-react";

export function TopBar({ onOpenExport }: { onOpenExport: () => void }) {
  const {
    displayUnit,
    setDisplayUnit,
    gridSnapMm,
    setGridSnapMm,
    enclosure,
    setDoorMode,
  } = usePanelStore();

  const units: LengthUnit[] = ["mm", "cm", "m"];
  const snaps: GridSnapMm[] = [5, 10, 25];
  const doorModes: { mode: DoorMode; label: string; icon: React.ReactNode }[] = [
    { mode: "transparent", label: "Glass Door", icon: <Eye className="w-3.5 h-3.5" /> },
    { mode: "open", label: "Open", icon: <Maximize2 className="w-3.5 h-3.5" /> },
    { mode: "hidden", label: "Hidden", icon: <EyeOff className="w-3.5 h-3.5" /> },
  ];

  return (
    <header className="h-12 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md px-4 flex items-center justify-between text-xs select-none z-20">
      {/* Brand & Project info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 font-semibold tracking-wide text-zinc-100">
          <div className="w-6 h-6 rounded bg-sky-600/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
            <Box className="w-3.5 h-3.5" />
          </div>
          <span>PanelFlow</span>
          <span className="text-[10px] font-sans px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 uppercase tracking-wider">
            CAD Phase 1
          </span>
        </div>

        <div className="h-4 w-px bg-zinc-800 mx-1" />

        <div className="text-zinc-400 flex items-center gap-1.5">
          <span className="font-sans text-zinc-300">
            {enclosure.widthMm} × {enclosure.heightMm} × {enclosure.depthMm} mm
          </span>
        </div>
      </div>

      {/* Middle controls: Unit Switcher & Grid Snapping */}
      <div className="flex items-center gap-4">
        {/* Unit Engine */}
        <div className="flex items-center gap-1.5 bg-zinc-900/80 border border-zinc-800 rounded-md p-0.5">
          <span className="text-[11px] text-zinc-500 px-2 font-sans uppercase">Unit</span>
          {units.map((u) => (
            <button
              key={u}
              onClick={() => setDisplayUnit(u)}
              className={`px-2.5 py-1 rounded text-[11px] font-sans transition-colors ${
                displayUnit === u
                  ? "bg-sky-500 text-white font-medium shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {u}
            </button>
          ))}
        </div>

        {/* Snap Grid */}
        <div className="flex items-center gap-1 bg-zinc-900/80 border border-zinc-800 rounded-md p-0.5">
          <span className="text-[11px] text-zinc-500 px-2 flex items-center gap-1 font-sans">
            <Grid3X3 className="w-3 h-3" /> Snap
          </span>
          {snaps.map((s) => (
            <button
              key={s}
              onClick={() => setGridSnapMm(s)}
              className={`px-2 py-1 rounded text-[11px] font-sans transition-colors ${
                gridSnapMm === s
                  ? "bg-zinc-700 text-zinc-100 font-medium"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {s}mm
            </button>
          ))}
        </div>

        {/* Door Mode */}
        <div className="flex items-center gap-1 bg-zinc-900/80 border border-zinc-800 rounded-md p-0.5">
          <span className="text-[11px] text-zinc-500 px-2 font-sans">Door</span>
          {doorModes.map(({ mode, label, icon }) => (
            <button
              key={mode}
              onClick={() => setDoorMode(mode)}
              title={label}
              className={`px-2 py-1 rounded text-[11px] flex items-center gap-1 transition-colors ${
                enclosure.doorMode === mode
                  ? "bg-zinc-700 text-zinc-100 font-medium"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {icon}
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Right actions: Export 2D template */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenExport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs shadow-xs transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export 2D Template</span>
        </button>
      </div>
    </header>
  );
}
