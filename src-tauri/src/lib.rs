use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::Manager;

struct ServerHandle(Mutex<Option<Child>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // In release builds, spawn the embedded Node server as a sidecar.
            // In dev, `beforeDevCommand` already runs it via npm.
            #[cfg(not(debug_assertions))]
            {
                let resource_path = app
                    .path()
                    .resource_dir()
                    .expect("resource dir")
                    .join("ifrag-server");
                let child = Command::new("node")
                    .arg(resource_path.join("bin").join("ifrag.js"))
                    .arg("--no-open")
                    .arg("--port")
                    .arg("4173")
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn();
                if let Ok(child) = child {
                    app.manage(ServerHandle(Mutex::new(Some(child))));
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(handle) = window.app_handle().try_state::<ServerHandle>() {
                    if let Ok(mut guard) = handle.0.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
