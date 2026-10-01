use serde::Serialize;
use tauri::{AppHandle, State};

use crate::error::AppResult;
use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub identifier: String,
    pub database_path: String,
    pub schema_version: u32,
    /// Versão anterior quando esta é a primeira abertura depois de atualizar.
    pub updated_from: Option<String>,
}

/// Informações do app e do banco local (somente leitura).
#[tauri::command]
pub async fn get_app_info(app: AppHandle, state: State<'_, AppState>) -> AppResult<AppInfo> {
    let package = app.package_info();
    Ok(AppInfo {
        name: package.name.clone(),
        version: package.version.to_string(),
        identifier: app.config().identifier.clone(),
        database_path: state.database_path.display().to_string(),
        schema_version: state.db.schema_version(),
        updated_from: state.updated_from.clone(),
    })
}

#[cfg(test)]
mod tests {
    use serde_json::Value;

    // A versão do app vem do package.json (o tauri.conf.json aponta para ele) e o
    // atualizador compara esse número. Mude com `npm run version:bump`.
    #[test]
    fn app_version_comes_from_package_json() {
        let package: Value =
            serde_json::from_str(include_str!("../../../package.json")).expect("package.json");
        let config: Value =
            serde_json::from_str(include_str!("../../tauri.conf.json")).expect("tauri.conf.json");

        assert_eq!(config["version"], "../package.json");
        assert_eq!(package["version"], env!("CARGO_PKG_VERSION"));
    }

    // O atualizador instala código: só do endereço HTTPS do projeto, com a
    // assinatura amarrada à versão e sem nenhuma opção "dangerous".
    #[test]
    fn updater_config_stays_safe() {
        let config: Value =
            serde_json::from_str(include_str!("../../tauri.conf.json")).expect("tauri.conf.json");
        let updater = &config["plugins"]["updater"];

        assert_eq!(
            updater["endpoints"],
            serde_json::json!([
                "https://github.com/BrunoStrufaldi/Zona-de-controle/releases/latest/download/latest.json"
            ])
        );
        assert!(updater["pubkey"]
            .as_str()
            .is_some_and(|key| !key.is_empty()));
        assert_eq!(updater["requireSignedVersion"], true);
        let settings = updater.as_object().expect("plugins.updater");
        assert!(
            settings.keys().all(|key| !key.starts_with("dangerous")),
            "{settings:?}"
        );
        // Instalação por usuário: o instalador nunca pede administrador.
        assert_eq!(
            config["bundle"]["windows"]["nsis"]["installMode"],
            "currentUser"
        );
    }
}
