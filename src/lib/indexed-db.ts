import type {
  CustomCadAsset,
  GridSnapMm,
  LengthUnit,
  PanelSheet,
  TitleBlockMeta,
} from "@/types/panel";

export const LOCAL_AUTOSAVE_KEY = "panelflow_autosave_v1";

const DB_NAME = "panelflow_db";
const DB_VERSION = 1;
const STORE_AUTOSAVE = "autosave";
const STORE_CUSTOM_LIBRARY = "custom_cad_library";

export interface CustomLibraryCadItem {
  id: string;
  name: string;
  fileName: string;
  format: CustomCadAsset["format"];
  sourceUnit: CustomCadAsset["sourceUnit"];
  boundingBoxMm: { w: number; h: number; d: number };
  cropMm?: CustomCadAsset["cropMm"];
  pins: CustomCadAsset["pins"];
  rawText?: string;
  dataUrl?: string;
  imageOverlayUrl?: string;
  showImageOverlay?: boolean;
  imageOpacity?: number;
  lockAspectRatio?: boolean;
  materialType?: CustomCadAsset["materialType"];
  drawShape?: CustomCadAsset["drawShape"];
  entityCount?: number;
  parseWarning?: string;
  cloudId?: string;
  createdAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable in current runtime"));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_AUTOSAVE)) {
          db.createObjectStore(STORE_AUTOSAVE);
        }
        if (!db.objectStoreNames.contains(STORE_CUSTOM_LIBRARY)) {
          db.createObjectStore(STORE_CUSTOM_LIBRARY, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

// ── Autosave session snapshot ───────────────────────────────────────────────
export interface AutoSaveSnapshot {
  sheets: PanelSheet[];
  activeSheetId: string;
  displayUnit?: LengthUnit;
  gridSnapMm?: GridSnapMm;
  autoRouteDuctsEnabled?: boolean;
  showPinLabels?: boolean;
  titleBlock?: TitleBlockMeta;
  savedAt: number;
}

function stripTransientUrls(sheets: PanelSheet[]): PanelSheet[] {
  return sheets.map((sheet) => ({
    ...sheet,
    cadAssets: sheet.cadAssets.map((asset) => {
      const { objectUrl: _omitted, ...rest } = asset;
      return rest;
    }),
  }));
}

export function saveLocalAutoSave(
  sheets: PanelSheet[],
  activeSheetId: string,
  meta?: {
    displayUnit?: LengthUnit;
    gridSnapMm?: GridSnapMm;
    autoRouteDuctsEnabled?: boolean;
    showPinLabels?: boolean;
    titleBlock?: TitleBlockMeta;
  }
): void {
  if (typeof window === "undefined") return;
  const snapshot: AutoSaveSnapshot = {
    sheets: stripTransientUrls(sheets),
    activeSheetId,
    displayUnit: meta?.displayUnit,
    gridSnapMm: meta?.gridSnapMm,
    autoRouteDuctsEnabled: meta?.autoRouteDuctsEnabled,
    showPinLabels: meta?.showPinLabels,
    titleBlock: meta?.titleBlock,
    savedAt: Date.now(),
  };
  try {
    window.localStorage.setItem(LOCAL_AUTOSAVE_KEY, JSON.stringify(snapshot));
  } catch {
    // Quota exceeded (e.g. large CAD/image dataUrl): save lightweight layout without binary blobs
    try {
      const lightSheets = snapshot.sheets.map((s) => ({
        ...s,
        cadAssets: s.cadAssets.map((a) => ({
          ...a,
          dataUrl: undefined,
          imageOverlayUrl: undefined,
        })),
      }));
      window.localStorage.setItem(
        LOCAL_AUTOSAVE_KEY,
        JSON.stringify({ ...snapshot, sheets: lightSheets })
      );
    } catch {
      // localStorage unavailable or full
    }
  }
}

export function loadLocalAutoSave(): AutoSaveSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AutoSaveSnapshot;
    if (!parsed || !Array.isArray(parsed.sheets) || parsed.sheets.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveAutoSaveSession(
  sheets: PanelSheet[],
  activeSheetId: string,
  meta?: {
    displayUnit?: LengthUnit;
    gridSnapMm?: GridSnapMm;
    autoRouteDuctsEnabled?: boolean;
    showPinLabels?: boolean;
    titleBlock?: TitleBlockMeta;
  }
): Promise<void> {
  const db = await getDb();
  const snapshot: AutoSaveSnapshot = {
    sheets: stripTransientUrls(sheets),
    activeSheetId,
    displayUnit: meta?.displayUnit,
    gridSnapMm: meta?.gridSnapMm,
    autoRouteDuctsEnabled: meta?.autoRouteDuctsEnabled,
    showPinLabels: meta?.showPinLabels,
    titleBlock: meta?.titleBlock,
    savedAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AUTOSAVE, "readwrite");
    const store = tx.objectStore(STORE_AUTOSAVE);
    const req = store.put(snapshot, "panelflow_autosave");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function loadAutoSaveSession(): Promise<AutoSaveSnapshot | null> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AUTOSAVE, "readonly");
    const store = tx.objectStore(STORE_AUTOSAVE);
    const req = store.get("panelflow_autosave");
    req.onsuccess = () => {
      resolve((req.result as AutoSaveSnapshot) || null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function clearAutoSaveSession(): Promise<void> {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(LOCAL_AUTOSAVE_KEY);
    } catch {
      // ignore storage error
    }
  }
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AUTOSAVE, "readwrite");
    const store = tx.objectStore(STORE_AUTOSAVE);
    const req = store.delete("panelflow_autosave");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ── Custom CAD Library ──────────────────────────────────────────────────────
export async function saveCustomCadToLibrary(
  asset: CustomCadAsset
): Promise<CustomLibraryCadItem> {
  const db = await getDb();
  const item: CustomLibraryCadItem = {
    id: asset.id,
    name: asset.name,
    fileName: asset.fileName,
    format: asset.format,
    sourceUnit: asset.sourceUnit,
    boundingBoxMm: { ...asset.boundingBoxMm },
    cropMm: asset.cropMm ? { ...asset.cropMm } : undefined,
    pins: asset.pins.map((p) => ({ ...p })),
    rawText: asset.rawText,
    dataUrl: asset.dataUrl,
    imageOverlayUrl: asset.imageOverlayUrl,
    showImageOverlay: asset.showImageOverlay,
    imageOpacity: asset.imageOpacity,
    lockAspectRatio: asset.lockAspectRatio,
    materialType: asset.materialType,
    drawShape: asset.drawShape,
    entityCount: asset.entityCount,
    parseWarning: asset.parseWarning,
    createdAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CUSTOM_LIBRARY, "readwrite");
    const store = tx.objectStore(STORE_CUSTOM_LIBRARY);
    const req = store.put(item);
    req.onsuccess = () => resolve(item);
    req.onerror = () => reject(req.error);
  });
}

export async function listCustomCadLibrary(): Promise<CustomLibraryCadItem[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CUSTOM_LIBRARY, "readonly");
    const store = tx.objectStore(STORE_CUSTOM_LIBRARY);
    const req = store.getAll();
    req.onsuccess = () => {
      resolve((req.result as CustomLibraryCadItem[]) || []);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function removeCustomCadFromLibrary(id: string): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CUSTOM_LIBRARY, "readwrite");
    const store = tx.objectStore(STORE_CUSTOM_LIBRARY);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function renameCustomCadInLibrary(
  id: string,
  newName: string
): Promise<CustomLibraryCadItem | null> {
  const trimmed = newName.trim();
  if (!trimmed) {
    throw new Error("Name cannot be empty");
  }

  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CUSTOM_LIBRARY, "readwrite");
    const store = tx.objectStore(STORE_CUSTOM_LIBRARY);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const existing = getReq.result as CustomLibraryCadItem | undefined;
      if (!existing) {
        resolve(null);
        return;
      }

      const updated: CustomLibraryCadItem = {
        ...existing,
        name: trimmed,
      };

      const putReq = store.put(updated);
      putReq.onsuccess = () => resolve(updated);
      putReq.onerror = () => reject(putReq.error);
    };

    getReq.onerror = () => reject(getReq.error);
  });
}

export async function updateCustomCadCloudId(
  id: string,
  cloudId: string
): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CUSTOM_LIBRARY, "readwrite");
    const store = tx.objectStore(STORE_CUSTOM_LIBRARY);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result as CustomLibraryCadItem | undefined;
      if (!existing) {
        resolve();
        return;
      }
      const putReq = store.put({ ...existing, cloudId });
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}
