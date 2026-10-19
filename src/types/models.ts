export interface FileItem {
  name: string;
  full_path: string;
  size_bytes: number;
  modified_ms: number;
}

export interface ModelFormats {
  threemf: FileItem[];
  stp: FileItem[];
  stl: FileItem[];
  obj: FileItem[];
}

export interface FilamentUsage {
  slot_id: number;
  hex: string;
  material_type: string;
  preset_name: string;
  official_name: string;
  bambu_code: string;
  used_grams?: number;
  source_3mf: string;
}

export interface TagDefinition {
  id: string;
  label: string;
  icon: string;
  color: string;
}

export interface AppConfig {
  root_path: string;
  bambu_studio_exe_path: string;
  default_cost_per_kg: number;
  currency_symbol: string;
  last_updated_by: string;
  available_tags: TagDefinition[];
}

export interface ModelEntry {
  id: string;
  name: string;
  folder_path: string;
  preview_images: string[];
  preview_image_sources?: (string | null)[];
  formats: ModelFormats;
  filaments: FilamentUsage[];
  last_modified_ms: number;
  tags?: string[];
  print_time_sec?: number | null;
  total_weight_g?: number | null;
  nozzle_mm?: string | null;
  bed_type?: string | null;
  file_specs?: Record<string, FileSpecs>;
}

export interface FileSpecs {
  print_time_sec?: number | null;
  total_weight_g?: number | null;
  nozzle_mm?: string | null;
  bed_type?: string | null;
}

