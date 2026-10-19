use crate::config::{clean_path_str, get_app_base_dir};
use crate::models::{FilamentUsage, ModelEntry};
use roxmltree::Document;
use serde::Deserialize;
use std::fs::{self, File};
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Deserialize)]
pub struct FilamentCatalogEntry {
    pub vendor: String,
    pub series: String,
    pub name: String,
    pub code: String,
    pub hex: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FilamentCatalog {
    pub version: String,
    pub filaments: Vec<FilamentCatalogEntry>,
}

/// Loads `filament_catalog.json` from `get_app_base_dir()`.
pub fn load_filament_catalog() -> Option<FilamentCatalog> {
    let base_dir = get_app_base_dir().ok()?;
    let catalog_path = base_dir.join("filament_catalog.json");
    let content = fs::read_to_string(&catalog_path).ok()?;
    serde_json::from_str(&content).ok()
}

/// Parses a `#RRGGBB` or `#RRGGBBAA` hex string into `(r, g, b)` floats.
pub fn parse_hex_rgb(hex_str: &str) -> Option<(f32, f32, f32)> {
    let clean = hex_str.trim().trim_start_matches('#');
    if clean.len() < 6 {
        return None;
    }
    let r = u8::from_str_radix(&clean[0..2], 16).ok()? as f32;
    let g = u8::from_str_radix(&clean[2..4], 16).ok()? as f32;
    let b = u8::from_str_radix(&clean[4..6], 16).ok()? as f32;
    Some((r, g, b))
}

/// Euclidean RGB distance between two colors.
pub fn rgb_distance(c1: (f32, f32, f32), c2: (f32, f32, f32)) -> f32 {
    let dr = c1.0 - c2.0;
    let dg = c1.1 - c2.1;
    let db = c1.2 - c2.2;
    (dr * dr + dg * dg + db * db).sqrt()
}

/// Cleans preset string (e.g. `"Bambu PLA Matte @BBL X1C"` -> `"PLA Matte"`).
pub fn clean_preset_name(preset: &str) -> String {
    let mut s = preset.trim();
    if let Some(idx) = s.find('@') {
        s = &s[..idx];
    }
    let s = s.trim();
    if let Some(stripped) = s.strip_prefix("Bambu Lab ") {
        stripped.trim().to_string()
    } else if let Some(stripped) = s.strip_prefix("Bambu ") {
        stripped.trim().to_string()
    } else {
        s.to_string()
    }
}

/// Matches `.3mf` hex against `filament_catalog.json` using RGB distance (< 35.0 threshold).
pub fn match_filament(
    catalog: &FilamentCatalog,
    hex: &str,
    cleaned_preset: &str,
) -> (String, String) {
    let target_rgb = match parse_hex_rgb(hex) {
        Some(rgb) => rgb,
        None => return (cleaned_preset.to_string(), "Custom".to_string()),
    };

    let target_series_lower = cleaned_preset.to_lowercase();

    // 1. First pass: look inside catalog entries matching series
    let mut best_series_match: Option<(&FilamentCatalogEntry, f32)> = None;
    for entry in &catalog.filaments {
        let entry_series_lower = entry.series.to_lowercase();
        if target_series_lower.contains(&entry_series_lower)
            || entry_series_lower.contains(&target_series_lower)
        {
            if let Some(entry_rgb) = parse_hex_rgb(&entry.hex) {
                let dist = rgb_distance(target_rgb, entry_rgb);
                if dist < 35.0 {
                    match best_series_match {
                        Some((_, best_dist)) if dist < best_dist => {
                            best_series_match = Some((entry, dist));
                        }
                        None => {
                            best_series_match = Some((entry, dist));
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    if let Some((entry, _)) = best_series_match {
        return (entry.name.clone(), entry.code.clone());
    }

    // 2. Second pass: search across all filaments in catalog
    let mut best_global_match: Option<(&FilamentCatalogEntry, f32)> = None;
    for entry in &catalog.filaments {
        if let Some(entry_rgb) = parse_hex_rgb(&entry.hex) {
            let dist = rgb_distance(target_rgb, entry_rgb);
            if dist < 35.0 {
                match best_global_match {
                    Some((_, best_dist)) if dist < best_dist => {
                        best_global_match = Some((entry, dist));
                    }
                    None => {
                        best_global_match = Some((entry, dist));
                    }
                    _ => {}
                }
            }
        }
    }

    if let Some((entry, _)) = best_global_match {
        (entry.name.clone(), entry.code.clone())
    } else {
        (cleaned_preset.to_string(), "Custom".to_string())
    }
}

/// Helper to convert JSON values (array or string) into `Vec<String>`.
fn json_value_to_strings(val: &serde_json::Value) -> Vec<String> {
    match val {
        serde_json::Value::Array(arr) => arr
            .iter()
            .map(|item| match item {
                serde_json::Value::String(s) => s.clone(),
                other => other.to_string().trim_matches('"').to_string(),
            })
            .collect(),
        serde_json::Value::String(s) => {
            if s.starts_with('[') && s.ends_with(']') {
                if let Ok(serde_json::Value::Array(inner)) = serde_json::from_str(s) {
                    return json_value_to_strings(&serde_json::Value::Array(inner));
                }
            }
            if s.contains(';') {
                s.split(';').map(|p| p.trim().to_string()).collect()
            } else if !s.is_empty() {
                vec![s.clone()]
            } else {
                Vec::new()
            }
        }
        _ => Vec::new(),
    }
}

/// Extracted project settings from `Metadata/project_settings.config`.
#[derive(Default, Debug)]
struct ParsedProjectSettings {
    filament_colour: Vec<String>,
    filament_type: Vec<String>,
    filament_settings_id: Vec<String>,
    nozzle_diameter: Option<String>,
    curr_bed_type: Option<String>,
}

fn parse_project_settings(json_str: &str) -> ParsedProjectSettings {
    let mut result = ParsedProjectSettings::default();
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_str) {
        if let Some(map) = val.as_object() {
            if let Some(v) = map.get("filament_colour") {
                result.filament_colour = json_value_to_strings(v);
            }
            if let Some(v) = map.get("filament_type") {
                result.filament_type = json_value_to_strings(v);
            }
            if let Some(v) = map.get("filament_settings_id") {
                result.filament_settings_id = json_value_to_strings(v);
            }
            if let Some(v) = map.get("nozzle_diameter") {
                let list = json_value_to_strings(v);
                result.nozzle_diameter = list.first().cloned();
            }
            if let Some(v) = map.get("curr_bed_type") {
                let bed_str = match v {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string().trim_matches('"').to_string(),
                };
                if !bed_str.is_empty() {
                    result.curr_bed_type = Some(bed_str);
                }
            }
        }
    }
    result
}

/// Extracted slice info filament slot from `Metadata/slice_info.config`.
#[derive(Debug)]
pub struct SliceFilamentSlot {
    pub slot_id: usize,
    pub material_type: String,
    pub hex: String,
    pub used_grams: Option<f32>,
}

#[derive(Default, Debug)]
pub struct ParsedSliceInfo {
    pub slots: Vec<SliceFilamentSlot>,
    pub total_prediction_sec: Option<u64>,
    pub total_weight_g: Option<f32>,
    pub nozzle_mm: Option<String>,
}

pub fn parse_slice_info(xml_str: &str) -> ParsedSliceInfo {
    let mut info = ParsedSliceInfo::default();
    let doc = match Document::parse(xml_str) {
        Ok(d) => d,
        Err(_) => return info,
    };

    let mut sum_pred_sec: u64 = 0;
    let mut sum_meta_weight: f32 = 0.0;
    let mut sum_filament_weight: f32 = 0.0;
    let mut found_pred = false;
    let mut found_meta_weight = false;
    let mut found_filament_weight = false;

    for node in doc.descendants() {
        if node.has_tag_name("metadata") {
            let key = node.attribute("key").unwrap_or("");
            let val = node.attribute("value").unwrap_or("");
            if key.eq_ignore_ascii_case("prediction") {
                if let Ok(sec) = val.parse::<u64>() {
                    sum_pred_sec += sec;
                    found_pred = true;
                }
            } else if key.eq_ignore_ascii_case("weight") {
                if let Ok(w) = val.parse::<f32>() {
                    sum_meta_weight += w;
                    found_meta_weight = true;
                }
            } else if key.eq_ignore_ascii_case("nozzle_diameters") || key.eq_ignore_ascii_case("nozzle_diameter") {
                if info.nozzle_mm.is_none() && !val.is_empty() {
                    let first = val.split(&[',', ';'][..]).next().unwrap_or(val).trim().to_string();
                    if !first.is_empty() {
                        info.nozzle_mm = Some(first);
                    }
                }
            }
        } else if node.has_tag_name("prediction") {
            if let Some(text) = node.text() {
                if let Ok(sec) = text.trim().parse::<u64>() {
                    sum_pred_sec += sec;
                    found_pred = true;
                }
            }
        } else if node.has_tag_name("weight") {
            if let Some(text) = node.text() {
                if let Ok(w) = text.trim().parse::<f32>() {
                    sum_meta_weight += w;
                    found_meta_weight = true;
                }
            }
        } else if node.has_tag_name("filament") {
            let id_str = node.attribute("id").unwrap_or("1");
            let slot_id = id_str.parse::<usize>().unwrap_or(1).saturating_sub(1);
            let material_type = node.attribute("type").unwrap_or("PLA").to_string();
            let mut hex = node.attribute("color").unwrap_or("#FFFFFF").to_string();
            if !hex.starts_with('#') {
                hex = format!("#{}", hex);
            }
            if hex.len() > 7 {
                hex = hex[..7].to_string();
            }

            let used_grams = node
                .attribute("used_g")
                .and_then(|g| g.parse::<f32>().ok());

            if let Some(g) = used_grams {
                sum_filament_weight += g;
                found_filament_weight = true;
            }

            info.slots.push(SliceFilamentSlot {
                slot_id,
                material_type,
                hex,
                used_grams,
            });
        }
    }

    if found_pred {
        info.total_prediction_sec = Some(sum_pred_sec);
    }
    if found_meta_weight {
        info.total_weight_g = Some(sum_meta_weight);
    } else if found_filament_weight {
        info.total_weight_g = Some(sum_filament_weight);
    }

    info
}

#[derive(Debug, Default)]
pub struct ThreemfParseResult {
    pub filaments: Vec<FilamentUsage>,
    pub thumbnails: Vec<String>,
    pub print_time_sec: Option<u64>,
    pub total_weight_g: Option<f32>,
    pub nozzle_mm: Option<String>,
    pub bed_type: Option<String>,
}

/// Parses a single `.3mf` ZIP file, extracts filaments and plate thumbnails.
pub fn parse_threemf_file(
    threemf_path: &Path,
    model_name: &str,
    root_path: &Path,
    catalog: Option<&FilamentCatalog>,
) -> ThreemfParseResult {
    let file_name = threemf_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown.3mf".to_string());

    let file = match File::open(threemf_path) {
        Ok(f) => f,
        Err(e) => {
            println!("[WARN][3MF] Failed to open {}: {}", file_name, e);
            return ThreemfParseResult::default();
        }
    };

    let mut archive = match zip::ZipArchive::new(BufReader::new(file)) {
        Ok(a) => a,
        Err(e) => {
            println!("[WARN][3MF] Failed to read ZIP archive in {}: {}", file_name, e);
            return ThreemfParseResult::default();
        }
    };

    let mut project_settings_content = String::new();
    let mut slice_info_content = String::new();
    let mut plate_entries: Vec<(String, usize)> = Vec::new(); // (entry_name, plate_number)

    // First scan archive file names
    for i in 0..archive.len() {
        if let Ok(entry) = archive.by_index(i) {
            if let Ok(name_cow) = entry.name() {
                let name = name_cow.to_string();
                if name.starts_with("Metadata/plate_") && name.ends_with(".png") {
                    let stem = name.trim_start_matches("Metadata/plate_").trim_end_matches(".png");
                    let plate_num = stem.parse::<usize>().unwrap_or(1);
                    plate_entries.push((name.clone(), plate_num));
                }
            }
        }
    }

    // Read project_settings.config
    if let Ok(mut entry) = archive.by_name("Metadata/project_settings.config") {
        let _ = entry.read_to_string(&mut project_settings_content);
    }
    // Read slice_info.config
    if let Ok(mut entry) = archive.by_name("Metadata/slice_info.config") {
        let _ = entry.read_to_string(&mut slice_info_content);
    }

    let project_settings = parse_project_settings(&project_settings_content);
    let slice_info = parse_slice_info(&slice_info_content);

    let mut filaments: Vec<FilamentUsage> = Vec::new();

    if !slice_info.slots.is_empty() {
        // Use slice_info slots (active on plates)
        for slot in slice_info.slots {
            let raw_preset = project_settings
                .filament_settings_id
                .get(slot.slot_id)
                .cloned()
                .unwrap_or_else(|| slot.material_type.clone());

            let cleaned_preset = clean_preset_name(&raw_preset);

            let (official_name, bambu_code) = if let Some(cat) = catalog {
                match_filament(cat, &slot.hex, &cleaned_preset)
            } else {
                (cleaned_preset.clone(), "Custom".to_string())
            };

            filaments.push(FilamentUsage {
                slot_id: slot.slot_id,
                hex: slot.hex,
                material_type: slot.material_type,
                preset_name: raw_preset,
                official_name,
                bambu_code,
                used_grams: slot.used_grams,
                source_3mf: file_name.clone(),
            });
        }
    } else if !project_settings.filament_colour.is_empty() {
        // Fallback to project_settings arrays
        for (i, hex_raw) in project_settings.filament_colour.iter().enumerate() {
            let mut hex = hex_raw.trim().to_string();
            if !hex.starts_with('#') {
                hex = format!("#{}", hex);
            }
            if hex.len() > 7 {
                hex = hex[..7].to_string();
            }

            let mat_type = project_settings
                .filament_type
                .get(i)
                .cloned()
                .unwrap_or_else(|| "PLA".to_string());

            let raw_preset = project_settings
                .filament_settings_id
                .get(i)
                .cloned()
                .unwrap_or_else(|| mat_type.clone());

            let cleaned_preset = clean_preset_name(&raw_preset);

            let (official_name, bambu_code) = if let Some(cat) = catalog {
                match_filament(cat, &hex, &cleaned_preset)
            } else {
                (cleaned_preset.clone(), "Custom".to_string())
            };

            filaments.push(FilamentUsage {
                slot_id: i,
                hex,
                material_type: mat_type,
                preset_name: raw_preset,
                official_name,
                bambu_code,
                used_grams: None,
                source_3mf: file_name.clone(),
            });
        }
    }

    // Extract plate thumbnails (Metadata/plate_1.png, plate_2.png, etc.)
    let mut extracted_thumbnails: Vec<String> = Vec::new();
    let thumbnails_dir = root_path.join(".thumbnails");
    let _ = fs::create_dir_all(&thumbnails_dir);

    let stem_3mf = threemf_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "model".to_string());

    // Sanitize names for thumbnail filename
    let clean_model_name = model_name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect::<String>();
    let clean_3mf_stem = stem_3mf
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect::<String>();

    plate_entries.sort_by_key(|(_, num)| *num);

    let threemf_mod_time = threemf_path
        .metadata()
        .and_then(|m| m.modified())
        .ok();

    for (entry_name, plate_num) in plate_entries {
        let dest_filename = format!(
            "{}_{}_plate{}.png",
            clean_model_name, clean_3mf_stem, plate_num
        );
        let dest_path = thumbnails_dir.join(&dest_filename);

        // Check if extraction is needed (if missing or if .3mf is newer)
        let needs_extract = if !dest_path.exists() {
            true
        } else if let (Some(t_mod), Ok(dest_meta)) = (threemf_mod_time, dest_path.metadata()) {
            if let Ok(dest_mod) = dest_meta.modified() {
                t_mod > dest_mod
            } else {
                false
            }
        } else {
            false
        };

        if needs_extract {
            if let Ok(mut entry) = archive.by_name(&entry_name) {
                let mut buffer = Vec::new();
                if entry.read_to_end(&mut buffer).is_ok() {
                    let _ = fs::write(&dest_path, buffer);
                }
            }
        }

        if dest_path.exists() {
            let normalized_path = clean_path_str(&dest_path.to_string_lossy());
            extracted_thumbnails.push(normalized_path);
        }
    }

    let nozzle_mm = project_settings.nozzle_diameter.or(slice_info.nozzle_mm);
    let bed_type = project_settings.curr_bed_type;
    let print_time_sec = slice_info.total_prediction_sec;
    let total_weight_g = slice_info.total_weight_g;

    println!(
        "[DEBUG][3MF] Parsed {}: found {} filaments, extracted {} plate thumbnails, time={:?}, weight={:?}, nozzle={:?}, bed={:?}",
        file_name,
        filaments.len(),
        extracted_thumbnails.len(),
        print_time_sec,
        total_weight_g,
        nozzle_mm,
        bed_type
    );

    ThreemfParseResult {
        filaments,
        thumbnails: extracted_thumbnails,
        print_time_sec,
        total_weight_g,
        nozzle_mm,
        bed_type,
    }
}

/// Processes all `.3mf` files for a model, updates filaments and plate thumbnails.
pub fn enrich_model_with_3mf(
    model: &mut ModelEntry,
    root_path: &Path,
    catalog: Option<&FilamentCatalog>,
) {
    let mut all_filaments: Vec<FilamentUsage> = Vec::new();
    let mut all_plate_thumbnails: Vec<(String, String)> = Vec::new(); // (thumb_path, source_3mf)
    let mut file_specs: std::collections::HashMap<String, crate::models::FileSpecs> = std::collections::HashMap::new();
    let mut total_print_time_sec: Option<u64> = None;
    let mut total_weight_g: Option<f32> = None;
    let mut nozzle_mm: Option<String> = None;
    let mut bed_type: Option<String> = None;

    for file_item in &model.formats.threemf {
        let path = PathBuf::from(&file_item.full_path);
        if path.exists() {
            let res = parse_threemf_file(&path, &model.name, root_path, catalog);

            file_specs.insert(
                file_item.name.clone(),
                crate::models::FileSpecs {
                    print_time_sec: res.print_time_sec,
                    total_weight_g: res.total_weight_g,
                    nozzle_mm: res.nozzle_mm.clone(),
                    bed_type: res.bed_type.clone(),
                },
            );

            all_filaments.extend(res.filaments);
            for thumb in res.thumbnails {
                all_plate_thumbnails.push((thumb, file_item.name.clone()));
            }
            if let Some(time) = res.print_time_sec {
                total_print_time_sec = Some(total_print_time_sec.unwrap_or(0) + time);
            }
            if let Some(weight) = res.total_weight_g {
                total_weight_g = Some(total_weight_g.unwrap_or(0.0) + weight);
            }
            if nozzle_mm.is_none() && res.nozzle_mm.is_some() {
                nozzle_mm = res.nozzle_mm;
            }
            if bed_type.is_none() && res.bed_type.is_some() {
                bed_type = res.bed_type;
            }
        }
    }

    // Existing preview images from loose scan (previews/ folder, etc.)
    let mut image_sources: Vec<Option<String>> = vec![None; model.preview_images.len()];

    // Append extracted thumbnails to the end of preview_images (preventing duplicates)
    for (thumb, src_3mf) in all_plate_thumbnails {
        if !model.preview_images.contains(&thumb) {
            model.preview_images.push(thumb);
            image_sources.push(Some(src_3mf));
        }
    }

    model.preview_image_sources = image_sources;
    model.filaments = all_filaments;
    model.print_time_sec = total_print_time_sec;
    model.total_weight_g = total_weight_g;
    model.nozzle_mm = nozzle_mm;
    model.bed_type = bed_type;

    // Apply manual specifications from `_specs.json` if present
    let specs_path = Path::new(&model.folder_path).join("_specs.json");
    if specs_path.exists() {
        if let Ok(content) = fs::read_to_string(&specs_path) {
            if let Ok(specs) = serde_json::from_str::<crate::models::ModelSpecs>(&content) {
                // Apply per-file weight to matching filaments and update file_specs
                for (file_name, item) in &specs.files {
                    for f in &mut model.filaments {
                        if f.source_3mf.eq_ignore_ascii_case(file_name) && f.used_grams.is_none() {
                            f.used_grams = item.weight_g;
                        }
                    }

                    let fs_entry = file_specs.entry(file_name.clone()).or_default();
                    if item.print_time_sec.is_some() {
                        fs_entry.print_time_sec = item.print_time_sec;
                    }
                    if item.weight_g.is_some() {
                        fs_entry.total_weight_g = item.weight_g;
                    }
                }
                if model.print_time_sec.is_none() || model.print_time_sec == Some(0) {
                    model.print_time_sec = specs.total_print_time_sec;
                }
                if model.total_weight_g.is_none() || model.total_weight_g == Some(0.0) {
                    model.total_weight_g = specs.total_weight_g;
                }
            }
        }
    }

    model.file_specs = file_specs;

    println!(
        "[DEBUG][3MF] Enriched model '{}': {} preview images ({} mapped to 3MF), {} filaments, print_time={:?}, weight={:?}, nozzle={:?}, bed={:?}",
        model.name,
        model.preview_images.len(),
        model.preview_image_sources.iter().filter(|s| s.is_some()).count(),
        model.filaments.len(),
        model.print_time_sec,
        model.total_weight_g,
        model.nozzle_mm,
        model.bed_type,
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{FileItem, ModelFormats};

    #[test]
    fn test_clean_preset_name() {
        assert_eq!(clean_preset_name("Bambu PLA Matte @BBL X1C"), "PLA Matte");
        assert_eq!(clean_preset_name("Bambu PLA Basic @BBL X1C 0.4 nozzle"), "PLA Basic");
        assert_eq!(clean_preset_name("Generic PLA"), "Generic PLA");
        assert_eq!(clean_preset_name("Bambu Lab PETG HF @0.20 Standard"), "PETG HF");
    }

    #[test]
    fn test_parse_hex_rgb_and_distance() {
        let white = parse_hex_rgb("#FFFFFF").unwrap();
        let black = parse_hex_rgb("#000000").unwrap();
        let near_white = parse_hex_rgb("#FEFEFE").unwrap();

        assert_eq!(white, (255.0, 255.0, 255.0));
        assert_eq!(black, (0.0, 0.0, 0.0));

        let dist_near = rgb_distance(white, near_white);
        assert!(dist_near < 5.0);

        let dist_far = rgb_distance(white, black);
        assert!(dist_far > 400.0);
    }

    #[test]
    fn test_parse_project_settings_metadata() {
        let json = r##"{
            "nozzle_diameter": ["0.4", "0.4"],
            "curr_bed_type": "Textured PEI Plate",
            "filament_colour": ["#FFFFFF", "#00AE42"],
            "filament_type": ["PLA", "PETG"],
            "filament_settings_id": ["Bambu PLA Basic", "Bambu PETG HF"]
        }"##;
        let parsed = parse_project_settings(json);
        assert_eq!(parsed.nozzle_diameter.as_deref(), Some("0.4"));
        assert_eq!(parsed.curr_bed_type.as_deref(), Some("Textured PEI Plate"));
        assert_eq!(parsed.filament_colour.len(), 2);
    }

    #[test]
    fn test_parse_slice_info_metadata() {
        let xml = r##"<?xml version="1.0" encoding="UTF-8"?>
        <config>
          <plate>
            <metadata key="prediction" value="7200"/>
            <metadata key="weight" value="45.5"/>
            <metadata key="nozzle_diameters" value="0.4"/>
            <filament id="1" type="PLA" color="#00AE42" used_g="45.5"/>
          </plate>
        </config>"##;
        let info = parse_slice_info(xml);
        assert_eq!(info.total_prediction_sec, Some(7200));
        assert_eq!(info.total_weight_g, Some(45.5));
        assert_eq!(info.nozzle_mm.as_deref(), Some("0.4"));
        assert_eq!(info.slots.len(), 1);
    }

    #[test]
    fn test_file_specs_enrichment() {
        let temp_dir = std::env::temp_dir().join(format!("test_specs_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();

        let mut model = ModelEntry {
            id: "test".to_string(),
            name: "TestModel".to_string(),
            folder_path: temp_dir.to_string_lossy().to_string(),
            preview_images: vec![],
            preview_image_sources: vec![],
            formats: ModelFormats {
                threemf: vec![
                    FileItem {
                        name: "PlateA.3mf".to_string(),
                        full_path: temp_dir.join("PlateA.3mf").to_string_lossy().to_string(),
                        size_bytes: 100,
                        modified_ms: 1000,
                    },
                    FileItem {
                        name: "PlateB.3mf".to_string(),
                        full_path: temp_dir.join("PlateB.3mf").to_string_lossy().to_string(),
                        size_bytes: 200,
                        modified_ms: 1000,
                    },
                ],
                stp: vec![],
                stl: vec![],
                obj: vec![],
            },
            filaments: vec![],
            last_modified_ms: 1000,
            tags: vec![],
            print_time_sec: None,
            total_weight_g: None,
            nozzle_mm: None,
            bed_type: None,
            file_specs: std::collections::HashMap::new(),
        };

        // Create _specs.json with individual values for PlateA and PlateB
        let specs_json = r#"{
            "files": {
                "PlateA.3mf": { "print_time_sec": 3600, "weight_g": 50.0 },
                "PlateB.3mf": { "print_time_sec": 7200, "weight_g": 120.0 }
            },
            "total_print_time_sec": 10800,
            "total_weight_g": 170.0
        }"#;
        std::fs::write(temp_dir.join("_specs.json"), specs_json).unwrap();

        enrich_model_with_3mf(&mut model, &temp_dir, None);

        assert_eq!(model.file_specs.len(), 2);
        assert_eq!(model.file_specs.get("PlateA.3mf").unwrap().print_time_sec, Some(3600));
        assert_eq!(model.file_specs.get("PlateA.3mf").unwrap().total_weight_g, Some(50.0));
        assert_eq!(model.file_specs.get("PlateB.3mf").unwrap().print_time_sec, Some(7200));
        assert_eq!(model.file_specs.get("PlateB.3mf").unwrap().total_weight_g, Some(120.0));
        assert_eq!(model.print_time_sec, Some(10800));
        assert_eq!(model.total_weight_g, Some(170.0));

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
