//! Acesso à tabela `task_categories`.

use rusqlite::{params, Connection};

use crate::domain::task_categories::{CategoryColor, TaskCategory, ValidCategory};
use crate::error::{AppError, AppResult};

pub const CATEGORY_NOT_FOUND: &str = "categoria não encontrada";

/// Categorias em ordem alfabética, com a quantidade de tarefas de cada uma.
pub fn list(connection: &Connection) -> AppResult<Vec<TaskCategory>> {
    let mut statement = connection.prepare(
        "SELECT c.id, c.name, c.color,
                (SELECT COUNT(*) FROM tasks t WHERE t.category_id = c.id)
         FROM task_categories c
         ORDER BY c.name COLLATE NOCASE, c.id",
    )?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, u32>(3)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    rows.into_iter()
        .map(|(id, name, color, task_count)| {
            Ok(TaskCategory {
                id,
                name,
                color: CategoryColor::parse(&color)?,
                task_count,
            })
        })
        .collect()
}

pub fn find(connection: &Connection, id: i64) -> AppResult<Option<TaskCategory>> {
    Ok(list(connection)?
        .into_iter()
        .find(|category| category.id == id))
}

pub fn count(connection: &Connection) -> AppResult<usize> {
    let count: i64 =
        connection.query_row("SELECT COUNT(*) FROM task_categories", [], |row| row.get(0))?;
    Ok(count as usize)
}

/// Retorna o id da nova categoria.
pub fn insert(connection: &Connection, category: &ValidCategory) -> AppResult<i64> {
    ensure_unique_name(connection, &category.name, None)?;
    connection.execute(
        "INSERT INTO task_categories (name, color) VALUES (?1, ?2)",
        params![category.name, category.color.as_str()],
    )?;
    Ok(connection.last_insert_rowid())
}

pub fn update(connection: &Connection, id: i64, category: &ValidCategory) -> AppResult<()> {
    ensure_unique_name(connection, &category.name, Some(id))?;
    let changed = connection.execute(
        "UPDATE task_categories
         SET name = ?2, color = ?3, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1",
        params![id, category.name, category.color.as_str()],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(CATEGORY_NOT_FOUND));
    }
    Ok(())
}

/// Exclui a categoria; as tarefas ficam sem categoria (`ON DELETE SET NULL`).
/// Retorna o nome excluído e quantas tarefas usavam a categoria.
pub fn delete(connection: &Connection, id: i64) -> AppResult<(String, u32)> {
    let category = find(connection, id)?.ok_or(AppError::NotFound(CATEGORY_NOT_FOUND))?;
    connection.execute("DELETE FROM task_categories WHERE id = ?1", [id])?;
    Ok((category.name, category.task_count))
}

/// Nomes são únicos sem diferenciar maiúsculas (inclusive letras acentuadas,
/// que o `COLLATE NOCASE` do SQLite não cobre).
fn ensure_unique_name(
    connection: &Connection,
    name: &str,
    except_id: Option<i64>,
) -> AppResult<()> {
    let wanted = name.to_lowercase();
    let mut statement = connection.prepare("SELECT id, name FROM task_categories")?;
    let clash = statement
        .query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?
        .into_iter()
        .any(|(id, existing)| Some(id) != except_id && existing.to_lowercase() == wanted);
    if clash {
        return Err(AppError::Validation(format!(
            "já existe uma categoria chamada “{name}”"
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn valid(name: &str, color: CategoryColor) -> ValidCategory {
        ValidCategory {
            name: name.into(),
            color,
        }
    }

    fn with_db(test: impl FnOnce(&Connection) -> AppResult<()>) {
        let db = Database::open_in_memory().unwrap();
        db.with_connection(|connection| test(connection)).unwrap();
    }

    #[test]
    fn inserts_lists_and_counts_tasks() {
        with_db(|connection| {
            let work = insert(connection, &valid("Trabalho", CategoryColor::Blue))?;
            insert(connection, &valid("casa", CategoryColor::Green))?;
            connection.execute(
                "INSERT INTO tasks (title, category_id) VALUES ('Relatório', ?1)",
                [work],
            )?;

            let categories = list(connection)?;
            let names: Vec<_> = categories.iter().map(|c| c.name.as_str()).collect();
            assert_eq!(names, vec!["casa", "Trabalho"]);
            assert_eq!(categories[1].task_count, 1);
            assert_eq!(categories[1].color, CategoryColor::Blue);
            assert_eq!(count(connection)?, 2);
            Ok(())
        });
    }

    #[test]
    fn rejects_duplicate_names_ignoring_case() {
        with_db(|connection| {
            let id = insert(connection, &valid("Área", CategoryColor::Red))?;
            assert!(matches!(
                insert(connection, &valid("área", CategoryColor::Red)),
                Err(AppError::Validation(_))
            ));
            // Renomear a própria categoria (mudando a caixa) é permitido.
            update(connection, id, &valid("ÁREA", CategoryColor::Violet))?;
            assert_eq!(find(connection, id)?.unwrap().name, "ÁREA");
            assert!(matches!(
                update(connection, 999, &valid("Outra", CategoryColor::Red)),
                Err(AppError::NotFound(_))
            ));
            Ok(())
        });
    }

    #[test]
    fn delete_detaches_tasks() {
        with_db(|connection| {
            let id = insert(connection, &valid("Estudos", CategoryColor::Teal))?;
            connection.execute(
                "INSERT INTO tasks (title, category_id) VALUES ('Ler', ?1)",
                [id],
            )?;

            assert_eq!(delete(connection, id)?, ("Estudos".to_string(), 1));
            let category: Option<i64> =
                connection.query_row("SELECT category_id FROM tasks", [], |row| row.get(0))?;
            assert_eq!(category, None);
            assert!(matches!(delete(connection, id), Err(AppError::NotFound(_))));
            Ok(())
        });
    }
}
