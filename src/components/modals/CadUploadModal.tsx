"use client";

import { useState, useRef } from "react";
import { usePanelStore } from "@/store/usePanelStore";
import { parseDxfToMmSegments } from "@/lib/dxf-parser";
import { getCadScaleFactorToMm } from "@/lib/units";
import type { CadFormat, CadImportUnit, CustomCadAsset } from "@/types/panel";
import { AlertCircle, Upload, FileCheck } from "lucide-react";
import {
  Alert,
  Button,
  Input,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@/components/ui";

export function CadUploadModal({ onClose }: { onClose: () => void }) {
  const { addCadAsset, setSelected } = usePanelStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceUnit, setSourceUnit] = useState<CadImportUnit>("mm");
  const [assetName, setAssetName] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const units: CadImportUnit[] = ["mm", "cm", "m", "inch"];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    setAssetName(baseName);
    setErrorMsg(null);
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const ext = selectedFile.name.split(".").pop()?.toLowerCase();
      const id = `cad-${Date.now()}`;

      if (ext === "dxf") {
        const text = await selectedFile.text();
        const parsed = parseDxfToMmSegments(text, sourceUnit);

        const asset: CustomCadAsset = {
          id,
          name: assetName || selectedFile.name,
          fileName: selectedFile.name,
          format: "dxf",
          sourceUnit,
          xMm: 0,
          yMm: 0,
          zMm: parsed.boundingBoxMm.d / 2,
          boundingBoxMm: parsed.boundingBoxMm,
          pins: [],
          rawText: text,
        };

        addCadAsset(asset);
        setSelected({ kind: "cad", id });
        onClose();
      } else if (ext === "glb" || ext === "gltf" || ext === "obj") {
        const objectUrl = URL.createObjectURL(selectedFile);
        const scaleFactor = getCadScaleFactorToMm(sourceUnit);

        // Standard bounding box estimate (normalized to mm)
        const asset: CustomCadAsset = {
          id,
          name: assetName || selectedFile.name,
          fileName: selectedFile.name,
          format: ext as CadFormat,
          sourceUnit,
          xMm: 0,
          yMm: 0,
          zMm: 25,
          boundingBoxMm: {
            w: 50 * (sourceUnit === "m" ? 1 : scaleFactor === 1 ? 1 : scaleFactor),
            h: 80 * (sourceUnit === "m" ? 1 : scaleFactor === 1 ? 1 : scaleFactor),
            d: 50 * (sourceUnit === "m" ? 1 : scaleFactor === 1 ? 1 : scaleFactor),
          },
          pins: [],
          objectUrl,
        };

        addCadAsset(asset);
        setSelected({ kind: "cad", id });
        onClose();
      } else {
        setErrorMsg("Unsupported format. Please upload .glb, .gltf, .obj, or .dxf");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to parse CAD file";
      setErrorMsg(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} maxWidthClassName="max-w-md" className="text-xs">
      <ModalHeader
        title="Custom CAD Importer"
        subtitle="Upload 3D model & normalize to canonical mm"
        icon={<Upload className="w-4 h-4 text-slate-600 dark:text-zinc-400" />}
        onClose={onClose}
      />

      <ModalBody>
        {/* Drag & drop / browse area */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 dark:border-white/15 hover:border-sky-500/60 bg-slate-50 dark:bg-white/[0.03] hover:bg-slate-100/80 dark:hover:bg-white/[0.06] rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".glb,.gltf,.obj,.dxf"
            onChange={handleFileChange}
            className="hidden"
          />
          {selectedFile ? (
            <div className="text-center space-y-1">
              <FileCheck className="w-8 h-8 text-slate-600 dark:text-zinc-400 mx-auto" />
              <div className="font-medium text-slate-900 dark:text-zinc-200">{selectedFile.name}</div>
              <div className="text-[10px] text-slate-500 dark:text-zinc-500 font-sans">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </div>
            </div>
          ) : (
            <div className="text-center space-y-1">
              <Upload className="w-8 h-8 text-slate-400 dark:text-zinc-500 mx-auto" />
              <div className="font-medium text-slate-700 dark:text-zinc-300">
                Click or drop CAD model here
              </div>
              <div className="text-[11px] text-slate-500 dark:text-zinc-500">
                Supports .glb, .gltf, .obj, .dxf
              </div>
            </div>
          )}
        </div>

        {/* Name input */}
        <div>
          <label className="text-[10px] text-slate-500 dark:text-zinc-400 font-sans block mb-1">
            Asset Label
          </label>
          <Input
            type="text"
            value={assetName}
            onChange={(e) => setAssetName(e.target.value)}
            placeholder="e.g. VFD Inverter 0.75kW"
          />
        </div>

        {/* Source Unit Selector */}
        <div>
          <label className="text-[10px] text-slate-500 dark:text-zinc-400 font-sans block mb-1">
            Original CAD Unit Scale (Normalizes to mm)
          </label>
          <div className="grid grid-cols-4 gap-1.5 bg-slate-100 dark:bg-white/[0.03] p-1 rounded-xl border border-slate-200 dark:border-white/10">
            {units.map((u) => (
              <Button
                key={u}
                variant={sourceUnit === u ? "primary" : "ghost"}
                size="xs"
                onClick={() => setSourceUnit(u)}
                className="font-sans uppercase"
              >
                {u}
              </Button>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 dark:text-zinc-500 mt-1">
            Factor: 1 {sourceUnit} = {getCadScaleFactorToMm(sourceUnit)} mm internal
          </p>
        </div>

        {errorMsg && (
          <Alert variant="error" icon={<AlertCircle className="w-3.5 h-3.5" />}>
            {errorMsg}
          </Alert>
        )}
      </ModalBody>

      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!selectedFile || isProcessing}
          onClick={handleImport}
        >
          {isProcessing ? "Processing..." : "Import Model"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
