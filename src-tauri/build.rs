//! Declara explicitamente os commands do app. Com o manifesto definido, cada
//! command só pode ser chamado se a permissão `allow-<command>` estiver
//! concedida em `capabilities/` (princípio do menor privilégio).

const APP_COMMANDS: &[&str] = &[
    "get_app_info",
    "list_settings",
    "get_setting",
    "set_setting",
    "list_audit_entries",
    "list_battery_providers",
    "list_battery_devices",
    "list_cleanup_categories",
    "list_tasks",
    "list_task_tags",
    "create_task",
    "update_task",
    "move_task",
    "delete_task",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(APP_COMMANDS)),
    )
    .expect("falha ao executar o tauri-build");
}
