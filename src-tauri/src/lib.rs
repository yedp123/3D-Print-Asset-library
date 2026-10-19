pub mod config;
pub mod ingest;
pub mod models;
pub mod scanner;
pub mod shell_ops;
pub mod threemf;

use config::{load_config, save_root_path};
use ingest::ingest_files_to_model;
use scanner::scan_models_directory;
use shell_ops::{launch_in_bambu_studio, reveal_in_explorer, toggle_model_tag, save_model_specs, set_model_status, rename_model_folder, delete_model};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_root_path,
            reveal_in_explorer,
            launch_in_bambu_studio,
            scan_models_directory,
            toggle_model_tag,
            save_model_specs,
            set_model_status,
            ingest_files_to_model,
            rename_model_folder,
            delete_model,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
