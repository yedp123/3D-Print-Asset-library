use std::path::Path;
use std::process::Command;

/// Tauri command: Reveals the target path in Windows Explorer.
/// If `target_path` is a file, highlights it using `explorer.exe /select,"<target_path>"`.
/// If it is a directory, opens the directory in Explorer.
#[tauri::command]
pub fn reveal_in_explorer(target_path: String) -> Result<(), String> {
    let clean_path = crate::config::strip_verbatim_prefix(&target_path);
    println!("[DEBUG][Shell] Revealing path in Explorer: {}", clean_path);

    let path = Path::new(&clean_path);
    if !path.exists() {
        return Err(format!("Target path does not exist: {}", clean_path));
    }

    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("explorer.exe");
        if path.is_file() {
            cmd.arg(format!("/select,{}", clean_path));
        } else {
            cmd.arg(&clean_path);
        }

        cmd.spawn()
            .map_err(|e| format!("Failed to spawn explorer.exe: {}", e))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        let mut cmd = Command::new("open");
        cmd.arg(&clean_path);
        cmd.spawn()
            .map_err(|e| format!("Failed to launch file manager: {}", e))?;
    }

    Ok(())
}

/// Tauri command: Launches a 3MF file in Bambu Studio.
#[tauri::command]
pub fn launch_in_bambu_studio(file_path: String) -> Result<(), String> {
    let clean_path = crate::config::strip_verbatim_prefix(&file_path);
    println!("[DEBUG][Shell] Launching in Bambu Studio: {}", clean_path);

    let path = Path::new(&clean_path);
    if !path.exists() {
        return Err(format!("File does not exist: {}", clean_path));
    }

    let config = crate::config::load_config().unwrap_or_default();
    let exe = config.bambu_studio_exe_path;

    #[cfg(target_os = "windows")]
    {
        if Path::new(&exe).exists() {
            Command::new(&exe)
                .arg(&clean_path)
                .spawn()
                .map_err(|e| format!("Failed to launch Bambu Studio: {}", e))?;
        } else {
            Command::new("cmd")
                .args(["/c", "start", "", &clean_path])
                .spawn()
                .map_err(|e| format!("Failed to open file: {}", e))?;
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Command::new("open")
            .arg(&clean_path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }

    Ok(())
}

/// Tauri command: Toggles a model tag by creating or removing the extensionless marker file.
/// Returns the updated tags list and updates `_library_cache.json`.
#[tauri::command]
pub fn toggle_model_tag(model_folder_path: String, tag_id: String) -> Result<Vec<String>, String> {
    let clean_folder = crate::config::clean_path_str(model_folder_path.trim());
    let folder = Path::new(&clean_folder);

    if !folder.exists() || !folder.is_dir() {
        return Err(format!(
            "Model folder does not exist or is not a directory: {}",
            clean_folder
        ));
    }

    let clean_tag = tag_id.trim().to_lowercase();
    if clean_tag.is_empty() {
        return Err("Tag ID cannot be empty".to_string());
    }

    let target_file = folder.join(&clean_tag);
    let tag_with_ext = folder.join(format!("{}.tag", clean_tag));

    if target_file.exists() {
        std::fs::remove_file(&target_file)
            .map_err(|e| format!("Failed to remove tag file {:?}: {}", target_file, e))?;
    } else if tag_with_ext.exists() {
        std::fs::remove_file(&tag_with_ext)
            .map_err(|e| format!("Failed to remove tag file {:?}: {}", tag_with_ext, e))?;
    } else {
        std::fs::File::create(&target_file)
            .map_err(|e| format!("Failed to create tag file {:?}: {}", target_file, e))?;
    }

    let updated_tags = crate::scanner::scan_model_tags(folder);

    // Update _library_cache.json if it exists
    let mut updated = false;
    if let Some(parent) = folder.parent() {
        updated = update_library_cache_tags(&parent.join("_library_cache.json"), &clean_folder, &updated_tags);
    }
    if !updated {
        if let Ok(cfg) = crate::config::load_config() {
            if !cfg.root_path.is_empty() {
                let _ = update_library_cache_tags(
                    &Path::new(&cfg.root_path).join("_library_cache.json"),
                    &clean_folder,
                    &updated_tags,
                );
            }
        }
    }

    println!("[DEBUG][Tags] Toggled tag '{}' in {}", clean_tag, clean_folder);

    Ok(updated_tags)
}

#[tauri::command]
pub fn set_model_status(
    model_folder_path: String,
    status: String, // "approved" | "needs_fix" | "vip" | "none"
) -> Result<Vec<String>, String> {
    let clean_folder = crate::config::clean_path_str(&model_folder_path);
    let folder = Path::new(&clean_folder);

    if !folder.exists() || !folder.is_dir() {
        return Err(format!("Model folder does not exist: {}", clean_folder));
    }

    let approved_file = folder.join("status_approved");
    let needs_fix_file = folder.join("status_needs_fix");
    let vip_file = folder.join("status_vip");

    match status.to_lowercase().as_str() {
        "approved" => {
            if needs_fix_file.exists() {
                let _ = std::fs::remove_file(&needs_fix_file);
            }
            if !approved_file.exists() {
                std::fs::File::create(&approved_file)
                    .map_err(|e| format!("Failed to create status_approved: {}", e))?;
            }
        }
        "needs_fix" => {
            if approved_file.exists() {
                let _ = std::fs::remove_file(&approved_file);
            }
            if !needs_fix_file.exists() {
                std::fs::File::create(&needs_fix_file)
                    .map_err(|e| format!("Failed to create status_needs_fix: {}", e))?;
            }
        }
        "none" => {
            if approved_file.exists() {
                let _ = std::fs::remove_file(&approved_file);
            }
            if needs_fix_file.exists() {
                let _ = std::fs::remove_file(&needs_fix_file);
            }
        }
        "vip" => {
            if vip_file.exists() {
                let _ = std::fs::remove_file(&vip_file);
            } else {
                std::fs::File::create(&vip_file)
                    .map_err(|e| format!("Failed to create status_vip: {}", e))?;
            }
        }
        other => return Err(format!("Unknown status value: {}", other)),
    }

    let updated_tags = crate::scanner::scan_model_tags(folder);

    // Update _library_cache.json if it exists
    let mut updated = false;
    if let Some(parent) = folder.parent() {
        updated = update_library_cache_tags(&parent.join("_library_cache.json"), &clean_folder, &updated_tags);
    }
    if !updated {
        if let Ok(cfg) = crate::config::load_config() {
            if !cfg.root_path.is_empty() {
                let _ = update_library_cache_tags(
                    &Path::new(&cfg.root_path).join("_library_cache.json"),
                    &clean_folder,
                    &updated_tags,
                );
            }
        }
    }

    println!("[DEBUG][Status] Set status '{}' for folder: {}", status, clean_folder);

    Ok(updated_tags)
}

fn update_library_cache_tags(cache_file: &Path, clean_folder: &str, updated_tags: &[String]) -> bool {
    if !cache_file.exists() {
        return false;
    }
    if let Ok(content) = std::fs::read_to_string(cache_file) {
        if let Ok(mut entries) = serde_json::from_str::<Vec<crate::models::ModelEntry>>(&content) {
            let mut found = false;
            for entry in &mut entries {
                if crate::config::clean_path_str(&entry.folder_path) == clean_folder {
                    entry.tags = updated_tags.to_vec();
                    found = true;
                    break;
                }
            }
            if found {
                if let Ok(json) = serde_json::to_string_pretty(&entries) {
                    let _ = std::fs::write(cache_file, json);
                    return true;
                }
            }
        }
    }
    false
}

/// Tauri command: Saves manual specifications (print time in seconds, weight in grams)
/// into `<model_folder>/_specs.json`, updates `_library_cache.json`, and returns the updated `ModelEntry`.
#[tauri::command]
pub fn save_model_specs(
    model_folder_path: String,
    target_3mf: Option<String>,
    print_time_sec: Option<u64>,
    weight_g: Option<f32>,
) -> Result<crate::models::ModelEntry, String> {
    let clean_folder = crate::config::clean_path_str(model_folder_path.trim());
    let folder = Path::new(&clean_folder);

    if !folder.exists() || !folder.is_dir() {
        return Err(format!(
            "Model folder does not exist or is not a directory: {}",
            clean_folder
        ));
    }

    let specs_path = folder.join("_specs.json");
    let mut specs: crate::models::ModelSpecs = if specs_path.exists() {
        let content = std::fs::read_to_string(&specs_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        crate::models::ModelSpecs::default()
    };

    if let Some(ref filename) = target_3mf {
        let clean_filename = filename.trim().to_string();
        if !clean_filename.is_empty() && clean_filename.to_lowercase() != "all" {
            specs.files.insert(
                clean_filename,
                crate::models::ModelSpecsFileItem {
                    print_time_sec,
                    weight_g,
                },
            );

            // Recompute totals from files if multiple exist
            let mut sum_time = 0u64;
            let mut has_time = false;
            let mut sum_weight = 0.0f32;
            let mut has_weight = false;
            for item in specs.files.values() {
                if let Some(t) = item.print_time_sec {
                    sum_time += t;
                    has_time = true;
                }
                if let Some(w) = item.weight_g {
                    sum_weight += w;
                    has_weight = true;
                }
            }
            specs.total_print_time_sec = if has_time { Some(sum_time) } else { None };
            specs.total_weight_g = if has_weight { Some(sum_weight) } else { None };
        } else {
            specs.total_print_time_sec = print_time_sec;
            specs.total_weight_g = weight_g;
        }
    } else {
        specs.total_print_time_sec = print_time_sec;
        specs.total_weight_g = weight_g;
    }

    let json_specs = serde_json::to_string_pretty(&specs)
        .map_err(|e| format!("Failed to serialize specs: {}", e))?;
    std::fs::write(&specs_path, json_specs)
        .map_err(|e| format!("Failed to write _specs.json: {}", e))?;

    // Update _library_cache.json and return the updated ModelEntry
    let mut updated_entry: Option<crate::models::ModelEntry> = None;
    let try_update_cache = |cache_file: &Path| -> Option<crate::models::ModelEntry> {
        if cache_file.exists() {
            if let Ok(content) = std::fs::read_to_string(cache_file) {
                if let Ok(mut entries) = serde_json::from_str::<Vec<crate::models::ModelEntry>>(&content) {
                    for entry in &mut entries {
                        if crate::config::clean_path_str(&entry.folder_path) == clean_folder {
                            if let Some(ref target) = target_3mf {
                                let clean_target = target.trim().to_string();
                                if !clean_target.is_empty() && clean_target.to_lowercase() != "all" {
                                    let fs_entry = entry.file_specs.entry(clean_target.clone()).or_default();
                                    if print_time_sec.is_some() {
                                        fs_entry.print_time_sec = print_time_sec;
                                    }
                                    if weight_g.is_some() {
                                        fs_entry.total_weight_g = weight_g;
                                    }

                                    for f in &mut entry.filaments {
                                        if f.source_3mf.eq_ignore_ascii_case(&clean_target) {
                                            f.used_grams = weight_g;
                                        }
                                    }

                                    // Sum across file_specs for overall totals
                                    let mut sum_time = 0u64;
                                    let mut has_time = false;
                                    let mut sum_weight = 0.0f32;
                                    let mut has_weight = false;
                                    for fs in entry.file_specs.values() {
                                        if let Some(t) = fs.print_time_sec {
                                            sum_time += t;
                                            has_time = true;
                                        }
                                        if let Some(w) = fs.total_weight_g {
                                            sum_weight += w;
                                            has_weight = true;
                                        }
                                    }
                                    entry.print_time_sec = if has_time { Some(sum_time) } else { specs.total_print_time_sec };
                                    entry.total_weight_g = if has_weight { Some(sum_weight) } else { specs.total_weight_g };
                                } else {
                                    entry.print_time_sec = specs.total_print_time_sec;
                                    entry.total_weight_g = specs.total_weight_g;
                                }
                            } else {
                                entry.print_time_sec = specs.total_print_time_sec;
                                entry.total_weight_g = specs.total_weight_g;
                                if entry.formats.threemf.len() == 1 {
                                    let single_name = entry.formats.threemf[0].name.clone();
                                    let fs_entry = entry.file_specs.entry(single_name).or_default();
                                    fs_entry.print_time_sec = print_time_sec;
                                    fs_entry.total_weight_g = weight_g;
                                }
                            }
                            let res = entry.clone();
                            if let Ok(json) = serde_json::to_string_pretty(&entries) {
                                let _ = std::fs::write(cache_file, json);
                            }
                            return Some(res);
                        }
                    }
                }
            }
        }
        None
    };

    if let Some(parent) = folder.parent() {
        updated_entry = try_update_cache(&parent.join("_library_cache.json"));
    }
    if updated_entry.is_none() {
        if let Ok(cfg) = crate::config::load_config() {
            if !cfg.root_path.is_empty() {
                updated_entry = try_update_cache(&Path::new(&cfg.root_path).join("_library_cache.json"));
            }
        }
    }

    let entry = match updated_entry {
        Some(e) => e,
        None => {
            return Err("Model specs saved to _specs.json, but model entry was not found in cache".to_string());
        }
    };

    println!(
        "[DEBUG][Specs] Saved manual specs for {}: time={:?}, weight={:?}",
        clean_folder, entry.print_time_sec, entry.total_weight_g
    );

    Ok(entry)
}

/// Tauri command: Physically renames a model directory in the assets library on drive,
/// rebuilds its ModelEntry metadata, updates `_library_cache.json`, and returns the updated ModelEntry.
#[tauri::command]
pub fn rename_model_folder(
    model_folder_path: String,
    new_name: String,
) -> Result<crate::models::ModelEntry, String> {
    let clean_folder = crate::config::clean_path_str(&model_folder_path);
    let old_path = std::path::PathBuf::from(&clean_folder);

    if !old_path.exists() || !old_path.is_dir() {
        return Err(format!("Model folder does not exist: {}", clean_folder));
    }

    let trimmed = new_name.trim();
    if trimmed.is_empty() {
        return Err("New folder name cannot be empty".to_string());
    }

    if trimmed.chars().any(|c| matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|')) {
        return Err("Folder name contains invalid characters (\\ / : * ? \" < > |)".to_string());
    }

    let parent = old_path
        .parent()
        .ok_or_else(|| "Cannot rename root directory".to_string())?;

    let new_path = parent.join(trimmed);

    if new_path == old_path {
        return Err("New folder name is identical to current name".to_string());
    }

    if new_path.exists() {
        return Err(format!("A model folder named '{}' already exists in the library", trimmed));
    }

    println!(
        "[DEBUG][Rename] Physically renaming folder: {:?} -> {:?}",
        old_path, new_path
    );

    std::fs::rename(&old_path, &new_path)
        .map_err(|e| format!("Failed to rename folder on disk: {}", e))?;

    // Determine root directory (parent of model folder is the library root)
    let root = parent;

    // Rescan the newly renamed single model folder
    let model_entry = crate::scanner::scan_single_model_entry(&new_path, root)?;

    // Update _library_cache.json: remove old folder entry, insert new entry
    let cache_path = root.join("_library_cache.json");
    let mut cache_map = crate::scanner::load_library_cache(&cache_path);
    cache_map.remove(&clean_folder);
    cache_map.remove(&old_path.to_string_lossy().to_string());
    cache_map.insert(model_entry.folder_path.clone(), model_entry.clone());

    let mut all_models: Vec<crate::models::ModelEntry> = cache_map.into_values().collect();
    all_models.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    crate::scanner::save_library_cache(&cache_path, &all_models);

    println!(
        "[DEBUG][Rename] Completed rename. New model entry: '{}', folder: {:?}",
        model_entry.name, model_entry.folder_path
    );

    Ok(model_entry)
}

/// Tauri command: Physically deletes a model directory and all its files from disk,
/// cleans up associated plate thumbnails in `.thumbnails/`, and updates `_library_cache.json`.
#[tauri::command]
pub fn delete_model(model_folder_path: String) -> Result<(), String> {
    let clean_folder = crate::config::clean_path_str(&model_folder_path);
    let path = std::path::PathBuf::from(&clean_folder);

    if !path.exists() {
        return Err(format!("Model folder does not exist: {}", clean_folder));
    }
    if !path.is_dir() {
        return Err(format!("Target path is not a directory: {}", clean_folder));
    }

    // Safety guard: ensure this is not the root or empty
    let parent = path
        .parent()
        .ok_or_else(|| "Cannot delete filesystem root directory".to_string())?;

    if let Ok(cfg) = crate::config::load_config() {
        if !cfg.root_path.is_empty() {
            let clean_root = crate::config::clean_path_str(&cfg.root_path);
            let root_buf = std::path::PathBuf::from(&clean_root);
            if path == root_buf {
                return Err("Safety guard: Cannot delete the entire library root directory!".to_string());
            }
        }
    }

    println!("[DEBUG][Delete] Removing model directory permanently: {:?}", path);

    // Physically delete directory and all its contents
    std::fs::remove_dir_all(&path)
        .map_err(|e| format!("Failed to delete folder {:?}: {}", path, e))?;

    // Update _library_cache.json in the library root (parent of model folder)
    let root = parent;
    let cache_path = root.join("_library_cache.json");
    if cache_path.exists() {
        let mut cache_map = crate::scanner::load_library_cache(&cache_path);
        cache_map.remove(&clean_folder);
        cache_map.remove(&path.to_string_lossy().to_string());

        let mut all_models: Vec<crate::models::ModelEntry> = cache_map.into_values().collect();
        all_models.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        crate::scanner::save_library_cache(&cache_path, &all_models);
    }

    // Clean up plate thumbnails in root's .thumbnails directory
    let thumbnails_dir = root.join(".thumbnails");
    if thumbnails_dir.exists() {
        let model_name = path
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        let clean_model_name = model_name
            .chars()
            .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
            .collect::<String>();
        if let Ok(entries) = std::fs::read_dir(&thumbnails_dir) {
            for entry in entries.flatten() {
                let fname = entry.file_name().to_string_lossy().to_string();
                if fname.starts_with(&format!("{}_", clean_model_name)) {
                    let _ = std::fs::remove_file(entry.path());
                }
            }
        }
    }

    println!("[DEBUG][Delete] Model successfully deleted from disk and cache: {}", clean_folder);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rename_model_folder() {
        let temp_dir = std::env::temp_dir().join("test_bambu_rename_model");
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();

        let model_dir = temp_dir.join("OldModelName");
        std::fs::create_dir_all(&model_dir).unwrap();
        std::fs::write(model_dir.join("test.3mf"), b"dummy 3mf").unwrap();

        // Invalid name: empty
        let res_empty = rename_model_folder(model_dir.to_string_lossy().to_string(), "   ".to_string());
        assert!(res_empty.is_err());

        // Invalid name: illegal chars
        let res_invalid_chars = rename_model_folder(model_dir.to_string_lossy().to_string(), "Invalid/Name".to_string());
        assert!(res_invalid_chars.is_err());

        // Identical name
        let res_identical = rename_model_folder(model_dir.to_string_lossy().to_string(), "OldModelName".to_string());
        assert!(res_identical.is_err());

        // Successful rename
        let res = rename_model_folder(model_dir.to_string_lossy().to_string(), "NewModelName".to_string());
        assert!(res.is_ok());
        let updated = res.unwrap();
        assert_eq!(updated.name, "NewModelName");
        assert!(!model_dir.exists());
        assert!(temp_dir.join("NewModelName").exists());

        // Cleanup
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_delete_model() {
        let temp_dir = std::env::temp_dir().join("test_bambu_delete_model");
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();

        let model_dir = temp_dir.join("ModelToDelete");
        std::fs::create_dir_all(&model_dir).unwrap();
        std::fs::write(model_dir.join("test.3mf"), b"dummy 3mf").unwrap();

        assert!(model_dir.exists());

        let res = delete_model(model_dir.to_string_lossy().to_string());
        assert!(res.is_ok());
        assert!(!model_dir.exists());

        // Cleanup
        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}


