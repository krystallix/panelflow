"use client";

import { useMemo, useState } from "react";
import {
  Cable,
  Download,
  FileSpreadsheet,
  Printer,
} from "lucide-react";
import {
  generateBomCsv,
  generateBomReport,
  generateWireListCsv,
  type BomReportData,
  type BomReportScope,
} from "@/lib/bom-report";
import { usePanelStore } from "@/store/usePanelStore";

function triggerDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function printBomPdf(
  report: BomReportData,
  scope: BomReportScope,
  activeSheetName: string
) {
  const win = window.open("", "_blank");
  if (!win) return;

  const bomRowsHtml = report.components
    .map(
      (c) => `
      <tr>
        <td><strong>${c.tags.join(", ")}</strong></td>
        <td>${c.componentName}</td>
        <td>${c.category}</td>
        <td>${c.widthMm} × ${c.heightMm} × ${c.depthMm} mm</td>
        <td>${c.mountingType}</td>
        <td style="text-align:center;">${c.quantity}</td>
      </tr>`
    )
    .join("");

  const dinRailHtml = report.dinRails
    .map(
      (r) => `
      <tr>
        <td>DIN35</td>
        <td>${r.name}</td>
        <td>Infrastructure</td>
        <td>${r.lengthMm} mm</td>
        <td>Screw Mount</td>
        <td style="text-align:center;">${r.quantity} (${r.totalLengthMm} mm)</td>
      </tr>`
    )
    .join("");

  const ductHtml = report.wireDucts
    .map(
      (d) => `
      <tr>
        <td>DUCT</td>
        <td>${d.profileLabel}</td>
        <td>Infrastructure</td>
        <td>${d.crossSectionWidthMm} × ${d.depthMm} mm</td>
        <td>Slotted PVC</td>
        <td style="text-align:center;">${d.quantity} (${d.totalLengthMm} mm)</td>
      </tr>`
    )
    .join("");

  const cadHtml = report.cadAssets
    .map(
      (a) => `
      <tr>
        <td>CAD</td>
        <td>${a.name}</td>
        <td>Custom 3D (${a.format.toUpperCase()})</td>
        <td>${a.widthMm} × ${a.heightMm} × ${a.depthMm} mm</td>
        <td>Custom</td>
        <td style="text-align:center;">${a.quantity}</td>
      </tr>`
    )
    .join("");

  const wireRowsHtml = report.wires
    .map(
      (w) => `
      <tr>
        <td><strong>${w.label}</strong></td>
        <td>${w.fromDisplay}</td>
        <td>${w.toDisplay}</td>
        <td style="text-align:center;">${w.colorCode}</td>
        <td style="text-align:center;">${w.gaugeMm2} mm²</td>
        <td style="text-align:center;">${w.outerDiameterMm} mm</td>
        <td style="text-align:right;">${w.routeLengthMm} mm</td>
        <td style="text-align:right;">+${w.allowanceMm} mm</td>
        <td style="text-align:right; font-weight:bold;">${w.cutLengthMm} mm</td>
      </tr>`
    )
    .join("");

  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>BOM & Wire Cutting Schedule - ${report.projectName}</title>
  <style>
    @page { size: landscape; margin: 12mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; color: #0f172a; padding: 0; margin: 0; font-size: 11px; }
    h1 { font-size: 18px; margin: 0 0 4px 0; }
    .subtitle { color: #64748b; margin-bottom: 16px; font-size: 11px; }
    .cards { display: flex; gap: 12px; margin-bottom: 16px; }
    .card { flex: 1; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; background: #f8fafc; }
    .card-label { font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: bold; }
    .card-value { font-size: 16px; font-weight: bold; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #0f172a; color: #fff; text-align: left; padding: 6px 8px; font-size: 10px; text-transform: uppercase; }
    td { border-bottom: 1px solid #e2e8f0; padding: 5px 8px; }
    tr:nth-child(even) { background: #f8fafc; }
    .section-title { font-size: 13px; font-weight: bold; margin: 16px 0 8px 0; border-bottom: 2px solid #0f172a; padding-bottom: 4px; }
  </style>
</head>
<body>
  <h1>${report.projectName} — BOM & Wire Schedule</h1>
  <div class="subtitle">Scope: ${scope === "all" ? "All Project Sheets" : activeSheetName} • Generated: ${new Date().toLocaleString()}</div>

  <div class="cards">
    <div class="card">
      <div class="card-label">Total Components</div>
      <div class="card-value">${report.summary.totalComponents}</div>
    </div>
    <div class="card">
      <div class="card-label">Total DIN Rail</div>
      <div class="card-value">${report.summary.totalDinRailLengthMm} mm</div>
    </div>
    <div class="card">
      <div class="card-label">Total Wires</div>
      <div class="card-value">${report.summary.totalWires}</div>
    </div>
    <div class="card">
      <div class="card-label">Cable Length</div>
      <div class="card-value">${report.summary.totalCableLengthM} m</div>
    </div>
  </div>

  <div class="section-title">1. Bill of Materials (BOM)</div>
  <table>
    <thead>
      <tr>
        <th>Tag</th>
        <th>Component / Material</th>
        <th>Category</th>
        <th>Dimensions</th>
        <th>Mounting</th>
        <th style="text-align:center;">Qty</th>
      </tr>
    </thead>
    <tbody>
      ${bomRowsHtml}
      ${dinRailHtml}
      ${ductHtml}
      ${cadHtml}
    </tbody>
  </table>

  <div class="section-title" style="page-break-before: always;">2. Wire Cutting Schedule (+40mm Stripping Allowance)</div>
  <table>
    <thead>
      <tr>
        <th>Wire ID / Tag</th>
        <th>From</th>
        <th>To</th>
        <th style="text-align:center;">Color</th>
        <th style="text-align:center;">Gauge</th>
        <th style="text-align:center;">OD</th>
        <th style="text-align:right;">Route</th>
        <th style="text-align:right;">Allowance</th>
        <th style="text-align:right;">Cut Length</th>
      </tr>
    </thead>
    <tbody>
      ${wireRowsHtml || `<tr><td colspan="9" style="text-align:center; padding: 12px; color: #94a3b8;">No wire connections found in this scope.</td></tr>`}
    </tbody>
  </table>

  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`);
  win.document.close();
}

export function BomPanelTab() {
  const sheets = usePanelStore((s) => s.sheets);
  const activeSheetId = usePanelStore((s) => s.activeSheetId);
  const titleBlock = usePanelStore((s) => s.titleBlock);

  const [scope, setScope] = useState<BomReportScope>("active");
  const [subTab, setSubTab] = useState<"bom" | "wires">("bom");

  const report = useMemo(
    () =>
      generateBomReport(
        sheets,
        activeSheetId,
        scope,
        titleBlock.projectName || "PanelFlow Project"
      ),
    [sheets, activeSheetId, scope, titleBlock.projectName]
  );

  const activeSheetName = useMemo(
    () => sheets.find((s) => s.id === activeSheetId)?.name || "Active Sheet",
    [sheets, activeSheetId]
  );

  const filePrefix = (titleBlock.projectName || "panelflow")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-");

  const handleDownloadBomCsv = () => {
    const csv = generateBomCsv(report);
    triggerDownload(`${filePrefix}-bom-${scope}.csv`, csv, "text/csv;charset=utf-8;");
  };

  const handleDownloadWireCsv = () => {
    const csv = generateWireListCsv(report);
    triggerDownload(`${filePrefix}-wires-${scope}.csv`, csv, "text/csv;charset=utf-8;");
  };

  const bomCount =
    report.components.length +
    report.dinRails.length +
    report.wireDucts.length +
    report.cadAssets.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Scope Toggle & Summary Stats */}
      <div className="shrink-0 space-y-2.5 border-b border-[#e2e8f0] dark:border-white/10 px-3 py-2.5">
        {/* Scope Toggle: [Active Sheet] | [All Sheets] */}
        <div className="grid grid-cols-2 rounded-lg border border-[#e2e8f0] dark:border-white/10 bg-[#f1f5f9] dark:bg-[#171a21] p-0.5 text-[11px] font-medium">
          <button
            type="button"
            onClick={() => setScope("active")}
            className={`truncate rounded-md px-2 py-1 transition-all ${
              scope === "active"
                ? "bg-white dark:bg-[#222733] text-[#0f172a] dark:text-white font-semibold shadow-xs"
                : "text-[#64748b] dark:text-slate-400 hover:text-[#0f172a] dark:hover:text-white"
            }`}
            title={activeSheetName}
          >
            Active Sheet
          </button>
          <button
            type="button"
            onClick={() => setScope("all")}
            className={`truncate rounded-md px-2 py-1 transition-all ${
              scope === "all"
                ? "bg-white dark:bg-[#222733] text-[#0f172a] dark:text-white font-semibold shadow-xs"
                : "text-[#64748b] dark:text-slate-400 hover:text-[#0f172a] dark:hover:text-white"
            }`}
          >
            All Sheets ({sheets.length})
          </button>
        </div>

        {/* 2x2 Summary Stats Grid */}
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-lg border border-[#e2e8f0] dark:border-white/10 bg-white dark:bg-[#171a21] px-2.5 py-2">
            <div className="font-sans text-[9px] font-semibold uppercase tracking-wider text-[#64748b] dark:text-slate-400">
              Parts
            </div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-sans text-sm font-bold tabular-nums text-[#0f172a] dark:text-white">
                {report.summary.totalComponents}
              </span>
              <span className="font-sans text-[10px] text-[#64748b] dark:text-slate-400">
                ({report.summary.totalUniqueComponentTypes} types)
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-[#e2e8f0] dark:border-white/10 bg-white dark:bg-[#171a21] px-2.5 py-2">
            <div className="font-sans text-[9px] font-semibold uppercase tracking-wider text-[#64748b] dark:text-slate-400">
              DIN Rail
            </div>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className="font-sans text-sm font-bold tabular-nums text-[#0f172a] dark:text-white">
                {report.summary.totalDinRailLengthMm.toLocaleString()}
              </span>
              <span className="font-sans text-[10px] text-[#64748b] dark:text-slate-400">
                mm
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-[#e2e8f0] dark:border-white/10 bg-white dark:bg-[#171a21] px-2.5 py-2">
            <div className="font-sans text-[9px] font-semibold uppercase tracking-wider text-[#64748b] dark:text-slate-400">
              Wires
            </div>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className="font-sans text-sm font-bold tabular-nums text-[#0f172a] dark:text-white">
                {report.summary.totalWires}
              </span>
              <span className="font-sans text-[10px] text-[#64748b] dark:text-slate-400">
                runs
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-[#e2e8f0] dark:border-white/10 bg-white dark:bg-[#171a21] px-2.5 py-2">
            <div className="font-sans text-[9px] font-semibold uppercase tracking-wider text-[#64748b] dark:text-slate-400">
              Cable
            </div>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className="font-sans text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {report.summary.totalCableLengthM}
              </span>
              <span className="font-sans text-[10px] text-[#64748b] dark:text-slate-400">
                m
              </span>
            </div>
          </div>
        </div>

        {/* Sub-tab Switcher: [Components BOM] | [Wire List] */}
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-[#e2e8f0] dark:border-white/10 bg-[#f1f5f9] dark:bg-[#171a21] p-0.5">
          <button
            type="button"
            onClick={() => setSubTab("bom")}
            className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-all ${
              subTab === "bom"
                ? "bg-[#0f172a] text-white dark:bg-white dark:text-[#0f172a] shadow-xs"
                : "text-[#64748b] dark:text-slate-400 hover:text-[#0f172a] dark:hover:text-white"
            }`}
          >
            <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Components BOM</span>
            <span className="rounded-full bg-slate-500/20 px-1.5 font-sans text-[10px]">
              {bomCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab("wires")}
            className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-all ${
              subTab === "wires"
                ? "bg-[#0f172a] text-white dark:bg-white dark:text-[#0f172a] shadow-xs"
                : "text-[#64748b] dark:text-slate-400 hover:text-[#0f172a] dark:hover:text-white"
            }`}
          >
            <Cable className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Wire List</span>
            <span className="rounded-full bg-slate-500/20 px-1.5 font-sans text-[10px]">
              {report.wires.length}
            </span>
          </button>
        </div>
      </div>

      {/* Scrollable Compact List */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5 space-y-1.5">
        {subTab === "bom" ? (
          bomCount === 0 ? (
            <div className="rounded-xl border border-dashed border-[#cbd5e1] dark:border-white/10 p-4 text-center text-xs text-[#64748b] dark:text-slate-400">
              No components, DIN rails, or ducts in this scope.
            </div>
          ) : (
            <>
              {report.components.map((c) => (
                <div
                  key={c.key}
                  className="rounded-lg border border-[#e2e8f0] dark:border-white/10 bg-white dark:bg-[#171a21] px-2.5 py-2 shadow-2xs dark:shadow-none"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#0f172a] dark:text-slate-100">
                      {c.componentName}
                    </span>
                    <span className="shrink-0 rounded-md bg-[#f1f5f9] dark:bg-white/10 px-1.5 py-0.5 font-sans text-[11px] font-bold tabular-nums text-[#0f172a] dark:text-white">
                      ×{c.quantity}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="max-w-[140px] truncate rounded border border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-sky-700 dark:text-sky-300">
                      {c.tags.join(", ")}
                    </span>
                    <span className="font-sans text-[10px] tabular-nums text-[#64748b] dark:text-slate-400">
                      {c.widthMm}×{c.heightMm}×{c.depthMm}mm
                    </span>
                    <span className="ml-auto text-[10px] text-[#94a3b8] dark:text-slate-500">
                      {c.mountingType}
                    </span>
                  </div>
                </div>
              ))}

              {report.dinRails.map((r) => (
                <div
                  key={r.key}
                  className="rounded-lg border border-[#e2e8f0] dark:border-white/10 bg-white dark:bg-[#171a21] px-2.5 py-2 shadow-2xs dark:shadow-none"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#0f172a] dark:text-slate-100">
                      {r.name}
                    </span>
                    <span className="shrink-0 rounded-md bg-[#f1f5f9] dark:bg-white/10 px-1.5 py-0.5 font-sans text-[11px] font-bold tabular-nums text-[#0f172a] dark:text-white">
                      ×{r.quantity}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="rounded border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-[#475569] dark:text-slate-300">
                      DIN35
                    </span>
                    <span className="font-sans text-[10px] tabular-nums text-[#64748b] dark:text-slate-400">
                      {r.lengthMm}mm (Σ {r.totalLengthMm}mm)
                    </span>
                  </div>
                </div>
              ))}

              {report.wireDucts.map((d) => (
                <div
                  key={d.key}
                  className="rounded-lg border border-[#e2e8f0] dark:border-white/10 bg-white dark:bg-[#171a21] px-2.5 py-2 shadow-2xs dark:shadow-none"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#0f172a] dark:text-slate-100">
                      {d.profileLabel}
                    </span>
                    <span className="shrink-0 rounded-md bg-[#f1f5f9] dark:bg-white/10 px-1.5 py-0.5 font-sans text-[11px] font-bold tabular-nums text-[#0f172a] dark:text-white">
                      ×{d.quantity}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="rounded border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-[#475569] dark:text-slate-300">
                      DUCT
                    </span>
                    <span className="font-sans text-[10px] tabular-nums text-[#64748b] dark:text-slate-400">
                      {d.crossSectionWidthMm}×{d.depthMm}mm (Σ {d.totalLengthMm}mm)
                    </span>
                  </div>
                </div>
              ))}

              {report.cadAssets.map((a) => (
                <div
                  key={a.key}
                  className="rounded-lg border border-[#e2e8f0] dark:border-white/10 bg-white dark:bg-[#171a21] px-2.5 py-2 shadow-2xs dark:shadow-none"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#0f172a] dark:text-slate-100">
                      {a.name}
                    </span>
                    <span className="shrink-0 rounded-md bg-[#f1f5f9] dark:bg-white/10 px-1.5 py-0.5 font-sans text-[11px] font-bold tabular-nums text-[#0f172a] dark:text-white">
                      ×{a.quantity}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="rounded border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                      {a.materialType ? `BUSBAR • ${a.materialType.toUpperCase()}` : `CAD • ${a.format}`}
                    </span>
                    <span className="font-sans text-[10px] tabular-nums text-[#64748b] dark:text-slate-400">
                      {a.widthMm}×{a.heightMm}×{a.depthMm}mm
                    </span>
                  </div>
                </div>
              ))}
            </>
          )
        ) : report.wires.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#cbd5e1] dark:border-white/10 p-4 text-center text-xs text-[#64748b] dark:text-slate-400">
            No wire connections placed yet. Route wires on the 2D canvas to see cut lengths.
          </div>
        ) : (
          report.wires.map((w) => (
            <div
              key={w.id}
              className="rounded-lg border border-[#e2e8f0] dark:border-white/10 bg-white dark:bg-[#171a21] px-2.5 py-2 shadow-2xs dark:shadow-none"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="font-sans text-xs font-bold text-sky-600 dark:text-sky-400">
                    {w.label}
                  </span>
                  <span className="rounded border border-[#cbd5e1] dark:border-white/10 bg-[#f1f5f9] dark:bg-white/10 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-[#0f172a] dark:text-slate-200">
                    {w.colorCode} • {w.gaugeMm2}mm²
                  </span>
                </div>
                <span className="shrink-0 font-sans text-xs font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {w.cutLengthMm} mm
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 font-sans text-[10px] text-[#475569] dark:text-slate-300">
                <span className="min-w-0 flex-1 truncate" title={`${w.fromDisplay} → ${w.toDisplay}`}>
                  {w.fromDisplay} → {w.toDisplay}
                </span>
                <span className="shrink-0 tabular-nums text-[#94a3b8] dark:text-slate-500">
                  {w.routeLengthMm}+{w.allowanceMm}mm
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Sticky Footer Export Actions */}
      <div className="shrink-0 space-y-1.5 border-t border-[#e2e8f0] dark:border-white/10 bg-[#f8fafc] dark:bg-[#0c0e14] p-3">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={handleDownloadBomCsv}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-[#cbd5e1] dark:border-white/10 bg-white dark:bg-[#171a21] px-2.5 py-1.5 text-[11px] font-semibold text-[#0f172a] dark:text-slate-200 transition-colors hover:bg-[#f1f5f9] dark:hover:bg-white/10"
          >
            <Download className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
            Export BOM (.csv)
          </button>
          <button
            type="button"
            onClick={handleDownloadWireCsv}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-[#cbd5e1] dark:border-white/10 bg-white dark:bg-[#171a21] px-2.5 py-1.5 text-[11px] font-semibold text-[#0f172a] dark:text-slate-200 transition-colors hover:bg-[#f1f5f9] dark:hover:bg-white/10"
          >
            <Download className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
            Export Wire (.csv)
          </button>
        </div>
        <button
          type="button"
          onClick={() => printBomPdf(report, scope, activeSheetName)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#0f172a] dark:bg-white px-3 py-2 text-xs font-semibold text-white dark:text-[#0f172a] shadow-xs transition-opacity hover:opacity-90"
        >
          <Printer className="h-3.5 w-3.5" />
          Print / PDF Report
        </button>
      </div>
    </div>
  );
}
