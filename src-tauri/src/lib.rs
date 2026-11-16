//! Partie native de Second cerveau sur PC (reprise de MonBudgetPro) : fenêtre,
//! enregistrement de fichiers et reprise du budget de MonBudgetPro déjà installé.
//! Les notes et le budget sont gardés par la vue web (IndexedDB / localStorage),
//! dans le dossier de données de l'application.

use std::fs;
use std::io::Write;
use std::path::Path;

use tauri::{AppHandle, Manager};

fn decode_b64(base64: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.decode(base64).map_err(|e| format!("Données invalides: {e}"))
}

/// Écriture atomique : fichier temporaire puis renommage, jamais de fichier à moitié écrit.
fn write_bytes_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    let mut file = fs::File::create(&tmp).map_err(|e| e.to_string())?;
    file.write_all(bytes).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    drop(file);
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_binary_file(path: String, base64: String) -> Result<(), String> {
    write_bytes_atomic(Path::new(&path), &decode_b64(&base64)?)
}

/// Sauvegarde de MonBudgetPro (application de bureau) si elle existe sur ce PC :
/// %APPDATA%\fr.monbudgetpro.app\budget.json sous Windows.
#[tauri::command]
fn legacy_budget(app: AppHandle) -> Result<Option<String>, String> {
    let dir = app.path().data_dir().map_err(|e| e.to_string())?;
    let path = dir.join("fr.monbudgetpro.app").join("budget.json");
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(&path).map_err(|e| format!("Lecture de {} impossible: {e}", path.display()))?;
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(&bytes);
    Ok(Some(String::from_utf8_lossy(bytes).into_owned()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![write_binary_file, legacy_budget])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de Second cerveau");
}
