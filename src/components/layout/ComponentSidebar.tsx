"use client";

import { usePanelStore } from "@/store/usePanelStore";
import { COMPONENT_LIST } from "@/lib/components-catalog";
import { formatDim } from "@/lib/units";
import type { ComponentTemplateId } from "@/types/panel";
import {
  Layers,
  Plus,
  Box,
  SplitSquareVertical,
  Minus,
  Sparkles,
  Cable,
  Upload,
} from "lucide-react";

export function ComponentSidebar({ onOpenCadUpload }: { onOpenCadUpload: () => void }) {
  const {
    displayUnit,
    addRail,
    addDuct,
    addComponent,
  } = usePanelStore();

  return (
    <aside className="w-72 border-r border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md flex flex-col h-full select-none text-xs">
      <div className="p-3 border-b border-zinc-800/80 font-semibold text-zinc-200 flex items-center justify-between">
        <span className="flex items-center gap-1.5 uppercase tracking-wider text-[11px] text-zinc-400">
          <Layers className="w-3.5 h-3.5 text-slate-600 dark:text-zinc-400" />
          Structural & Mounting
        </span>
      </div>

      <div className="p-3 space-y-2 border-b border-zinc-800/80">
        <button
          onClick={() => addRail()}
          className="w-full flex items-center justify-between px-3 py-2 rounded-md bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Minus className="w-4 h-4 text-slate-600 dark:text-zinc-400 rotate-90" />
            <span className="font-medium">Add DIN Rail 35mm</span>
          </span>
          <Plus className="w-3.5 h-3.5 text-zinc-400" />
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => addDuct("horizontal")}
            className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-md bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 transition-colors cursor-pointer"
          >
            <Cable className="w-3.5 h-3.5 text-zinc-400" />
            <span>Horiz Duct</span>
          </button>
          <button
            onClick={() => addDuct("vertical")}
            className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-md bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 transition-colors cursor-pointer"
          >
            <SplitSquareVertical className="w-3.5 h-3.5 text-zinc-400" />
            <span>Vert Duct</span>
          </button>
        </div>

        <button
          onClick={onOpenCadUpload}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-sky-950/40 hover:bg-sky-900/40 border border-sky-800/50 text-sky-300 font-medium transition-colors cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Import CAD Asset (.glb/.dxf)</span>
        </button>
      </div>

      {/* Parametric Component Catalog */}
      <div className="p-3 pb-1 border-b border-zinc-800/80 flex items-center justify-between">
        <span className="flex items-center gap-1.5 uppercase tracking-wider text-[11px] text-zinc-400 font-semibold">
          <Box className="w-3.5 h-3.5 text-slate-600 dark:text-zinc-400" />
          Component Library
        </span>
        <span className="text-[10px] text-zinc-500 font-sans">Auto-Snap</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {COMPONENT_LIST.map((comp) => (
          <div
            key={comp.id}
            className="group p-2.5 rounded-lg bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 transition-all flex flex-col gap-2"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium text-zinc-200 flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: comp.accentColor }}
                  />
                  <span>{comp.name}</span>
                </div>
                <div className="text-[11px] text-zinc-500 flex items-center gap-1.5 mt-0.5">
                  <span>{comp.category}</span>
                  <span>•</span>
                  <span className="font-sans">
                    {formatDim(comp.widthMm, displayUnit, 1)} ×{" "}
                    {formatDim(comp.heightMm, displayUnit, 1)}
                  </span>
                </div>
              </div>
              <button
                onClick={() => addComponent(comp.id as ComponentTemplateId)}
                title="Add to panel and snap to rail"
                className="p-1.5 rounded-md bg-zinc-800 group-hover:bg-sky-600 text-zinc-300 group-hover:text-white transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Pins overview */}
            <div className="flex flex-wrap gap-1">
              {comp.pins.map((pin) => (
                <span
                  key={pin.label}
                  className="px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-800/80 text-[10px] font-sans text-zinc-400"
                >
                  {pin.label}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
