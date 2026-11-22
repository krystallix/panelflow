import type { ComponentTemplateId, CustomCadAsset } from "@/types/panel";
import type { CustomLibraryCadItem } from "@/lib/indexed-db";

export const PANELFLOW_PART_DRAG_MIME = "application/x-panelflow-part";

export type PartDragPayload =
  | { kind: "component"; templateId: ComponentTemplateId }
  | { kind: "cad_library"; libraryId: string };

let draggedCadLibraryItem: CustomLibraryCadItem | null = null;

/** Stores the dragged custom CAD library item in memory during HTML5 drag. */
export function setDraggedCadLibraryItem(item: CustomLibraryCadItem | null): void {
  draggedCadLibraryItem = item;
}

/** Reads and clears the dragged custom CAD library item on drop. */
export function consumeDraggedCadLibraryItem(): CustomLibraryCadItem | null {
  const item = draggedCadLibraryItem;
  draggedCadLibraryItem = null;
  return item;
}

/** Instantiates a CustomCadAsset from a saved My CAD Library item. */
export function buildCadAssetFromLibraryItem(
  item: CustomLibraryCadItem,
  pos?: { xMm: number; yMm: number }
): CustomCadAsset {
  const uid = `cad-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    id: uid,
    name: item.name,
    fileName: item.fileName,
    format: item.format,
    sourceUnit: item.sourceUnit,
    xMm: pos?.xMm ?? 0,
    yMm: pos?.yMm ?? 0,
    zMm: Math.max(10, item.boundingBoxMm.d / 2),
    boundingBoxMm: { ...item.boundingBoxMm },
    cropMm: item.cropMm ? { ...item.cropMm } : undefined,
    pins: item.pins.map((p, idx) => ({
      ...p,
      id: `${uid}-pin-${idx + 1}`,
    })),
    rawText: item.rawText,
    dataUrl: item.dataUrl,
    objectUrl: item.dataUrl,
    imageOverlayUrl: item.imageOverlayUrl,
    showImageOverlay: item.showImageOverlay,
    imageOpacity: item.imageOpacity,
    lockAspectRatio: item.lockAspectRatio,
    materialType: item.materialType,
    drawShape: item.drawShape,
    entityCount: item.entityCount,
    parseWarning: item.parseWarning,
  };
}
