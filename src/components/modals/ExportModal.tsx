"use client";

import { usePanelStore } from "@/store/usePanelStore";
import { generateDrillingDxf, generateDrillingSvg } from "@/lib/template-export";
import { useState } from "react";
import { Download, FileCode, Check } from "lucide-react";
import { Button, Modal, ModalBody, ModalHeader } from "@/components/ui";

export function ExportModal({ onClose }: { onClose: () => void }) {
  const { enclosure, rails, ducts } = usePanelStore();
  const [copied, setCopied] = useState<"svg" | "dxf" | null>(null);

  const svgContent = generateDrillingSvg(enclosure, rails, ducts);
  const dxfContent = generateDrillingDxf(enclosure, rails, ducts);

  const downloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = (text: string, type: "svg" | "dxf") => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const plateW = enclosure.widthMm - enclosure.backplateInsetMm * 2;
  const plateH = enclosure.heightMm - enclosure.backplateInsetMm * 2;

  return (
    <Modal isOpen={true} onClose={onClose} maxWidthClassName="max-w-xl" className="text-xs">
      <ModalHeader
        title="2D Drilling Template (1:1 mm)"
        subtitle="Mounting plate drilling guide for DIN Rails and Wire Ducts"
        icon={<FileCode className="w-4 h-4 text-slate-600 dark:text-zinc-400" />}
        onClose={onClose}
      />

      <ModalBody>
        {/* Plate stats */}
        <div className="grid grid-cols-3 gap-2 bg-slate-50 dark:bg-white/[0.03] p-3 rounded-xl border border-slate-200 dark:border-white/10 font-sans text-[11px]">
          <div>
            <span className="text-slate-500 dark:text-zinc-500 block text-[10px]">PLATE SIZE</span>
            <span className="text-slate-900 dark:text-zinc-200">
              {plateW} × {plateH} mm
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-zinc-500 block text-[10px]">DIN RAILS</span>
            <span className="text-slate-900 dark:text-zinc-200">{rails.length} rails (5.5mm ⌀)</span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-zinc-500 block text-[10px]">WIRE DUCTS</span>
            <span className="text-slate-900 dark:text-zinc-200">{ducts.length} ducts (4.5mm ⌀)</span>
          </div>
        </div>

        {/* Live SVG Preview Box */}
        <div className="h-56 bg-slate-100 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-xl p-3 flex items-center justify-center overflow-hidden">
          <div
            className="max-h-full max-w-full bg-white rounded shadow-sm p-2 flex items-center justify-center"
            dangerouslySetInnerHTML={{ __html: svgContent }}
            style={{ width: "100%", height: "100%" }}
          />
        </div>

        <div className="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center justify-between">
          <span>Standards: EN 50022 35mm Rail pitch 25mm • Wire duct pitch 50mm</span>
          <span className="font-sans text-slate-400 dark:text-zinc-500">Scale 1:1 true mm</span>
        </div>

        {/* Export Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="md"
              onClick={() =>
                downloadFile(
                  svgContent,
                  `panel-drilling-template-${plateW}x${plateH}mm.svg`,
                  "image/svg+xml"
                )
              }
              className="flex-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download SVG (1:1)</span>
            </Button>
            <Button
              variant="outline"
              size="md"
              onClick={() => copyToClipboard(svgContent, "svg")}
              title="Copy SVG"
              className="px-3"
            >
              {copied === "svg" ? <Check className="w-3.5 h-3.5 text-slate-600 dark:text-zinc-400" /> : "Copy"}
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              variant="emerald"
              size="md"
              onClick={() =>
                downloadFile(
                  dxfContent,
                  `panel-drilling-template-${plateW}x${plateH}mm.dxf`,
                  "application/dxf"
                )
              }
              className="flex-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download DXF (AutoCAD)</span>
            </Button>
            <Button
              variant="outline"
              size="md"
              onClick={() => copyToClipboard(dxfContent, "dxf")}
              title="Copy DXF"
              className="px-3"
            >
              {copied === "dxf" ? <Check className="w-3.5 h-3.5 text-slate-600 dark:text-zinc-400" /> : "Copy"}
            </Button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}
