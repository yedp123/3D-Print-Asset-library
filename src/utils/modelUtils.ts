import { ModelEntry, FilamentUsage } from '../types/models';

/**
 * Resolves the 3MF filename corresponding to a preview image at `imageIndex`.
 */
export function resolve3mfForImage(
  imagePath: string | undefined,
  imageIndex: number,
  model: ModelEntry
): string | null {
  if (!model) return null;

  // 1. Check if the model explicitly has preview_image_sources from Rust backend
  if (
    model.preview_image_sources &&
    imageIndex >= 0 &&
    imageIndex < model.preview_image_sources.length
  ) {
    const directSource = model.preview_image_sources[imageIndex];
    if (directSource) return directSource;
  }

  // 2. If the model has exactly one 3MF file, any thumbnail/preview is for that 3MF
  if (model.formats.threemf.length === 1) {
    return model.formats.threemf[0].name;
  }

  if (!imagePath || model.formats.threemf.length === 0) {
    return null;
  }

  // 3. Normalize path separators to search for matching stem
  const normalized = imagePath.replace(/\\/g, '/');
  const filename = normalized.split('/').pop() || '';

  let bestMatch: string | null = null;
  let bestMatchLen = 0;

  for (const item of model.formats.threemf) {
    const stem = item.name.replace(/\.3mf$/i, '');
    const cleanStem = stem.replace(
      /[^a-zA-Z0-9_\-\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g,
      '_'
    );

    if (
      filename.includes(stem) ||
      filename.includes(cleanStem) ||
      normalized.includes(stem)
    ) {
      if (stem.length > bestMatchLen) {
        bestMatch = item.name;
        bestMatchLen = stem.length;
      }
    }
  }

  if (bestMatch) {
    return bestMatch;
  }

  // 4. Fallback based on thumbnail ordering
  const nonThumbCount = (model.preview_images || []).filter(
    (p) => !p.includes('.thumbnails') && !p.toLowerCase().includes('plate')
  ).length;

  if (imageIndex >= nonThumbCount) {
    const thumbIdx = imageIndex - nonThumbCount;
    if (thumbIdx < model.formats.threemf.length) {
      return model.formats.threemf[thumbIdx].name;
    }
  }

  return null;
}

/**
 * Returns deduplicated filaments for the currently active preview image.
 * If the image corresponds to a specific 3MF, filters by that 3MF.
 */
export function getFilamentsForImage(
  imagePath: string | undefined,
  imageIndex: number,
  model: ModelEntry
): FilamentUsage[] {
  if (!model.filaments || model.filaments.length === 0) return [];

  const target3mf = resolve3mfForImage(imagePath, imageIndex, model);

  let rawList: FilamentUsage[] = model.filaments;
  if (target3mf) {
    const matched = model.filaments.filter(
      (f) => f.source_3mf.toLowerCase() === target3mf.toLowerCase()
    );
    if (matched.length > 0) {
      rawList = matched;
    }
  }

  // Deduplicate by official name & code so duplicates (like duplicate Desert Tan) never appear
  const seen = new Set<string>();
  const unique: FilamentUsage[] = [];

  for (const f of rawList) {
    const key = `${f.official_name.trim().toLowerCase()}-${(f.bambu_code || '').trim().toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(f);
    }
  }

  return unique;
}

/**
 * Formats filament label with code in parentheses: e.g. "Desert Tan (11801)"
 */
export function formatFilamentLabel(f: FilamentUsage): string {
  if (f.bambu_code && f.bambu_code !== 'Custom') {
    return `${f.official_name} (${f.bambu_code})`;
  }
  return f.official_name;
}

/**
 * Formats print time from seconds into "Xh Ym" or "Ym". Returns "--" if not available.
 */
export function formatPrintTime(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return '--';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

/**
 * Computes total grams either from total_weight_g or by summing filament used_grams.
 */
export function computeTotalGrams(
  totalWeightG?: number | null,
  filaments?: { used_grams?: number | null }[]
): number | null {
  if (totalWeightG !== undefined && totalWeightG !== null && totalWeightG > 0) {
    return totalWeightG;
  }
  const sum = (filaments || []).reduce((acc, f) => acc + (f.used_grams || 0), 0);
  return sum > 0 ? sum : null;
}

/**
 * Calculates estimated material cost based on weight in grams and cost per kg.
 */
export function calculateCost(
  grams: number | null,
  costPerKg: number = 85.0
): number | null {
  if (!grams || grams <= 0) return null;
  return (grams / 1000.0) * costPerKg;
}

/**
 * Strips redundant "Plate" suffix from bed type (e.g. "Textured PEI Plate" -> "Textured PEI").
 */
export function formatBedType(bedType?: string | null): string | null {
  if (!bedType) return null;
  return bedType.replace(/\s*Plate\s*$/i, '').trim() || bedType;
}

export interface Resolved3mfMetrics {
  printTimeSec: number | null;
  totalGrams: number | null;
  nozzleMm: string | null;
  bedType: string | null;
  active3mfName: string | null;
  isSpecific3mf: boolean;
}

/**
 * Returns 3MF-specific metrics (print time, weight, nozzle, bed type) for the active preview image.
 * When a model has several 3MF files, this resolves to the specific 3MF corresponding to the active plate image.
 */
export function getMetricsForImage(
  imagePath: string | undefined,
  imageIndex: number,
  model: ModelEntry
): Resolved3mfMetrics {
  if (!model) {
    return {
      printTimeSec: null,
      totalGrams: null,
      nozzleMm: null,
      bedType: null,
      active3mfName: null,
      isSpecific3mf: false,
    };
  }

  const active3mf = resolve3mfForImage(imagePath, imageIndex, model);

  if (active3mf && model.file_specs) {
    const matchKey = Object.keys(model.file_specs).find(
      (k) => k.toLowerCase() === active3mf.toLowerCase()
    );
    if (matchKey && model.file_specs[matchKey]) {
      const spec = model.file_specs[matchKey];
      let weight = spec.total_weight_g ?? null;
      if (weight === null || weight <= 0) {
        const filGrams = (model.filaments || [])
          .filter((f) => f.source_3mf.toLowerCase() === active3mf.toLowerCase())
          .reduce((acc, f) => acc + (f.used_grams || 0), 0);
        if (filGrams > 0) weight = filGrams;
      }

      return {
        printTimeSec: spec.print_time_sec ?? null,
        totalGrams: weight,
        nozzleMm: spec.nozzle_mm ?? model.nozzle_mm ?? null,
        bedType: spec.bed_type ?? model.bed_type ?? null,
        active3mfName: active3mf,
        isSpecific3mf: true,
      };
    }
  }

  if (active3mf) {
    const filGrams = (model.filaments || [])
      .filter((f) => f.source_3mf.toLowerCase() === active3mf.toLowerCase())
      .reduce((acc, f) => acc + (f.used_grams || 0), 0);

    return {
      printTimeSec: model.print_time_sec ?? null,
      totalGrams: filGrams > 0 ? filGrams : (model.total_weight_g ?? null),
      nozzleMm: model.nozzle_mm ?? null,
      bedType: model.bed_type ?? null,
      active3mfName: active3mf,
      isSpecific3mf: true,
    };
  }

  // Fallback to model combined totals
  return {
    printTimeSec: model.print_time_sec ?? null,
    totalGrams: computeTotalGrams(model.total_weight_g, model.filaments),
    nozzleMm: model.nozzle_mm ?? null,
    bedType: model.bed_type ?? null,
    active3mfName: null,
    isSpecific3mf: false,
  };
}

/**
 * Returns model QA status ('approved' | 'needs_fix' | null) from tags.
 */
export function getModelStatus(tags?: string[]): 'approved' | 'needs_fix' | null {
  if (!tags) return null;
  const lower = tags.map((t) => t.toLowerCase());
  if (lower.includes('status_approved')) return 'approved';
  if (lower.includes('status_needs_fix')) return 'needs_fix';
  return null;
}

/**
 * Checks if model has VIP status from tags.
 */
export function isModelVip(tags?: string[]): boolean {
  if (!tags) return false;
  return tags.some((t) => t.toLowerCase() === 'status_vip');
}

/**
 * Returns display tags (tags array with status_* stripped).
 */
export function getDisplayTags(tags?: string[]): string[] {
  if (!tags) return [];
  return tags.filter((t) => !t.toLowerCase().startsWith('status_'));
}
