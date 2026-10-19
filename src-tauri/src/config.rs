use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagDefinition {
    pub id: String,
    pub label: String,
    pub icon: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default)]
    pub root_path: String,
    #[serde(default = "default_bambu_studio_exe_path")]
    pub bambu_studio_exe_path: String,
    #[serde(default = "default_cost_per_kg")]
    pub default_cost_per_kg: f32,
    #[serde(default = "default_currency_symbol")]
    pub currency_symbol: String,
    #[serde(default = "default_last_updated_by")]
    pub last_updated_by: String,
    #[serde(default = "default_available_tags")]
    pub available_tags: Vec<TagDefinition>,
}

fn default_bambu_studio_exe_path() -> String {
    r"C:\Program Files\Bambu Studio\bambu-studio.exe".to_string()
}

fn default_cost_per_kg() -> f32 {
    85.0
}

fn default_currency_symbol() -> String {
    "¥".to_string()
}

fn default_last_updated_by() -> String {
    "System".to_string()
}

fn default_available_tags() -> Vec<TagDefinition> {
    vec![
        TagDefinition { id: "people".into(), label: "People & Characters".into(), icon: "User".into(), color: "#3B82F6".into() },
        TagDefinition { id: "vehicle".into(), label: "Vehicles".into(), icon: "Car".into(), color: "#F59E0B".into() },
        TagDefinition { id: "furniture".into(), label: "Furniture".into(), icon: "Armchair".into(), color: "#10B981".into() },
        TagDefinition { id: "architecture".into(), label: "Architecture".into(), icon: "Building2".into(), color: "#8B5CF6".into() },
        TagDefinition { id: "props".into(), label: "Props & Accessories".into(), icon: "Package".into(), color: "#EC4899".into() },
        TagDefinition { id: "nature".into(), label: "Nature & Terrain".into(), icon: "Trees".into(), color: "#22C55E".into() },
        TagDefinition { id: "mechanical".into(), label: "Mechanical / Functional".into(), icon: "Cog".into(), color: "#64748B".into() },
        TagDefinition { id: "diorama".into(), label: "Diorama Sets".into(), icon: "Layers".into(), color: "#06B6D4".into() },
    ]
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            root_path: String::new(),
            bambu_studio_exe_path: default_bambu_studio_exe_path(),
            default_cost_per_kg: default_cost_per_kg(),
            currency_symbol: default_currency_symbol(),
            last_updated_by: default_last_updated_by(),
            available_tags: default_available_tags(),
        }
    }
}

/// Strips Windows verbatim prefixes (e.g. `\\?\` or `\\?\UNC\`) to maintain Explorer compatibility.
pub fn strip_verbatim_prefix(path_str: &str) -> String {
    if let Some(stripped) = path_str.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{}", stripped)
    } else if let Some(stripped) = path_str.strip_prefix(r"\\?\") {
        stripped.to_string()
    } else {
        path_str.to_string()
    }
}

/// Normalizes path using `dunce::canonicalize` with fallback to clean string, guaranteeing no `\\?\` prefix.
pub fn clean_path_str(path: &str) -> String {
    let p = Path::new(path);
    let canonical = match dunce::canonicalize(p) {
        Ok(c) => c.to_string_lossy().to_string(),
        Err(_) => path.to_string(),
    };
    strip_verbatim_prefix(&canonical)
}

/// Resolves the base directory where `config.json` resides.
/// In release mode: directory containing the executable.
/// In debug mode (`cfg!(debug_assertions)`): workspace root directory.
pub fn get_app_base_dir() -> Result<PathBuf, String> {
    #[cfg(debug_assertions)]
    {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let workspace_root = manifest_dir.parent().unwrap_or(&manifest_dir).to_path_buf();
        let canonical = dunce::canonicalize(&workspace_root).unwrap_or(workspace_root);
        let cleaned_str = strip_verbatim_prefix(&canonical.to_string_lossy());
        Ok(PathBuf::from(cleaned_str))
    }

    #[cfg(not(debug_assertions))]
    {
        let exe = std::env::current_exe().map_err(|e| format!("Failed to get current executable path: {}", e))?;
        let parent = exe.parent().ok_or_else(|| "Failed to get parent directory of executable".to_string())?;
        let canonical = dunce::canonicalize(parent).unwrap_or_else(|_| parent.to_path_buf());
        let cleaned_str = strip_verbatim_prefix(&canonical.to_string_lossy());
        Ok(PathBuf::from(cleaned_str))
    }
}

/// Tauri command: Reads `config.json` from `get_app_base_dir()`. If missing, auto-creates it with default values.
#[tauri::command]
pub fn load_config() -> Result<AppConfig, String> {
    let base_dir = get_app_base_dir()?;
    let config_path = base_dir.join("config.json");

    if !config_path.exists() {
        let default_config = AppConfig::default();
        let json_content = serde_json::to_string_pretty(&default_config)
            .map_err(|e| format!("Failed to serialize default config: {}", e))?;
        std::fs::write(&config_path, json_content)
            .map_err(|e| format!("Failed to write default config.json: {}", e))?;
        println!("[DEBUG][Config] Created default config.json at: {:?}", config_path);
        return Ok(default_config);
    }

    let file_content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config.json at {:?}: {}", config_path, e))?;
    let config: AppConfig = serde_json::from_str(&file_content)
        .map_err(|e| format!("Failed to parse config.json: {}", e))?;

    println!("[DEBUG][Config] Loaded config from {:?}, root_path: {}", config_path, config.root_path);
    Ok(config)
}

/// Tauri command: Normalizes `new_path`, updates `root_path` and `last_updated_by`, and saves to `config.json`.
#[tauri::command]
pub fn save_root_path(new_path: String) -> Result<AppConfig, String> {
    let normalized_path = clean_path_str(&new_path);

    let mut config = load_config().unwrap_or_default();
    config.root_path = normalized_path.clone();

    let username = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "System".to_string());
    config.last_updated_by = username;

    let base_dir = get_app_base_dir()?;
    let config_path = base_dir.join("config.json");

    let json_content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize updated config: {}", e))?;
    std::fs::write(&config_path, json_content)
        .map_err(|e| format!("Failed to save config.json at {:?}: {}", config_path, e))?;

    println!("[DEBUG][Config] Saved root_path: {}", config.root_path);
    Ok(config)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip_verbatim_prefix() {
        assert_eq!(strip_verbatim_prefix(r"\\?\C:\Users\test"), r"C:\Users\test");
        assert_eq!(
            strip_verbatim_prefix(r"\\?\UNC\nas\storage\3d_prints"),
            r"\\nas\storage\3d_prints"
        );
        assert_eq!(strip_verbatim_prefix(r"D:\Models"), r"D:\Models");
    }

    #[test]
    fn test_clean_path_str() {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let cleaned = clean_path_str(manifest_dir);
        assert!(!cleaned.starts_with(r"\\?\"));
    }

    #[test]
    fn test_get_app_base_dir() {
        let base_dir = get_app_base_dir().expect("get_app_base_dir should succeed");
        assert!(base_dir.exists(), "Base dir {:?} must exist", base_dir);
        let config_path = base_dir.join("config.json");
        assert!(config_path.exists(), "config.json should exist in base dir: {:?}", config_path);
    }
}
