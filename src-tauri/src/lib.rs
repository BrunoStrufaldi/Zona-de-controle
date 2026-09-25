//! Ponto de entrada da camada nativa do Zona de Controle.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("falha ao iniciar o Zona de Controle");
}
