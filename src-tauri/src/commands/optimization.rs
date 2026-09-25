use crate::domain::optimization::{planned_categories, CleanupCategoryDescriptor};
use crate::error::AppResult;

/// Categorias de limpeza previstas (somente leitura — nada é analisado ou removido).
#[tauri::command]
pub async fn list_cleanup_categories() -> AppResult<Vec<CleanupCategoryDescriptor>> {
    Ok(planned_categories())
}
