//! Declara explicitamente os commands do app. Com o manifesto definido, cada
//! command só pode ser chamado se a permissão `allow-<command>` estiver
//! concedida em `capabilities/` (princípio do menor privilégio).

const APP_COMMANDS: &[&str] = &[
    "get_app_info",
    "list_settings",
    "get_setting",
    "set_setting",
    "list_audit_entries",
    "list_database_backups",
    "create_database_backup",
    "list_battery_providers",
    "list_battery_devices",
    "list_cleanup_categories",
    "list_tasks",
    "list_archived_tasks",
    "list_task_tags",
    "create_task",
    "update_task",
    "move_task",
    "set_checklist_item_done",
    "archive_task",
    "archive_completed_tasks",
    "restore_task",
    "delete_task",
    "list_task_categories",
    "create_task_category",
    "update_task_category",
    "delete_task_category",
    "list_notes",
    "create_note",
    "update_note",
    "set_note_favorite",
    "delete_note",
    "list_note_versions",
    "restore_note_version",
    "list_note_folders",
    "create_note_folder",
    "rename_note_folder",
    "delete_note_folder",
    "list_routines",
    "create_routine",
    "update_routine",
    "set_habit_done",
    "delete_routine",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(APP_COMMANDS)),
    )
    .expect("falha ao executar o tauri-build");
}
