use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileItem {
    pub name: String,
    pub full_path: String,
    pub size_bytes: u64,
    pub modified_ms: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ModelFormats {
    pub threemf: Vec<FileItem>,
    pub stp: Vec<FileItem>,
    pub stl: Vec<FileItem>,
    pub obj: Vec<FileItem>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FilamentUsage {
    pub slot_id: usize,
    pub hex: String,
    pub material_type: String,
    pub preset_name: String,
    pub official_name: String,
    pub bambu_code: String,
    #[serde(default)]
    pub used_grams: Option<f32>,
    pub source_3mf: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelEntry {
    pub id: String,
    pub name: String,
    pub folder_path: String,
    pub preview_images: Vec<String>,
    #[serde(default)]
    pub preview_image_sources: Vec<Option<String>>,
    pub formats: ModelFormats,
    pub filaments: Vec<FilamentUsage>,
    pub last_modified_ms: u64,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub print_time_sec: Option<u64>,
    #[serde(default)]
    pub total_weight_g: Option<f32>,
    #[serde(default)]
    pub nozzle_mm: Option<String>,
    #[serde(default)]
    pub bed_type: Option<String>,
    #[serde(default)]
    pub file_specs: std::collections::HashMap<String, FileSpecs>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FileSpecs {
    #[serde(default)]
    pub print_time_sec: Option<u64>,
    #[serde(default)]
    pub total_weight_g: Option<f32>,
    #[serde(default)]
    pub nozzle_mm: Option<String>,
    #[serde(default)]
    pub bed_type: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ModelSpecsFileItem {
    #[serde(default)]
    pub print_time_sec: Option<u64>,
    #[serde(default)]
    pub weight_g: Option<f32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ModelSpecs {
    #[serde(default)]
    pub files: std::collections::HashMap<String, ModelSpecsFileItem>,
    #[serde(default)]
    pub total_print_time_sec: Option<u64>,
    #[serde(default)]
    pub total_weight_g: Option<f32>,
}

