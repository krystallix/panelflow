import { useEffect, useState } from "react";
import { parseDxfToMmSegments, type ParsedDxfGeometry } from "@/lib/dxf-parser";
import type { ComponentTemplateId } from "@/types/panel";

export interface BuiltinDxfModel {
  parsed: ParsedDxfGeometry;
  /** Centered SVG path string in DXF mm coordinates (Y-up; flip Y via SVG scale(sx, -sy)). */
  svgPath: string;
}

const BUILTIN_DXF_URLS: Partial<Record<ComponentTemplateId, string>> = {
  contactor: "/cad/LC1D09/MCADPP0003369_2D-front.dxf",
  tor: "/cad/LRD10/MCADPD0004675_2D-front.dxf",
};

const modelCache = new Map<ComponentTemplateId, BuiltinDxfModel>();
const inflightCache = new Map<ComponentTemplateId, Promise<BuiltinDxfModel | null>>();

function buildSvgPath(parsed: ParsedDxfGeometry): string {
  const parts: string[] = [];
  for (const s of parsed.segments) {
    parts.push(
      `M${s.x1.toFixed(2)} ${s.y1.toFixed(2)}L${s.x2.toFixed(2)} ${s.y2.toFixed(2)}`
    );
  }
  return parts.join("");
}

export async function loadBuiltinDxfModel(
  templateId: ComponentTemplateId
): Promise<BuiltinDxfModel | null> {
  const cached = modelCache.get(templateId);
  if (cached) return cached;

  const url = BUILTIN_DXF_URLS[templateId];
  if (!url || typeof window === "undefined") return null;

  const existing = inflightCache.get(templateId);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const rawText = await res.text();
      const parsed = parseDxfToMmSegments(rawText, "mm");
      if (parsed.segments.length === 0) return null;
      const model: BuiltinDxfModel = {
        parsed,
        svgPath: buildSvgPath(parsed),
      };
      modelCache.set(templateId, model);
      return model;
    } catch {
      return null;
    } finally {
      inflightCache.delete(templateId);
    }
  })();

  inflightCache.set(templateId, promise);
  return promise;
}

/**
 * Loads and caches the real Schneider DXF geometry for built-in internal
 * library components (`contactor` -> LC1D09, `tor` -> LRD10).
 */
export function useBuiltinDxfModel(
  templateId: ComponentTemplateId
): BuiltinDxfModel | null {
  const [model, setModel] = useState<BuiltinDxfModel | null>(
    () => modelCache.get(templateId) ?? null
  );

  useEffect(() => {
    let cancelled = false;
    const cached = modelCache.get(templateId);
    if (cached) {
      setModel(cached);
      return;
    }
    if (!BUILTIN_DXF_URLS[templateId]) {
      setModel(null);
      return;
    }
    loadBuiltinDxfModel(templateId).then((loaded) => {
      if (!cancelled && loaded) {
        setModel(loaded);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  return model;
}
