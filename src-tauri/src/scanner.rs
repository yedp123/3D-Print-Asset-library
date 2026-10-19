use crate::config::{clean_path_str, strip_verbatim_prefix};
use crate::models::{FileItem, ModelEntry, ModelFormats};
use std::fs;
use std::path::Path;
use std::time::Instant;

/// Helper to extract file size in bytes and last modified time in milliseconds since UNIX epoch.
fn get_file_metadata(path: &Path) -> (u64, u64) {
    if let Ok(meta) = path.metadata() {
        let size = meta.len();
        let modified_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        (size, modified_ms)
    } else {
        (0, 0)
    }
}

/// Recursively scans a directory for model files and preview images.
/// Skips hidden subdirectories starting with `.` or `_`.
fn scan_folder_contents(
    dir: &Path,
    preview_images: &mut Vec<String>,
    formats: &mut ModelFormats,
    max_mod_ms: &mut u64,
) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files/directories starting with '.' or '_'
        if file_name.starts_with('.') || file_name.starts_with('_') {
            continue;
        }

        if path.is_dir() {
            // Recursively scan subfolders (such as previews, 3mf, stp, step, stl, obj, etc.)
            scan_folder_contents(&path, preview_images, formats, max_mod_ms);
        } else if path.is_file() {
            let (size_bytes, modified_ms) = get_file_metadata(&path);
            if modified_ms > *max_mod_ms {
                *max_mod_ms = modified_ms;
            }

            let full_path = clean_path_str(&path.to_string_lossy());
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_ascii_lowercase())
                .unwrap_or_default();

            match ext.as_str() {
                "png" | "jpg" | "jpeg" | "webp" => {
                    preview_images.push(full_path);
                }
                "3mf" => {
                    formats.threemf.push(FileItem {
                        name: file_name,
                        full_path,
                        size_bytes,
                        modified_ms,
                    });
                }
                "stp" | "step" => {
                    formats.stp.push(FileItem {
                        name: file_name,
                        full_path,
                        size_bytes,
                        modified_ms,
                    });
                }
                "stl" => {
                    formats.stl.push(FileItem {
                        name: file_name,
                        full_path,
                        size_bytes,
                        modified_ms,
                    });
                }
                "obj" => {
                    formats.obj.push(FileItem {
                        name: file_name,
                        full_path,
                        size_bytes,
                        modified_ms,
                    });
                }
                _ => {}
            }
        }
    }
}

/// Scans the root of a model folder (and optionally a `tags/` subfolder) for extensionless tag files.
/// A file qualifies as a tag if it has NO extension and does not start with '.' or '_',
/// or if it ends with '.tag'. Names are normalized to lowercase.
pub fn scan_model_tags(model_folder: &Path) -> Vec<String> {
    let mut tags = Vec::new();

    let mut inspect_file = |file_path: &Path| {
        if !file_path.is_file() {
            return;
        }
        let Some(file_name) = file_path.file_name().and_then(|n| n.to_str()) else {
            return;
        };

        if file_name.starts_with('.') || file_name.starts_with('_') {
            return;
        }

        let is_tag = match file_path.extension().and_then(|e| e.to_str()) {
            None => true,
            Some(ext) => ext.eq_ignore_ascii_case("tag"),
        };

        if is_tag {
            let tag_name = if let Some(stripped) = file_name.strip_suffix(".tag") {
                stripped.to_lowercase()
            } else if let Some(stripped) = file_name.strip_suffix(".TAG") {
                stripped.to_lowercase()
            } else {
                file_name.to_lowercase()
            };

            let trimmed = tag_name.trim();
            if !trimmed.is_empty()
                && trimmed != "readme"
                && trimmed != "license"
                && !tags.contains(&trimmed.to_string())
            {
                tags.push(trimmed.to_string());
            }
        }
    };

    // 1. Check files in the root of the model folder
    if let Ok(entries) = fs::read_dir(model_folder) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                inspect_file(&p);
            }
        }
    }

    // 2. Check files in `tags/` subfolder if present
    let tags_dir = model_folder.join("tags");
    if tags_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(&tags_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() {
                    inspect_file(&p);
                }
            }
        }
    }

    tags.sort();
    tags
}

