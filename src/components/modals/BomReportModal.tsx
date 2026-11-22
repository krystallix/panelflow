"use client";

import { useMemo, useState } from "react";
import {
  Cable,
  Check,
  ClipboardList,
  Download,
  FileSpreadsheet,
  Layers,
  Printer,
  Sparkles,
  Zap,
} from "lucide-react";
import { Badge, Button, Modal } from "@/components/ui";
import {
  generateBomCsv,
  generateBomReport,
  generateWireListCsv,
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

interface BomReportModalProps {
  onClose: () => void;
}

export function BomReportModal({ onClose }: BomReportModalProps) {
  const sheets = usePanelStore((s) => s.sheets);
  const activeSheetId = usePanelStore((s) => s.activeSheetId);
  const titleBlock = usePanelStore((s) => s.titleBlock);

  const [activeTab, setActiveTab] = useState<"bom" | "wires">("bom");
  const [scope, setScope] = useState<BomReportScope>("active");
  const [copiedType, setCopiedType] = useState<string | null>(null);

  const report = useMemo(() => {
    return generateBomReport(
      sheets,
      activeSheetId,
      scope,
      titleBlock.projectName || "PanelFlow Project"
    );
  }, [sheets, activeSheetId, scope, titleBlock.projectName]);

  const activeSheetName = useMemo(() => {
    return (
      sheets.find((s) => s.id === activeSheetId)?.name || "Active Sheet"
    );
  }, [sheets, activeSheetId]);

  const handleDownloadBomCsv = () => {
    const csv = generateBomCsv(report);
    const prefix = (titleBlock.projectName || "panelflow")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-");
    triggerDownload(`${prefix}-bom-${scope}.csv`, csv, "text/csv;charset=utf-8;");
  };

  const handleDownloadWireCsv = () => {
    const csv = generateWireListCsv(report);
    const prefix = (titleBlock.projectName || "panelflow")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-");
    triggerDownload(`${prefix}-wires-${scope}.csv`, csv, "text/csv;charset=utf-8;");
  };

  const handlePrintPdf = () => {
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
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      maxWidthClassName="max-w-5xl"
      className="flex flex-col h-[90vh] max-h-[820px] p-0 overflow-hidden text-[#0f172a] dark:text-slate-100"
    >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e2e8f0] dark:border-white/10 px-6 py-4 bg-[#f8fafc]/80 dark:bg-[#151922]/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight text-[#0f172a] dark:text-white">
                  BOM & Wire Cutting Schedule
                </h2>
                <Badge variant="neutral" className="font-sans text-[10px] rounded-md">
                  CAD REPORT
                </Badge>
              </div>
              <p className="text-xs text-[#64748b] dark:text-slate-400">
                Precision manufacturing takeoff, DIN rail allocation, and wire cut lengths
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Scope Toggle */}
            <div className="flex items-center rounded-xl border border-[#cbd5e1] dark:border-white/10 bg-[#e2e8f0]/50 dark:bg-white/5 p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setScope("active")}
                className={`rounded-lg px-3 py-1 transition-all cursor-pointer ${
                  scope === "active"
                    ? "bg-white dark:bg-[#1e2330] text-[#0f172a] dark:text-white font-semibold shadow-xs"
                    : "text-[#64748b] dark:text-slate-400 hover:text-[#0f172a] dark:hover:text-white"
                }`}
              >
                Active Sheet ({activeSheetName})
              </button>
              <button
                type="button"
                onClick={() => setScope("all")}
                className={`rounded-lg px-3 py-1 transition-all cursor-pointer ${
                  scope === "all"
                    ? "bg-white dark:bg-[#1e2330] text-[#0f172a] dark:text-white font-semibold shadow-xs"
                    : "text-[#64748b] dark:text-slate-400 hover:text-[#0f172a] dark:hover:text-white"
                }`}
              >
                All Sheets ({sheets.length})
              </button>
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={onClose}
              title="Close"
            >
              <span className="sr-only">Close</span>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 py-4 border-b border-[#e2e8f0] dark:border-white/10 bg-[#fbfcfd] dark:bg-[#11141c]">
          <div className="rounded-xl border border-[#e2e8f0] dark:border-white/10 bg-white dark:bg-[#171b26] p-3 shadow-xs">
            <span className="block font-sans text-[10px] font-bold uppercase tracking-wider text-[#64748b] dark:text-slate-400">
              Total Components
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold tracking-tight text-[#0f172a] dark:text-white">
                {report.summary.totalComponents}
              </span>
              <span className="font-sans text-xs text-[#64748b] dark:text-slate-400">
                ({report.summary.totalUniqueComponentTypes} types)
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-[#e2e8f0] dark:border-white/10 bg-white dark:bg-[#171b26] p-3 shadow-xs">
            <span className="block font-sans text-[10px] font-bold uppercase tracking-wider text-[#64748b] dark:text-slate-400">
              Total DIN Rail
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold tracking-tight text-[#0f172a] dark:text-white">
                {report.summary.totalDinRailLengthMm.toLocaleString()}
              </span>
              <span className="font-sans text-xs text-[#64748b] dark:text-slate-400">
                mm ({report.summary.totalDinRailPieces} pcs)
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-[#e2e8f0] dark:border-white/10 bg-white dark:bg-[#171b26] p-3 shadow-xs">
            <span className="block font-sans text-[10px] font-bold uppercase tracking-wider text-[#64748b] dark:text-slate-400">
              Total Wires
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold tracking-tight text-[#0f172a] dark:text-white">
                {report.summary.totalWires}
              </span>
              <span className="font-sans text-xs text-[#64748b] dark:text-slate-400">
                runs
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-[#e2e8f0] dark:border-white/10 bg-white dark:bg-[#171b26] p-3 shadow-xs">
            <span className="block font-sans text-[10px] font-bold uppercase tracking-wider text-[#64748b] dark:text-slate-400">
              Total Cable Length
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                {report.summary.totalCableLengthM}
              </span>
              <span className="font-sans text-xs text-[#64748b] dark:text-slate-400">
                m ({report.summary.totalCableLengthMm.toLocaleString()} mm)
              </span>
            </div>
          </div>
        </div>

        {/* Tab Switcher Bar */}
        <div className="flex items-center justify-between border-b border-[#e2e8f0] dark:border-white/10 px-6 py-2.5 bg-white dark:bg-[#0f1219]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("bom")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                activeTab === "bom"
                  ? "bg-[#0f172a] text-white dark:bg-white dark:text-[#0f172a] shadow-xs"
                  : "text-[#64748b] dark:text-slate-400 hover:bg-[#f1f5f9] dark:hover:bg-white/5 hover:text-[#0f172a] dark:hover:text-white"
              }`}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Bill of Materials (BOM)
              <span className="rounded-full bg-slate-500/20 px-1.5 py-0.2 font-sans text-[10px]">
                {report.components.length + report.dinRails.length + report.wireDucts.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("wires")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                activeTab === "wires"
                  ? "bg-[#0f172a] text-white dark:bg-white dark:text-[#0f172a] shadow-xs"
                  : "text-[#64748b] dark:text-slate-400 hover:bg-[#f1f5f9] dark:hover:bg-white/5 hover:text-[#0f172a] dark:hover:text-white"
              }`}
            >
              <Cable className="h-4 w-4" />
              Wire Cutting List
              <span className="rounded-full bg-slate-500/20 px-1.5 py-0.2 font-sans text-[10px]">
                {report.wires.length}
              </span>
            </button>
          </div>

          {/* Export Action Buttons */}
          <div className="flex items-center gap-2">
            {activeTab === "bom" ? (
              <button
                type="button"
                onClick={handleDownloadBomCsv}
                className="flex items-center gap-1.5 rounded-xl border border-[#cbd5e1] dark:border-white/10 bg-[#f8fafc] dark:bg-[#181d28] px-3.5 py-1.5 text-xs font-medium text-[#0f172a] dark:text-slate-200 hover:bg-[#e2e8f0] dark:hover:bg-white/10 shadow-xs transition-colors"
              >
                <Download className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                Download BOM (.csv)
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDownloadWireCsv}
                className="flex items-center gap-1.5 rounded-xl border border-[#cbd5e1] dark:border-white/10 bg-[#f8fafc] dark:bg-[#181d28] px-3.5 py-1.5 text-xs font-medium text-[#0f172a] dark:text-slate-200 hover:bg-[#e2e8f0] dark:hover:bg-white/10 shadow-xs transition-colors"
              >
                <Download className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                Download Wire List (.csv)
              </button>
            )}

            <button
              type="button"
              onClick={handlePrintPdf}
              className="flex items-center gap-1.5 rounded-xl border border-[#cbd5e1] dark:border-white/10 bg-[#f8fafc] dark:bg-[#181d28] px-3.5 py-1.5 text-xs font-medium text-[#0f172a] dark:text-slate-200 hover:bg-[#e2e8f0] dark:hover:bg-white/10 shadow-xs transition-colors"
            >
              <Printer className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
              Print / PDF Report
            </button>
          </div>
        </div>

        {/* Tab Body Table */}
        <div className="min-h-0 flex-1 overflow-auto p-6 bg-slate-50/50 dark:bg-[#0b0e14]">
          {activeTab === "bom" ? (
            <div className="space-y-6">
              {/* Components Section */}
              <div className="overflow-hidden rounded-xl border border-[#e2e8f0] dark:border-white/10 bg-white dark:bg-[#141822] shadow-xs">
                <div className="border-b border-[#e2e8f0] dark:border-white/10 bg-[#f8fafc] dark:bg-[#171b26] px-4 py-2.5">
                  <span className="font-sans text-xs font-bold uppercase tracking-wider text-[#334155] dark:text-slate-300">
                    Electrical Components ({report.components.length})
                  </span>
                </div>
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#e2e8f0] dark:border-white/10 text-[11px] font-sans uppercase text-[#64748b] dark:text-slate-400 bg-slate-50/60 dark:bg-white/5">
                      <th className="px-4 py-2 font-semibold">Tag</th>
                      <th className="px-4 py-2 font-semibold">Component</th>
                      <th className="px-4 py-2 font-semibold">Category</th>
                      <th className="px-4 py-2 font-semibold">Dimensions (W×H×D)</th>
                      <th className="px-4 py-2 font-semibold">Mounting</th>
                      <th className="px-4 py-2 font-semibold text-center">Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f5f9] dark:divide-white/5 font-sans text-[11px]">
                    {report.components.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-[#64748b] dark:text-slate-400 font-sans">
                          No electrical components found in current scope.
                        </td>
                      </tr>
                    ) : (
                      report.components.map((c) => (
                        <tr key={c.key} className="hover:bg-slate-50 dark:hover:bg-white/5">
                          <td className="px-4 py-2.5 font-bold text-sky-600 dark:text-sky-400">
                            {c.tags.join(", ")}
                          </td>
                          <td className="px-4 py-2.5 font-sans font-medium text-[#0f172a] dark:text-slate-200">
                            {c.componentName}
                          </td>
                          <td className="px-4 py-2.5 text-[#64748b] dark:text-slate-400 font-sans">
                            {c.category}
                          </td>
                          <td className="px-4 py-2.5 text-[#475569] dark:text-slate-300">
                            {c.widthMm} × {c.heightMm} × {c.depthMm} mm
                          </td>
                          <td className="px-4 py-2.5 capitalize text-[#64748b] dark:text-slate-400">
                            {c.mountingType.replace("_", " ")}
                          </td>
                          <td className="px-4 py-2.5 text-center font-bold text-[#0f172a] dark:text-white">
                            {c.quantity}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Infrastructure Materials (Rails + Ducts) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* DIN Rails */}
                <div className="overflow-hidden rounded-xl border border-[#e2e8f0] dark:border-white/10 bg-white dark:bg-[#141822] shadow-xs">
                  <div className="border-b border-[#e2e8f0] dark:border-white/10 bg-[#f8fafc] dark:bg-[#171b26] px-4 py-2.5">
                    <span className="font-sans text-xs font-bold uppercase tracking-wider text-[#334155] dark:text-slate-300">
                      DIN Rail 35mm ({report.dinRails.length})
                    </span>
                  </div>
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#e2e8f0] dark:border-white/10 text-[11px] font-sans uppercase text-[#64748b] dark:text-slate-400 bg-slate-50/60 dark:bg-white/5">
                        <th className="px-4 py-2 font-semibold">Rail Spec</th>
                        <th className="px-4 py-2 font-semibold text-center">Qty</th>
                        <th className="px-4 py-2 font-semibold text-right">Total Length</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f1f5f9] dark:divide-white/5 font-sans text-[11px]">
                      {report.dinRails.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-4 text-center text-[#64748b] dark:text-slate-400 font-sans">
                            No DIN rails in scope.
                          </td>
                        </tr>
                      ) : (
                        report.dinRails.map((r) => (
                          <tr key={r.key} className="hover:bg-slate-50 dark:hover:bg-white/5">
                            <td className="px-4 py-2.5 text-[#0f172a] dark:text-slate-200">
                              {r.name}
                            </td>
                            <td className="px-4 py-2.5 text-center font-bold">
                              {r.quantity}
                            </td>
                            <td className="px-4 py-2.5 text-right font-bold text-amber-600 dark:text-amber-400">
                              {r.totalLengthMm} mm
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Wire Ducts */}
                <div className="overflow-hidden rounded-xl border border-[#e2e8f0] dark:border-white/10 bg-white dark:bg-[#141822] shadow-xs">
                  <div className="border-b border-[#e2e8f0] dark:border-white/10 bg-[#f8fafc] dark:bg-[#171b26] px-4 py-2.5">
                    <span className="font-sans text-xs font-bold uppercase tracking-wider text-[#334155] dark:text-slate-300">
                      Slotted Wire Ducts ({report.wireDucts.length})
                    </span>
                  </div>
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#e2e8f0] dark:border-white/10 text-[11px] font-sans uppercase text-[#64748b] dark:text-slate-400 bg-slate-50/60 dark:bg-white/5">
                        <th className="px-4 py-2 font-semibold">Duct Profile</th>
                        <th className="px-4 py-2 font-semibold text-center">Qty</th>
                        <th className="px-4 py-2 font-semibold text-right">Total Length</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f1f5f9] dark:divide-white/5 font-sans text-[11px]">
                      {report.wireDucts.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-4 text-center text-[#64748b] dark:text-slate-400 font-sans">
                            No wire ducts in scope.
                          </td>
                        </tr>
                      ) : (
                        report.wireDucts.map((d) => (
                          <tr key={d.key} className="hover:bg-slate-50 dark:hover:bg-white/5">
                            <td className="px-4 py-2.5 text-[#0f172a] dark:text-slate-200">
                              {d.profileLabel}
                            </td>
                            <td className="px-4 py-2.5 text-center font-bold">
                              {d.quantity}
                            </td>
                            <td className="px-4 py-2.5 text-right font-bold text-teal-600 dark:text-teal-400">
                              {d.totalLengthMm} mm
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Custom CAD Assets (if any) */}
              {report.cadAssets.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-[#e2e8f0] dark:border-white/10 bg-white dark:bg-[#141822] shadow-xs">
                  <div className="border-b border-[#e2e8f0] dark:border-white/10 bg-[#f8fafc] dark:bg-[#171b26] px-4 py-2.5">
                    <span className="font-sans text-xs font-bold uppercase tracking-wider text-[#334155] dark:text-slate-300">
                      Custom CAD Assets ({report.cadAssets.length})
                    </span>
                  </div>
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#e2e8f0] dark:border-white/10 text-[11px] font-sans uppercase text-[#64748b] dark:text-slate-400 bg-slate-50/60 dark:bg-white/5">
                        <th className="px-4 py-2 font-semibold">Name</th>
                        <th className="px-4 py-2 font-semibold">File</th>
                        <th className="px-4 py-2 font-semibold">Format</th>
                        <th className="px-4 py-2 font-semibold">Bounds (W×H×D)</th>
                        <th className="px-4 py-2 font-semibold text-center">Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f1f5f9] dark:divide-white/5 font-sans text-[11px]">
                      {report.cadAssets.map((a) => (
                        <tr key={a.key} className="hover:bg-slate-50 dark:hover:bg-white/5">
                          <td className="px-4 py-2.5 font-bold text-[#0f172a] dark:text-white">
                            {a.name}
                          </td>
                          <td className="px-4 py-2.5 text-[#64748b] dark:text-slate-400">
                            {a.fileName}
                          </td>
                          <td className="px-4 py-2.5 font-semibold text-indigo-500">
                            {a.format}
                          </td>
                          <td className="px-4 py-2.5 text-[#475569] dark:text-slate-300">
                            {a.widthMm} × {a.heightMm} × {a.depthMm} mm
                          </td>
                          <td className="px-4 py-2.5 text-center font-bold">
                            {a.quantity}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            /* Wire Cutting List Tab */
            <div className="overflow-hidden rounded-xl border border-[#e2e8f0] dark:border-white/10 bg-white dark:bg-[#141822] shadow-xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#e2e8f0] dark:border-white/10 text-[11px] font-sans uppercase text-[#64748b] dark:text-slate-400 bg-slate-50/60 dark:bg-white/5">
                    <th className="px-4 py-2.5 font-semibold">Wire ID</th>
                    <th className="px-4 py-2.5 font-semibold">From (Device : Pin)</th>
                    <th className="px-4 py-2.5 font-semibold">To (Device : Pin)</th>
                    <th className="px-4 py-2.5 font-semibold text-center">Signal / Color</th>
                    <th className="px-4 py-2.5 font-semibold text-center">Gauge</th>
                    <th className="px-4 py-2.5 font-semibold text-center">OD</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Route Length</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Cut Length (+40mm)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9] dark:divide-white/5 font-sans text-[11px]">
                  {report.wires.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-[#64748b] dark:text-slate-400 font-sans">
                        No wire connections placed yet. Route wires on the 2D canvas to see cut lengths here.
                      </td>
                    </tr>
                  ) : (
                    report.wires.map((w) => (
                      <tr key={w.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                        <td className="px-4 py-2.5 font-bold text-sky-600 dark:text-sky-400">
                          {w.label}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-[#0f172a] dark:text-slate-200">
                          {w.fromDisplay}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-[#0f172a] dark:text-slate-200">
                          {w.toDisplay}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="inline-block rounded-md border border-[#cbd5e1] dark:border-white/10 bg-[#f1f5f9] dark:bg-white/10 px-2 py-0.5 font-semibold text-[#0f172a] dark:text-white">
                            {w.colorCode}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center text-[#475569] dark:text-slate-300">
                          {w.gaugeMm2} mm²
                        </td>
                        <td className="px-4 py-2.5 text-center text-[#64748b] dark:text-slate-400">
                          ⌀ {w.outerDiameterMm} mm
                        </td>
                        <td className="px-4 py-2.5 text-right text-[#475569] dark:text-slate-300">
                          {w.routeLengthMm} mm
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {w.cutLengthMm} mm
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
    </Modal>
  );
}
