use crate::config::clean_path_str;
use crate::models::ModelEntry;
use std::fs;
use std::path::{Path, PathBuf};

/// Copies a file into the target directory. If `overwrite` is false, appends `_copy`, `_copy2`, etc.
/// If `overwrite` is true, overwrites any existing file with the same name.
fn copy_file_to_dest(source: &Path, dest_folder: &Path, overwrite: bool) -> Result<PathBuf, String> {
    if !source.exists() || !source.is_file() {
        return Err(format!("Source file does not exist or is not a file: {:?}", source));
    }

    fs::create_dir_all(dest_folder)
        .map_err(|e| format!("Failed to create destination folder {:?}: {}", dest_folder, e))?;

    let file_name = source
        .file_name()
        .ok_or_else(|| "Invalid source filename".to_string())?
        .to_string_lossy();

    let stem = source
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".to_string());

    let ext = source
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();

    let mut dest_path = dest_folder.join(file_name.as_ref());

    if !overwrite {
        let mut counter = 1;
        while dest_path.exists() {
            let new_name = if counter == 1 {
                format!("{}_copy{}", stem, ext)
            } else {
                format!("{}_copy{}{}", stem, counter, ext)
            };
            dest_path = dest_folder.join(new_name);
            counter += 1;
        }
    }

    fs::copy(source, &dest_path)
        .map_err(|e| format!("Failed to copy {:?} to {:?}: {}", source, dest_path, e))?;

    Ok(dest_path)
}

/// Routes files according to their extension:
/// - `.3mf` -> `<model_folder>/3mf/`
/// - `.stp`, `.step` -> `<model_folder>/stp/`
/// - `.stl` -> `<model_folder>/stl/`
/// - `.obj` -> `<model_folder>/obj/`
/// - `.png`, `.jpg`, `.jpeg`, `.webp` -> `<model_folder>/previews/`
/// - Other extensions -> `<model_folder>/`
fn get_dest_subfolder(target_dir: &Path, file_path: &Path) -> PathBuf {
    let ext = file_path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        "3mf" => target_dir.join("3mf"),
        "stp" | "step" => target_dir.join("stp"),
        "stl" => target_dir.join("stl"),
        "obj" => target_dir.join("obj"),
        "png" | "jpg" | "jpeg" | "webp" => target_dir.join("previews"),
        _ => target_dir.to_path_buf(),
    }
}

fn collect_files_recursive(path: &Path, out: &mut Vec<PathBuf>) {
    if path.is_file() {
        out.push(path.to_path_buf());
    } else if path.is_dir() {
        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.flatten() {
                collect_files_recursive(&entry.path(), out);
            }
        }
    }
}