/// Tauri command: Scans `root_path` for subdirectories and builds structured `ModelEntry` items.
#[tauri::command]
pub fn scan_models_directory(root_path: String) -> Result<Vec<ModelEntry>, String> {
    let start_time = Instant::now();
    let cleaned_root = strip_verbatim_prefix(&root_path.trim());

    if cleaned_root.is_empty() {
        println!("[DEBUG][Scanner] root_path is empty, returning 0 models");
        return Ok(Vec::new());
    }

    let root = Path::new(&cleaned_root);
    if !root.exists() {
        return Err(format!("Library root directory does not exist: {}", cleaned_root));
    }

    if !root.is_dir() {
        return Err(format!("Library root is not a directory: {}", cleaned_root));
    }

    let cache_path = root.join("_library_cache.json");
    let mut cache_map = load_library_cache(&cache_path);
    let catalog = crate::threemf::load_filament_catalog();

    let read_dir = fs::read_dir(root)
        .map_err(|e| format!("Failed to read root directory {}: {}", cleaned_root, e))?;

    let mut models: Vec<ModelEntry> = Vec::new();

    for entry in read_dir.flatten() {
        let path = entry.path();
        let folder_name = entry.file_name().to_string_lossy().to_string();

        // Skip non-directories and hidden folders starting with '.' or '_'
        if !path.is_dir() || folder_name.starts_with('.') || folder_name.starts_with('_') {
            continue;
        }

        let model_folder_path = clean_path_str(&path.to_string_lossy());
        let (folder_size, mut folder_modified_ms) = get_file_metadata(&path);
        let _ = folder_size;

        let mut preview_images: Vec<String> = Vec::new();
        let mut formats = ModelFormats::default();

        // Recursively scan the model folder root and its subfolders
        scan_folder_contents(&path, &mut preview_images, &mut formats, &mut folder_modified_ms);

        // Sort preview images alphabetically (putting images from 'previews/' subfolders first if present)
        preview_images.sort_by(|a, b| {
            let a_has_preview = a.to_lowercase().contains("previews");
            let b_has_preview = b.to_lowercase().contains("previews");
            match (a_has_preview, b_has_preview) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.to_lowercase().cmp(&b.to_lowercase()),
            }
        });

        // Sort format items by filename
        formats.threemf.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        formats.stp.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        formats.stl.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        formats.obj.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

        use std::hash::{Hash, Hasher};
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        model_folder_path.hash(&mut hasher);
        let model_id = format!("{:016x}", hasher.finish());

        let tags = scan_model_tags(&path);

        // Check if we can reuse cached filaments & plate thumbnails
        let mut reused_cache = false;
        let mut filaments = Vec::new();
        let mut preview_image_sources = Vec::new();
        let mut print_time_sec = None;
        let mut total_weight_g = None;
        let mut nozzle_mm = None;
        let mut bed_type = None;
        let mut file_specs = std::collections::HashMap::new();

        if let Some(cached) = cache_map.remove(&model_folder_path) {
            if cached.last_modified_ms == folder_modified_ms && !cached.formats.threemf.is_empty() {
                reused_cache = true;
                filaments = cached.filaments;
                preview_image_sources = cached.preview_image_sources;
                print_time_sec = cached.print_time_sec;
                total_weight_g = cached.total_weight_g;
                nozzle_mm = cached.nozzle_mm;
                bed_type = cached.bed_type;
                file_specs = cached.file_specs;
                for p in cached.preview_images {
                    if (p.contains(".thumbnails") || p.contains("plate"))
                        && Path::new(&p).exists()
                        && !preview_images.contains(&p)
                    {
                        preview_images.push(p);
                    }
                }
            }
        }

        if reused_cache {
            preview_image_sources = reconcile_preview_image_sources(
                &preview_images,
                preview_image_sources,
                &formats.threemf,
            );
        }

        let mut model_entry = ModelEntry {
            id: model_id,
            name: folder_name,
            folder_path: model_folder_path,
            preview_images,
            preview_image_sources,
            formats,
            filaments,
            last_modified_ms: folder_modified_ms,
            tags,
            print_time_sec,
            total_weight_g,
            nozzle_mm,
            bed_type,
            file_specs,
        };

        if !reused_cache {
            crate::threemf::enrich_model_with_3mf(&mut model_entry, root, catalog.as_ref());
            model_entry.preview_image_sources = reconcile_preview_image_sources(
                &model_entry.preview_images,
                model_entry.preview_image_sources,
                &model_entry.formats.threemf,
            );
        }

        models.push(model_entry);
    }

    // Sort models alphabetically by name
    models.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    // Persist cache
    save_library_cache(&cache_path, &models);

    let elapsed_ms = start_time.elapsed().as_millis();
    println!("[DEBUG][Scanner] Scanned {} models in {}ms", models.len(), elapsed_ms);

    Ok(models)
}

