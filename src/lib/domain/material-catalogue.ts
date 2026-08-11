/** Presentation-only rules for the Xero-owned material catalogue. */
export interface MaterialCatalogueGroupEntry {
  materialId: string;
  /** Short label shown after the group name, e.g. "2.5" for Wall Wrap. */
  label: string;
}

export interface MaterialCatalogueGroup {
  id: string;
  name: string;
  entries: MaterialCatalogueGroupEntry[];
}

export interface MaterialCataloguePresentation {
  /** Xero items hidden from application pickers only. */
  hiddenMaterialIds: string[];
  /** Optional UI-only quote groups mapped to existing Xero items. */
  groups: MaterialCatalogueGroup[];
}

export const EMPTY_MATERIAL_CATALOGUE_PRESENTATION: MaterialCataloguePresentation = {
  hiddenMaterialIds: [],
  groups: [],
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Normalises untrusted JSON from the settings blob or a client form. */
export function normaliseMaterialCataloguePresentation(value: unknown): MaterialCataloguePresentation {
  if (!value || typeof value !== "object") return { ...EMPTY_MATERIAL_CATALOGUE_PRESENTATION };
  const raw = value as { hiddenMaterialIds?: unknown; groups?: unknown };
  const hiddenMaterialIds = Array.isArray(raw.hiddenMaterialIds)
    ? [...new Set(raw.hiddenMaterialIds.map(text).filter(Boolean))]
    : [];
  const usedMaterialIds = new Set<string>();
  const groups = Array.isArray(raw.groups)
    ? raw.groups.flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object") return [];
      const group = candidate as { id?: unknown; name?: unknown; entries?: unknown };
      const id = text(group.id);
      const name = text(group.name);
      if (!id || !name) return [];
      const entries = Array.isArray(group.entries)
        ? group.entries.flatMap((entry) => {
          if (!entry || typeof entry !== "object") return [];
          const rawEntry = entry as { materialId?: unknown; label?: unknown };
          const materialId = text(rawEntry.materialId);
          if (!materialId || usedMaterialIds.has(materialId)) return [];
          usedMaterialIds.add(materialId);
          return [{ materialId, label: text(rawEntry.label) }];
        })
        : [];
      return [{ id, name, entries }];
    })
    : [];
  return { hiddenMaterialIds, groups };
}
