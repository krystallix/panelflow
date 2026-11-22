"use client";

import { Box, Layers } from "lucide-react";
import { getBackplateDimensions } from "@/lib/template-export";
import { formatDim, fromMm, inputStepForUnit, toMm } from "@/lib/units";
import { usePanelStore } from "@/store/usePanelStore";

export function PanelSetupTab() {
  const displayUnit = usePanelStore((s) => s.displayUnit);
  const enclosure = usePanelStore((s) => s.enclosure);
  const plateConfig = usePanelStore((s) => s.plateConfig);

  const updateEnclosure = usePanelStore((s) => s.updateEnclosure);
  const updatePlateConfig = usePanelStore((s) => s.updatePlateConfig);

  const { widthMm: plateW, heightMm: plateH } = getBackplateDimensions(
    enclosure,
    plateConfig
  );
  const step = inputStepForUnit(displayUnit);

  return (
    <div className="space-y-3 text-xs">
      {/* Enclosure Dimensions */}
      <div className="rounded-xl border border-slate-200 dark:border-white/5 bg-transparent p-3 space-y-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700 dark:text-zinc-300">
          <Box className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
          <span>Enclosure Dimensions ({displayUnit})</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["Width (W)", "widthMm"],
              ["Height (H)", "heightMm"],
              ["Depth (D)", "depthMm"],
              ["Inset", "backplateInsetMm"],
            ] as const
          ).map(([label, key]) => (
            <label key={key} className="block space-y-1">
              <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                {label}
              </span>
              <input
                type="number"
                step={step}
                value={Number(fromMm(enclosure[key], displayUnit).toFixed(3))}
                onChange={(e) => {
                  const mm = toMm(
                    Number.parseFloat(e.target.value) || 0,
                    displayUnit
                  );
                  updateEnclosure({ [key]: Math.max(20, mm) });
                }}
                className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2.5 py-1.5 text-xs tabular-nums text-slate-900 dark:text-slate-100 focus:border-slate-400 dark:focus:border-white/25 focus:outline-none"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Mounting Plate */}
      <div className="rounded-xl border border-slate-200 dark:border-white/5 bg-transparent p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700 dark:text-zinc-300">
            <Layers className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
            <span>Mounting Plate</span>
          </div>
          <div className="flex rounded-lg border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => updatePlateConfig({ mode: "auto" })}
              className={`rounded-md px-2 py-0.5 transition-colors cursor-pointer ${
                plateConfig.mode === "auto"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-black font-semibold shadow-xs"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              Auto
            </button>
            <button
              type="button"
              onClick={() =>
                updatePlateConfig({
                  mode: "manual",
                  manualWidthMm:
                    plateConfig.mode === "auto"
                      ? Math.max(
                          100,
                          enclosure.widthMm - enclosure.backplateInsetMm * 2
                        )
                      : plateConfig.manualWidthMm,
                  manualHeightMm:
                    plateConfig.mode === "auto"
                      ? Math.max(
                          100,
                          enclosure.heightMm - enclosure.backplateInsetMm * 2
                        )
                      : plateConfig.manualHeightMm,
                })
              }
              className={`rounded-md px-2 py-0.5 transition-colors cursor-pointer ${
                plateConfig.mode === "manual"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-black font-semibold shadow-xs"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              Manual
            </button>
          </div>
        </div>

        {plateConfig.mode === "manual" ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                Plate W ({displayUnit})
              </span>
              <input
                type="number"
                step={step}
                value={Number(
                  fromMm(plateConfig.manualWidthMm, displayUnit).toFixed(3)
                )}
                onChange={(e) => {
                  const mm = toMm(
                    Number.parseFloat(e.target.value) || 0,
                    displayUnit
                  );
                  updatePlateConfig({ manualWidthMm: Math.max(100, mm) });
                }}
                className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2.5 py-1.5 text-xs tabular-nums text-slate-900 dark:text-slate-100 focus:border-slate-400 dark:focus:border-white/25 focus:outline-none"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                Plate H ({displayUnit})
              </span>
              <input
                type="number"
                step={step}
                value={Number(
                  fromMm(plateConfig.manualHeightMm, displayUnit).toFixed(3)
                )}
                onChange={(e) => {
                  const mm = toMm(
                    Number.parseFloat(e.target.value) || 0,
                    displayUnit
                  );
                  updatePlateConfig({ manualHeightMm: Math.max(100, mm) });
                }}
                className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2.5 py-1.5 text-xs tabular-nums text-slate-900 dark:text-slate-100 focus:border-slate-400 dark:focus:border-white/25 focus:outline-none"
              />
            </label>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] px-2.5 py-1.5 text-xs tabular-nums text-slate-700 dark:text-zinc-300">
            {formatDim(plateW, displayUnit)} × {formatDim(plateH, displayUnit)}
          </div>
        )}
      </div>

    </div>
  );
}