fn reconcile_preview_image_sources(
    preview_images: &[String],
    existing_sources: Vec<Option<String>>,
    threemf_files: &[FileItem],
) -> Vec<Option<String>> {
    if !existing_sources.is_empty() && existing_sources.len() == preview_images.len() {
        return existing_sources;
    }

    let mut result = Vec::with_capacity(preview_images.len());
    let mut thumb_idx = 0usize;

    for img_path in preview_images {
        let is_thumb = img_path.contains(".thumbnails") || img_path.to_lowercase().contains("plate");
        if !is_thumb {
            result.push(None);
            continue;
        }

        // Try to match stem from threemf_files
        let mut matched: Option<String> = None;
        for file in threemf_files {
            let stem = file.name.trim_end_matches(".3mf").trim_end_matches(".3MF");
            if img_path.contains(stem) {
                matched = Some(file.name.clone());
                break;
            }
        }

        if matched.is_none() && threemf_files.len() == 1 {
            matched = Some(threemf_files[0].name.clone());
        }

        if matched.is_none() && thumb_idx < threemf_files.len() {
            matched = Some(threemf_files[thumb_idx].name.clone());
        }

        thumb_idx += 1;
        result.push(matched);
    }

    result
}

pub fn load_library_cache(cache_path: &Path) -> std::collections::HashMap<String, ModelEntry> {
    let mut map = std::collections::HashMap::new();
    if let Ok(content) = fs::read_to_string(cache_path) {
        if let Ok(cached_entries) = serde_json::from_str::<Vec<ModelEntry>>(&content) {
            println!(
                "[DEBUG][Cache] Loaded {} cached models from {:?}",
                cached_entries.len(),
                cache_path
            );
            for entry in cached_entries {
                map.insert(entry.folder_path.clone(), entry);
            }
        }
    }
    map
}

pub fn save_library_cache(cache_path: &Path, models: &[ModelEntry]) {
    if let Ok(json) = serde_json::to_string_pretty(models) {
        let _ = fs::write(cache_path, json);
        println!(
            "[DEBUG][Cache] Saved {} models to {:?}",
            models.len(),
            cache_path
        );
    }
}