/// Tauri command to ingest a list of files into a target model folder (or create a new model folder).
/// When `overwrite` is `Some(true)`, existing files with matching names are replaced instead of duplicated.
#[tauri::command]
pub fn ingest_files_to_model(
    target_folder: String,
    file_paths: Vec<String>,
    root_path: String,
    overwrite: Option<bool>,
) -> Result<ModelEntry, String> {
    if file_paths.is_empty() {
        return Err("No files provided for ingestion".to_string());
    }

    let clean_root = clean_path_str(&root_path);
    let root = Path::new(&clean_root);

    if !root.exists() || !root.is_dir() {
        return Err(format!("Library root directory does not exist: {}", clean_root));
    }

    let should_overwrite = overwrite.unwrap_or(false);

    // Determine target folder path
    let target_dir: PathBuf = if target_folder.trim().is_empty() {
        // Create new model directory named after the first file's stem or directory name
        let first_file_str = clean_path_str(&file_paths[0]);
        let first_file = Path::new(&first_file_str);
        let stem = if first_file.is_dir() {
            first_file
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "New Model".to_string())
        } else {
            first_file
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "New Model".to_string())
        };

        let mut candidate = root.join(&stem);
        let mut idx = 1;
        while candidate.exists() {
            candidate = root.join(format!("{}_{}", stem, idx));
            idx += 1;
        }
        candidate
    } else {
        let clean_target = clean_path_str(&target_folder);
        PathBuf::from(clean_target)
    };

    fs::create_dir_all(&target_dir)
        .map_err(|e| format!("Failed to create target folder {:?}: {}", target_dir, e))?;

    let mut all_files_to_copy = Vec::new();
    for raw_path in &file_paths {
        let clean_src = clean_path_str(raw_path);
        let src_path = PathBuf::from(clean_src);
        if src_path.exists() {
            collect_files_recursive(&src_path, &mut all_files_to_copy);
        } else {
            println!("[WARN][Ingest] Source path does not exist, skipping: {:?}", src_path);
        }
    }

    // If overwrite is requested for an existing model, clean up any old plate thumbnails in root's .thumbnails
    // so fresh ones will be extracted from the newly updated .3mf files
    if should_overwrite {
        let thumbnails_dir = root.join(".thumbnails");
        if thumbnails_dir.exists() {
            let model_name = target_dir
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            let clean_model_name = model_name
                .chars()
                .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
                .collect::<String>();
            if let Ok(entries) = fs::read_dir(&thumbnails_dir) {
                for entry in entries.flatten() {
                    let fname = entry.file_name().to_string_lossy().to_string();
                    if fname.starts_with(&format!("{}_", clean_model_name)) {
                        let _ = fs::remove_file(entry.path());
                    }
                }
            }
        }
    }

    let mut copied_count = 0;

    for src_path in &all_files_to_copy {
        let dest_subfolder = get_dest_subfolder(&target_dir, src_path);
        let file_name = src_path.file_name().unwrap_or_default();

        // If overwrite is enabled and a loose copy exists in target_dir root while dest is a subfolder, remove loose copy
        if should_overwrite && dest_subfolder != target_dir {
            let loose_file = target_dir.join(file_name);
            if loose_file.exists() && loose_file.is_file() {
                println!("[DEBUG][Ingest] Overwrite: removing loose file before routing: {:?}", loose_file);
                let _ = fs::remove_file(&loose_file);
            }
        }

        match copy_file_to_dest(src_path, &dest_subfolder, should_overwrite) {
            Ok(dest) => {
                println!(
                    "[DEBUG][Ingest] Routed {:?} -> {:?} (overwrite={})",
                    file_name,
                    dest,
                    should_overwrite
                );
                copied_count += 1;
            }
            Err(e) => {
                println!("[ERROR][Ingest] Failed copying {:?}: {}", src_path, e);
            }
        }
    }

    // Re-scan this single model folder
    let model_entry = crate::scanner::scan_single_model_entry(&target_dir, root)?;

    // Update _library_cache.json
    let cache_path = root.join("_library_cache.json");
    let mut cache_map = crate::scanner::load_library_cache(&cache_path);
    cache_map.insert(model_entry.folder_path.clone(), model_entry.clone());
    let mut all_models: Vec<ModelEntry> = cache_map.into_values().collect();
    all_models.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    crate::scanner::save_library_cache(&cache_path, &all_models);

    println!(
        "[DEBUG][Ingest] Ingested {} files into {:?}, rebuilt ModelEntry: {} (overwrite={})",
        copied_count, target_dir, model_entry.name, should_overwrite
    );

    Ok(model_entry)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_copy_file_to_dest_collision_and_overwrite() {
        let temp_dir = std::env::temp_dir().join("test_bambu_ingest_copy");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let src_file = temp_dir.join("widget.3mf");
        fs::write(&src_file, b"content_v1").unwrap();

        let dest_folder = temp_dir.join("dest");
        fs::create_dir_all(&dest_folder).unwrap();

        // 1. Initial copy
        let res1 = copy_file_to_dest(&src_file, &dest_folder, false).unwrap();
        assert_eq!(res1, dest_folder.join("widget.3mf"));
        assert_eq!(fs::read(&res1).unwrap(), b"content_v1");

        // 2. Collision avoidance copy (overwrite = false)
        let res2 = copy_file_to_dest(&src_file, &dest_folder, false).unwrap();
        assert_eq!(res2, dest_folder.join("widget_copy.3mf"));

        // 3. Overwrite copy (overwrite = true)
        fs::write(&src_file, b"content_v2").unwrap();
        let res3 = copy_file_to_dest(&src_file, &dest_folder, true).unwrap();
        assert_eq!(res3, dest_folder.join("widget.3mf"));
        assert_eq!(fs::read(&res3).unwrap(), b"content_v2");

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
