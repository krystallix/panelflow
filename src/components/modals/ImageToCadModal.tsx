"use client";

import React, { useState, useRef, useId, useCallback } from "react";
import {
  Upload,
  MapPin,
  FolderPlus,
  Play,
  Check,
  RotateCcw,
  Sparkles,
  Crop,
  Layers,
  Lock,
  Unlock,
  X,
} from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { usePanelStore } from "@/store/usePanelStore";
import { saveCustomCadToLibrary, updateCustomCadCloudId } from "@/lib/indexed-db";
import {
  STANDARD_COMPONENT_PRESETS,
  calculateAspectRatio,
  calculateHeightFromWidth,
  calculateWidthFromHeight,
  trimImageWhitespace,
  type ComponentDimensionPreset,
} from "@/lib/image-to-cad";
import type { CustomCadAsset, PinTerminal } from "@/types/panel";

interface ImageToCadModalProps {
  onClose: () => void;
}

export function ImageToCadModal({ onClose }: ImageToCadModalProps) {
  const { addCadAsset, setSelected } = usePanelStore();
  const patternId = useId();

  // File & Image state
  const [file, setFile] = useState<File | null>(null);
  const [rawImageDataUrl, setRawImageDataUrl] = useState<string | null>(null);
  const [trimmedDataUrl, setTrimmedDataUrl] = useState<string | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [componentName, setComponentName] = useState("");

  // Aspect ratio & auto-crop
  const [lockAspectRatio, setLockAspectRatio] = useState<boolean>(false);
  const [autoTrimWhitespace, setAutoTrimWhitespace] = useState<boolean>(true);
  const [colorTolerance, setColorTolerance] = useState<number>(35);
  const [rawAspectRatio, setRawAspectRatio] = useState<number>(1);
  const [trimmedAspectRatio, setTrimmedAspectRatio] = useState<number | null>(null);
  const [imageAspectRatio, setImageAspectRatio] = useState<number>(1);

  // Physical Dimensions (mm)
  const [widthMm, setWidthMm] = useState<number>(45);
  const [heightMm, setHeightMm] = useState<number>(85);
  const [depthMm, setDepthMm] = useState<number>(70);

  // Manual Crop Margins (mm)
  const [cropMm, setCropMm] = useState({ top: 0, bottom: 0, left: 0, right: 0 });
  const [showCropControls, setShowCropControls] = useState<boolean>(false);

  // Re-crop image when manual crop margins or image source change
  const applyCropAndTrim = useCallback(
    (
      sourceUrl: string,
      marginsMm: { top: number; right: number; bottom: number; left: number },
      wMm: number,
      hMm: number,
      tol: number = colorTolerance
    ) => {
      const img = new Image();
      img.onload = () => {
        const marginsPercent = {
          top: Math.min(45, (marginsMm.top / Math.max(1, hMm)) * 100),
          bottom: Math.min(45, (marginsMm.bottom / Math.max(1, hMm)) * 100),
          left: Math.min(45, (marginsMm.left / Math.max(1, wMm)) * 100),
          right: Math.min(45, (marginsMm.right / Math.max(1, wMm)) * 100),
        };

        try {
          const trim = trimImageWhitespace(img, {
            brightnessThreshold: 220,
            padding: 0,
            cropMarginsPercent: marginsPercent,
            colorTolerance: tol,
          });
          if (trim) {
            setPreviewDataUrl(trim.dataUrl);
            setImageAspectRatio(trim.aspectRatio);
          } else {
            setPreviewDataUrl(sourceUrl);
          }
        } catch {
          setPreviewDataUrl(sourceUrl);
        }
      };
      img.src = sourceUrl;
    },
    [colorTolerance]
  );

  // Wiring Pins
  const [pins, setPins] = useState<PinTerminal[]>([]);
  const [newPinLabel, setNewPinLabel] = useState<string>("L1");

  // Success states & Errors
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedToLibrarySuccess, setSavedToLibrarySuccess] = useState<boolean>(false);
  const [placedOnCanvasSuccess, setPlacedOnCanvasSuccess] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Handle file select
  const handleFile = (selectedFile: File) => {
    if (!selectedFile.type.startsWith("image/")) {
      setErrorMessage("Please upload an image file (PNG, JPG, WebP)");
      return;
    }
    setFile(selectedFile);
    const baseName = selectedFile.name.replace(/\.[^/.]+$/, "");
    setComponentName(baseName || "Custom Component");
    setErrorMessage(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      setRawImageDataUrl(url);

      const img = new Image();
      img.onload = () => {
        const rawW = img.naturalWidth || img.width;
        const rawH = img.naturalHeight || img.height;
        const rawRatio = calculateAspectRatio(rawW, rawH);
        setRawAspectRatio(rawRatio);

        let finalTrimmedUrl: string | null = null;
        let finalTrimmedRatio: number | null = null;
        try {
          const trim = trimImageWhitespace(img, {
            brightnessThreshold: 220,
            padding: 0,
            colorTolerance,
          });
          if (trim && (trim.trimmedWidth < rawW || trim.trimmedHeight < rawH)) {
            finalTrimmedUrl = trim.dataUrl;
            finalTrimmedRatio = trim.aspectRatio;
          }
        } catch {
          // ignore
        }

        setTrimmedDataUrl(finalTrimmedUrl);
        setTrimmedAspectRatio(finalTrimmedRatio);

        const effectiveRatio =
          autoTrimWhitespace && finalTrimmedRatio ? finalTrimmedRatio : rawRatio;
        setImageAspectRatio(effectiveRatio);

        const activeUrl =
          autoTrimWhitespace && finalTrimmedUrl ? finalTrimmedUrl : url;
        setPreviewDataUrl(activeUrl);

        const initW = 45;
        const initH = calculateHeightFromWidth(initW, effectiveRatio);
        setWidthMm(initW);
        setHeightMm(initH);
      };
      img.src = url;
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleWidthChange = (val: number) => {
    const nextW = Math.max(1, Math.round(val) || 1);
    setWidthMm(nextW);
    if (lockAspectRatio && imageAspectRatio > 0) {
      setHeightMm(calculateHeightFromWidth(nextW, imageAspectRatio));
    }
  };

  const handleHeightChange = (val: number) => {
    const nextH = Math.max(1, Math.round(val) || 1);
    setHeightMm(nextH);
    if (lockAspectRatio && imageAspectRatio > 0) {
      setWidthMm(calculateWidthFromHeight(nextH, imageAspectRatio));
    }
  };

  const handleToggleAutoTrim = (enabled: boolean) => {
    setAutoTrimWhitespace(enabled);
    const nextUrl = enabled && trimmedDataUrl ? trimmedDataUrl : rawImageDataUrl;
    if (nextUrl) {
      setPreviewDataUrl(nextUrl);
    }
    const nextRatio = enabled && trimmedAspectRatio ? trimmedAspectRatio : rawAspectRatio;
    setImageAspectRatio(nextRatio);
    if (lockAspectRatio && nextRatio > 0) {
      setHeightMm(calculateHeightFromWidth(widthMm, nextRatio));
    }
  };

  const handleApplyPreset = (preset: ComponentDimensionPreset) => {
    setWidthMm(preset.widthMm);
    setHeightMm(preset.heightMm);
    setDepthMm(preset.depthMm);
  };

  const handleResetToImageRatio = () => {
    const activeRatio =
      autoTrimWhitespace && trimmedAspectRatio ? trimmedAspectRatio : rawAspectRatio;
    if (activeRatio > 0) {
      setImageAspectRatio(activeRatio);
      setHeightMm(calculateHeightFromWidth(widthMm, activeRatio));
    }
  };

  // Interactive Pin Placement on Preview SVG
  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!previewDataUrl) return;
    const svgRect = e.currentTarget.getBoundingClientRect();
    if (svgRect.width <= 0 || svgRect.height <= 0) return;

    const clickX = e.clientX - svgRect.left;
    const clickY = e.clientY - svgRect.top;

    // Normalizing to Component Local mm (0,0 is center, x right, y up)
    const normX = (clickX / svgRect.width - 0.5) * widthMm;
    const normY = (0.5 - clickY / svgRect.height) * heightMm;

    const newPin: PinTerminal = {
      id: `pin-${Date.now()}-${pins.length + 1}`,
      label: newPinLabel.trim() || `P${pins.length + 1}`,
      localXMm: Number(normX.toFixed(2)),
      localYMm: Number(normY.toFixed(2)),
      localZMm: 0,
    };

    setPins((prev) => [...prev, newPin]);

    // Next suggested standard label
    const standardLabels = ["L1", "L2", "L3", "N", "PE", "13", "14", "21", "22", "A1", "A2"];
    const currIdx = standardLabels.indexOf(newPinLabel.trim());
    if (currIdx >= 0 && currIdx < standardLabels.length - 1) {
      setNewPinLabel(standardLabels[currIdx + 1]);
    }
  };

  const removePin = (pinId: string) => {
    setPins((prev) => prev.filter((p) => p.id !== pinId));
  };

  // Build CustomCadAsset
  const buildCustomCadAsset = (): CustomCadAsset => {
    const id = `cad-img-${Date.now()}`;
    const allZeroCrop =
      cropMm.top === 0 && cropMm.bottom === 0 && cropMm.left === 0 && cropMm.right === 0;

    return {
      id,
      name: componentName.trim() || "Image Component",
      fileName: file ? file.name : "component.png",
      format: "dxf",
      sourceUnit: "mm",
      xMm: 0,
      yMm: 0,
      zMm: (depthMm || 70) / 2,
      boundingBoxMm: {
        w: widthMm,
        h: heightMm,
        d: depthMm || 70,
      },
      cropMm: allZeroCrop ? undefined : cropMm,
      pins,
      rawText: "",
      dataUrl: previewDataUrl || undefined,
      imageOverlayUrl: previewDataUrl || undefined,
      showImageOverlay: true,
      imageOpacity: 1.0,
      lockAspectRatio,
      entityCount: 0,
    };
  };

  const handleSaveToLibrary = async () => {
    const asset = buildCustomCadAsset();
    try {
      const saved = await saveCustomCadToLibrary(asset);
      fetch("/api/custom-parts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: asset.name,
          format: asset.format,
          bounding_box: asset.cropMm
            ? { ...asset.boundingBoxMm, cropMm: asset.cropMm }
            : asset.boundingBoxMm,
          pins: asset.pins,
          cad_data: asset.rawText || asset.dataUrl || null,
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

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("panelflow:custom-library-updated"));
      }

      setSavedToLibrarySuccess(true);
      setTimeout(() => setSavedToLibrarySuccess(false), 2500);
    } catch {
      // ignore
    }
  };

  const handlePlaceOnCanvas = () => {
    const asset = buildCustomCadAsset();
    addCadAsset(asset);
    setSelected({ kind: "cad", id: asset.id });
    setPlacedOnCanvasSuccess(true);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const hasManualCrop =
    cropMm.top > 0 || cropMm.bottom > 0 || cropMm.left > 0 || cropMm.right > 0;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      maxWidthClassName="max-w-5xl"
      className="flex flex-col h-[90vh] max-h-[820px] p-0 overflow-hidden text-[#0f172a] dark:text-slate-100"
    >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#e2e8f0] dark:border-white/10 px-5 py-3.5 bg-[#f8fafc] dark:bg-[#161922] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-500">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-[#0f172a] dark:text-white">
                Image Component Creator
              </h2>
              <p className="text-[11px] text-[#64748b] dark:text-slate-400">
                Upload photo or datasheet, set physical dimensions, and place wiring terminals
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {previewDataUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Replace Image</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
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

        {/* Modal Body: Left Preview, Right Controls */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12">
          {/* Left Panel: Crisp Image Preview + Checkerboard Contrast */}
          <div className="md:col-span-7 lg:col-span-8 flex flex-col items-center justify-center p-4 bg-[#f8fafc] dark:bg-[#090b10] border-b md:border-b-0 md:border-r border-[#e2e8f0] dark:border-white/10 relative overflow-hidden">
            {!previewDataUrl ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const dropped = e.dataTransfer.files[0];
                  if (dropped) handleFile(dropped);
                }}
                className="flex flex-col items-center justify-center gap-3 w-full max-w-md h-80 rounded-2xl border-2 border-dashed border-[#cbd5e1] dark:border-white/20 bg-white dark:bg-[#141720] hover:border-sky-500 hover:bg-sky-500/5 transition-all cursor-pointer p-6 text-center"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-500">
                  <Upload className="h-7 w-7" />
                </div>
                <div>
                  <div className="font-semibold text-sm text-[#0f172a] dark:text-white">
                    Click to upload or drag image here
                  </div>
                  <div className="text-xs text-[#64748b] dark:text-slate-400 mt-1">
                    PNG, JPG, WebP (datasheet graphic, component photo)
                  </div>
                </div>
                {errorMessage && (
                  <div className="text-xs text-rose-500 font-medium">
                    {errorMessage}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center w-full h-full relative">
                {/* Checkerboard Container for clear transparency/contrast */}
                <div
                  className="relative max-h-[480px] max-w-full flex items-center justify-center rounded-xl border border-[#cbd5e1] dark:border-white/10 shadow-inner overflow-hidden p-3"
                  style={{
                    backgroundImage: `
                      linear-gradient(45deg, rgba(0, 0, 0, 0.05) 25%, transparent 25%),
                      linear-gradient(-45deg, rgba(0, 0, 0, 0.05) 25%, transparent 25%),
                      linear-gradient(45deg, transparent 75%, rgba(0, 0, 0, 0.05) 75%),
                      linear-gradient(-45deg, transparent 75%, rgba(0, 0, 0, 0.05) 75%)
                    `,
                    backgroundSize: "16px 16px",
                    backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
                    backgroundColor: "#f1f5f9",
                  }}
                >
                  {/* Aspect Ratio Box with direct HTML <img> and transparent SVG Overlay */}
                  <div
                    className="relative max-h-[440px] max-w-full flex items-center justify-center select-none"
                    style={{ aspectRatio: `${widthMm} / ${heightMm}` }}
                  >
                    {/* HTML <img> tag with object-fit: contain (instant 100% render, zero blank) */}
                    {previewDataUrl && (
                      <img
                        src={previewDataUrl}
                        alt={componentName || "Component Preview"}
                        className="w-full h-full object-contain pointer-events-none select-none"
                        style={{
                          clipPath: hasManualCrop
                            ? `inset(${((cropMm.top / heightMm) * 100).toFixed(2)}% ${((cropMm.right / widthMm) * 100).toFixed(2)}% ${((cropMm.bottom / heightMm) * 100).toFixed(2)}% ${((cropMm.left / widthMm) * 100).toFixed(2)}%)`
                            : undefined,
                        }}
                      />
                    )}

                    {/* Transparent SVG Overlay for grid, bounds, crop guides, and terminal pins */}
                    <svg
                      viewBox={`0 0 ${widthMm} ${heightMm}`}
                      className="absolute inset-0 w-full h-full cursor-crosshair select-none"
                      style={{ pointerEvents: "auto" }}
                      onClick={handleSvgClick}
                    >
                      <defs>
                        <pattern
                          id={`grid-${patternId}`}
                          width="10"
                          height="10"
                          patternUnits="userSpaceOnUse"
                        >
                          <path
                            d="M 10 0 L 0 0 0 10"
                            fill="none"
                            stroke="rgba(100, 116, 139, 0.25)"
                            strokeWidth="0.2"
                          />
                        </pattern>
                      </defs>

                      {/* Background Grid Lines */}
                      <rect
                        x="0"
                        y="0"
                        width={widthMm}
                        height={heightMm}
                        fill={`url(#grid-${patternId})`}
                      />

                      {/* Outer Bounding Box Stroke */}
                      <rect
                        x="0"
                        y="0"
                        width={widthMm}
                        height={heightMm}
                        fill="none"
                        stroke="#0284c7"
                        strokeWidth="0.4"
                        strokeDasharray="2,2"
                      />

                      {/* Manual Crop Guide Lines */}
                      {hasManualCrop && (
                        <rect
                          x={cropMm.left}
                          y={cropMm.top}
                          width={Math.max(1, widthMm - cropMm.left - cropMm.right)}
                          height={Math.max(1, heightMm - cropMm.top - cropMm.bottom)}
                          fill="none"
                          stroke="#f59e0b"
                          strokeWidth="0.5"
                          strokeDasharray="3,1.5"
                        />
                      )}

                      {/* Terminal Pins Markers */}
                      {pins.map((p) => {
                        // Map local center-origin coordinates (normX, normY) back to SVG 0..W, 0..H
                        const svgPinX = p.localXMm + widthMm / 2;
                        const svgPinY = heightMm / 2 - p.localYMm;
                        return (
                          <g key={p.id} transform={`translate(${svgPinX}, ${svgPinY})`}>
                            <circle
                              r="2"
                              fill="#f59e0b"
                              fillOpacity="0.35"
                              stroke="#f59e0b"
                              strokeWidth="0.4"
                            />
                            <line x1="-1.2" y1="0" x2="1.2" y2="0" stroke="#f59e0b" strokeWidth="0.3" />
                            <line x1="0" y1="-1.2" x2="0" y2="1.2" stroke="#f59e0b" strokeWidth="0.3" />
                            <text
                              x="2.6"
                              y="1.1"
                              fontSize="3"
                              fontWeight="bold"
                              fontFamily="monospace"
                              fill="#f59e0b"
                              stroke="#000000"
                              strokeWidth="0.4"
                              style={{ paintOrder: "stroke fill" }}
                            >
                              {p.label}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>

                {/* Bottom preview info */}
                <div className="flex items-center justify-between w-full max-w-md mt-2 px-1 text-[11px] text-[#64748b] dark:text-slate-400">
                  <div className="flex items-center gap-2 font-sans">
                    <span>{widthMm}×{heightMm} mm</span>
                    <span>•</span>
                    <span>{pins.length} pins</span>
                    {autoTrimWhitespace && trimmedDataUrl && (
                      <>
                        <span>•</span>
                        <span className="text-emerald-500 font-sans font-medium">Auto-Cropped</span>
                      </>
                    )}
                  </div>
                  <div className="text-[10px] text-amber-500 font-medium">
                    Click image to add pin
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Panel: Clean, Zero-Fluff Single Screen */}
          <div className="md:col-span-5 lg:col-span-4 p-5 flex flex-col justify-between overflow-y-auto bg-white dark:bg-[#111318]">
            <div className="space-y-4">
              {/* 1) Component Name */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#64748b] dark:text-slate-400">
                  Component Name
                </label>
                <input
                  type="text"
                  value={componentName}
                  onChange={(e) => setComponentName(e.target.value)}
                  placeholder="e.g. Fuji Electric SC-03 Contactor"
                  className="w-full rounded-lg border border-[#cbd5e1] dark:border-white/10 bg-[#f8fafc] dark:bg-[#161922] px-3 py-2 text-xs font-medium text-[#0f172a] dark:text-slate-100 focus:border-sky-500 focus:outline-none"
                />
              </div>

              {/* 2) Physical Dimensions (mm) */}
              <div className="space-y-2.5 rounded-xl border border-[#e2e8f0] dark:border-white/10 bg-[#f8fafc] dark:bg-[#161922] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[#0f172a] dark:text-slate-200">
                    Physical Dimensions (mm)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setLockAspectRatio(!lockAspectRatio)}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                        lockAspectRatio
                          ? "bg-sky-500/10 text-sky-500 border border-sky-500/20"
                          : "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 border border-[#cbd5e1] dark:border-white/10"
                      }`}
                      title={lockAspectRatio ? "Ratio Locked" : "Ratio Unlocked"}
                    >
                      {lockAspectRatio ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3 text-slate-400" />}
                      <span>{lockAspectRatio ? "Locked" : "Free"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleResetToImageRatio}
                      className="p-1 rounded text-[#64748b] hover:text-sky-500 transition-colors cursor-pointer"
                      title="Reset height to match image aspect ratio"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Independent W x H x D Inputs */}
                <div className="grid grid-cols-3 gap-2">
                  <label className="space-y-1">
                    <span className="text-[10px] text-[#64748b] dark:text-slate-400 font-medium">Width (W)</span>
                    <input
                      type="number"
                      min="5"
                      max="2000"
                      value={widthMm}
                      onChange={(e) => handleWidthChange(Number(e.target.value))}
                      className="w-full rounded-md border border-[#cbd5e1] dark:border-white/10 bg-white dark:bg-[#0c0e14] px-2.5 py-1.5 text-xs font-sans font-semibold"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] text-[#64748b] dark:text-slate-400 font-medium">Height (H)</span>
                    <input
                      type="number"
                      min="5"
                      max="2000"
                      value={heightMm}
                      onChange={(e) => handleHeightChange(Number(e.target.value))}
                      className="w-full rounded-md border border-[#cbd5e1] dark:border-white/10 bg-white dark:bg-[#0c0e14] px-2.5 py-1.5 text-xs font-sans font-semibold"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] text-[#64748b] dark:text-slate-400 font-medium">Depth (D)</span>
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      value={depthMm}
                      onChange={(e) => setDepthMm(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full rounded-md border border-[#cbd5e1] dark:border-white/10 bg-white dark:bg-[#0c0e14] px-2.5 py-1.5 text-xs font-sans font-semibold"
                    />
                  </label>
                </div>

                {/* 1-Row Quick Presets */}
                <div className="pt-2 border-t border-[#e2e8f0] dark:border-white/10">
                  <div className="text-[10px] text-[#64748b] dark:text-slate-400 font-medium mb-1.5">
                    Quick Presets:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {STANDARD_COMPONENT_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleApplyPreset(p)}
                        className="rounded-md bg-white dark:bg-[#0c0e14] border border-[#cbd5e1] dark:border-white/10 px-2 py-1 text-[10px] font-medium text-[#475569] dark:text-slate-300 hover:border-sky-500 hover:text-sky-500 transition-colors cursor-pointer"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 3) Auto-Crop & Manual Crop Sliders */}
              <div className="space-y-2 rounded-xl border border-[#e2e8f0] dark:border-white/10 bg-[#f8fafc] dark:bg-[#161922] p-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoTrimWhitespace}
                      onChange={(e) => handleToggleAutoTrim(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-[#cbd5e1] text-sky-500 focus:ring-sky-500 cursor-pointer"
                    />
                    <span className="text-[11px] font-semibold text-[#0f172a] dark:text-slate-200 flex items-center gap-1">
                      <Crop className="h-3 w-3 text-slate-600 dark:text-zinc-400" />
                      Auto-Crop Whitespace & Shadows
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={() => setShowCropControls(!showCropControls)}
                    className="text-[10px] text-sky-500 hover:underline font-medium cursor-pointer"
                  >
                    {showCropControls ? "Hide Manual Margins" : "Manual Crop Margins"}
                  </button>
                </div>

                {showCropControls && (
                  <div className="pt-2 space-y-3 border-t border-[#e2e8f0] dark:border-white/10">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-[#64748b] dark:text-slate-400 font-medium">
                          Shadow & Background Tolerance
                        </span>
                        <span className="font-sans text-sky-500 font-semibold">{colorTolerance}</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="80"
                        value={colorTolerance}
                        onChange={(e) => {
                          const tol = Number(e.target.value) || 35;
                          setColorTolerance(tol);
                          if (rawImageDataUrl) applyCropAndTrim(rawImageDataUrl, cropMm, widthMm, heightMm, tol);
                        }}
                        className="w-full h-1.5 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-sky-500"
                      />
                    </div>

                    <p className="text-[10px] text-[#64748b] dark:text-slate-400">
                      Crop text, catalog tables, or margins (mm):
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      <label className="space-y-0.5">
                        <span className="text-[9px] text-[#64748b]">Top (mm)</span>
                        <input
                          type="number"
                          min="0"
                          max={Math.max(0, heightMm - 1)}
                          value={cropMm.top}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            const next = { ...cropMm, top: val };
                            setCropMm(next);
                            if (rawImageDataUrl) applyCropAndTrim(rawImageDataUrl, next, widthMm, heightMm);
                          }}
                          className="w-full rounded border border-[#cbd5e1] dark:border-white/10 bg-white dark:bg-[#0c0e14] px-1.5 py-1 text-[11px] font-sans"
                        />
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[9px] text-[#64748b]">Bottom (mm)</span>
                        <input
                          type="number"
                          min="0"
                          max={Math.max(0, heightMm - 1)}
                          value={cropMm.bottom}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            const next = { ...cropMm, bottom: val };
                            setCropMm(next);
                            if (rawImageDataUrl) applyCropAndTrim(rawImageDataUrl, next, widthMm, heightMm);
                          }}
                          className="w-full rounded border border-[#cbd5e1] dark:border-white/10 bg-white dark:bg-[#0c0e14] px-1.5 py-1 text-[11px] font-sans"
                        />
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[9px] text-[#64748b]">Left (mm)</span>
                        <input
                          type="number"
                          min="0"
                          max={Math.max(0, widthMm - 1)}
                          value={cropMm.left}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            const next = { ...cropMm, left: val };
                            setCropMm(next);
                            if (rawImageDataUrl) applyCropAndTrim(rawImageDataUrl, next, widthMm, heightMm);
                          }}
                          className="w-full rounded border border-[#cbd5e1] dark:border-white/10 bg-white dark:bg-[#0c0e14] px-1.5 py-1 text-[11px] font-sans"
                        />
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[9px] text-[#64748b]">Right (mm)</span>
                        <input
                          type="number"
                          min="0"
                          max={Math.max(0, widthMm - 1)}
                          value={cropMm.right}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            const next = { ...cropMm, right: val };
                            setCropMm(next);
                            if (rawImageDataUrl) applyCropAndTrim(rawImageDataUrl, next, widthMm, heightMm);
                          }}
                          className="w-full rounded border border-[#cbd5e1] dark:border-white/10 bg-white dark:bg-[#0c0e14] px-1.5 py-1 text-[11px] font-sans"
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* 4) Wiring Terminal Pins */}
              <div className="space-y-2 rounded-xl border border-[#e2e8f0] dark:border-white/10 bg-[#f8fafc] dark:bg-[#161922] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[#0f172a] dark:text-slate-200 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                    Wiring Terminal Pins
                  </span>
                  <span className="text-[10px] font-sans text-amber-600 dark:text-amber-400 font-semibold">
                    {pins.length} placed
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newPinLabel}
                    onChange={(e) => setNewPinLabel(e.target.value)}
                    placeholder="Pin label (L1, L2, A1...)"
                    className="flex-1 rounded-md border border-[#cbd5e1] dark:border-white/10 bg-white dark:bg-[#0c0e14] px-2.5 py-1.5 text-xs font-sans font-semibold text-amber-500 focus:outline-none focus:border-amber-500"
                  />
                  <span className="text-[10px] text-[#64748b] dark:text-slate-400">
                    Click image to place
                  </span>
                </div>

                {/* Placed Pins List */}
                {pins.length > 0 && (
                  <div className="space-y-1 max-h-24 overflow-y-auto pt-1">
                    {pins.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-md border border-[#e2e8f0] dark:border-white/10 bg-white dark:bg-[#0c0e14] px-2 py-1 text-xs"
                      >
                        <span className="font-sans font-bold text-amber-500">{p.label}</span>
                        <span className="font-sans text-[10px] text-[#64748b]">
                          ({p.localXMm}, {p.localYMm})
                        </span>
                        <button
                          type="button"
                          onClick={() => removePin(p.id)}
                          className="text-[#94a3b8] hover:text-rose-500 transition-colors cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions: Place on Canvas & Save to Library */}
            <div className="pt-4 border-t border-[#e2e8f0] dark:border-white/10 space-y-2">
              <Button
                variant="primary"
                size="md"
                disabled={!previewDataUrl}
                onClick={handlePlaceOnCanvas}
                className="w-full py-2.5 font-semibold"
              >
                {placedOnCanvasSuccess ? (
                  <Check className="h-4 w-4 text-slate-600 dark:text-zinc-400" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                <span>Place on Canvas</span>
              </Button>

              <Button
                variant="outline"
                size="md"
                disabled={!previewDataUrl}
                onClick={handleSaveToLibrary}
                className="w-full"
              >
                {savedToLibrarySuccess ? (
                  <Check className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                ) : (
                  <FolderPlus className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                )}
                <span>Save to Library</span>
              </Button>
            </div>
          </div>
        </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
        className="hidden"
      />
    </Modal>
  );
}