/// Fully scans and enriches a single model directory, returning its reconstructed `ModelEntry`.
pub fn scan_single_model_entry(path: &Path, root: &Path) -> Result<ModelEntry, String> {
    if !path.is_dir() {
        return Err(format!("Not a directory: {:?}", path));
    }
    let folder_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    let model_folder_path = clean_path_str(&path.to_string_lossy());
    let (_, mut folder_modified_ms) = get_file_metadata(path);

    let mut preview_images: Vec<String> = Vec::new();
    let mut formats = ModelFormats::default();

    scan_folder_contents(path, &mut preview_images, &mut formats, &mut folder_modified_ms);

    preview_images.sort_by(|a, b| {
        let a_has_preview = a.to_lowercase().contains("previews");
        let b_has_preview = b.to_lowercase().contains("previews");
        match (a_has_preview, b_has_preview) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.to_lowercase().cmp(&b.to_lowercase()),
        }
    });

    formats.threemf.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    formats.stp.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    formats.stl.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    formats.obj.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    model_folder_path.hash(&mut hasher);
    let model_id = format!("{:016x}", hasher.finish());

    let tags = scan_model_tags(path);
    let catalog = crate::threemf::load_filament_catalog();

    let mut model_entry = ModelEntry {
        id: model_id,
        name: folder_name,
        folder_path: model_folder_path,
        preview_images,
        preview_image_sources: Vec::new(),
        formats,
        filaments: Vec::new(),
        last_modified_ms: folder_modified_ms,
        tags,
        print_time_sec: None,
        total_weight_g: None,
        nozzle_mm: None,
        bed_type: None,
        file_specs: std::collections::HashMap::new(),
    };

    crate::threemf::enrich_model_with_3mf(&mut model_entry, root, catalog.as_ref());
    model_entry.preview_image_sources = reconcile_preview_image_sources(
        &model_entry.preview_images,
        model_entry.preview_image_sources,
        &model_entry.formats.threemf,
    );

    Ok(model_entry)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scan_empty_root() {
        let res = scan_models_directory("".to_string());
        assert!(res.is_ok());
        assert_eq!(res.unwrap().len(), 0);
    }

    #[test]
    fn test_scan_models_directory_with_subfolders() {
        let temp_dir = std::env::temp_dir().join(format!("bambu_test_library_{}", std::process::id()));
        let model_a = temp_dir.join("Model_Alpha");
        let model_a_stp = model_a.join("stp");
        let model_a_previews = model_a.join("previews");
        let hidden_dir = temp_dir.join(".hidden_folder");

        fs::create_dir_all(&model_a_stp).unwrap();
        fs::create_dir_all(&model_a_previews).unwrap();
        fs::create_dir_all(&hidden_dir).unwrap();

        // Create files
        fs::write(model_a_previews.join("cover.png"), b"fake_png").unwrap();
        fs::write(model_a.join("plate.3mf"), b"fake_3mf").unwrap();
        fs::write(model_a_stp.join("part1.step"), b"fake_stp_1").unwrap();
        fs::write(model_a_stp.join("part2.step"), b"fake_stp_2").unwrap();
        fs::write(model_a.join("mesh.stl"), b"fake_stl").unwrap();
        fs::write(hidden_dir.join("should_be_skipped.3mf"), b"skip").unwrap();

        let scanned = scan_models_directory(temp_dir.to_string_lossy().to_string()).unwrap();
        assert_eq!(scanned.len(), 1, "Should only scan non-hidden model subfolders");

        let entry = &scanned[0];
        assert_eq!(entry.name, "Model_Alpha");
        assert_eq!(entry.preview_images.len(), 1);
        assert_eq!(entry.formats.threemf.len(), 1);
        assert_eq!(entry.formats.stp.len(), 2);
        assert_eq!(entry.formats.stl.len(), 1);
        assert_eq!(entry.formats.obj.len(), 0);

        // Cleanup
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_scan_model_tags() {
        let temp_dir = std::env::temp_dir().join(format!("bambu_tag_test_{}", std::process::id()));
        let model_dir = temp_dir.join("Test_Model");
        let tags_dir = model_dir.join("tags");
        fs::create_dir_all(&tags_dir).unwrap();

        // Create extensionless tag file in root
        fs::write(model_dir.join("people"), b"").unwrap();
        // Create .tag file in root
        fs::write(model_dir.join("vehicle.tag"), b"").unwrap();
        // Create extensionless tag in tags/ subfolder
        fs::write(tags_dir.join("furniture"), b"").unwrap();
        // Create ignored files (starts with dot or underscore, or has other extension)
        fs::write(model_dir.join(".hidden"), b"").unwrap();
        fs::write(model_dir.join("_cache"), b"").unwrap();
        fs::write(model_dir.join("model.3mf"), b"3mf").unwrap();

        let tags = scan_model_tags(&model_dir);
        assert_eq!(tags, vec!["furniture".to_string(), "people".to_string(), "vehicle".to_string()]);

        let _ = fs::remove_dir_all(&temp_dir);
    }
}

