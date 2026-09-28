//! Acesso à tabela `finance_categories`.

use rusqlite::{params, Connection, OptionalExtension};

use crate::domain::finance::categories::{FinanceCategory, ValidCategoryName};
use crate::domain::finance::TransactionKind;
use crate::domain::task_categories::CategoryColor;
use crate::error::{AppError, AppResult};

pub const CATEGORY_NOT_FOUND: &str = "categoria não encontrada";

/// Categorias por tipo (receitas primeiro) e nome, com a quantidade de lançamentos.
pub fn list(connection: &Connection) -> AppResult<Vec<FinanceCategory>> {
    let mut statement = connection.prepare(
        "SELECT c.id, c.kind, c.name, c.color,
                (SELECT COUNT(*) FROM finance_transactions t WHERE t.category_id = c.id)
         FROM finance_categories c
         ORDER BY c.kind = 'expense', c.name COLLATE NOCASE, c.id",
    )?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, u32>(4)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    rows.into_iter()
        .map(|(id, kind, name, color, transaction_count)| {
            Ok(FinanceCategory {
                id,
                kind: TransactionKind::parse(&kind)?,
                name,
                color: CategoryColor::parse(&color)?,
                transaction_count,
            })
        })
        .collect()
}

pub fn find(connection: &Connection, id: i64) -> AppResult<Option<FinanceCategory>> {
    Ok(list(connection)?
        .into_iter()
        .find(|category| category.id == id))
}

pub fn count(connection: &Connection) -> AppResult<usize> {
    let count: i64 =
        connection.query_row("SELECT COUNT(*) FROM finance_categories", [], |row| {
            row.get(0)
        })?;
    Ok(count as usize)
}

/// Tipo da categoria, se ela existir.
pub fn kind_of(connection: &Connection, id: i64) -> AppResult<Option<TransactionKind>> {
    let kind: Option<String> = connection
        .query_row(
            "SELECT kind FROM finance_categories WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .optional()?;
    kind.as_deref().map(TransactionKind::parse).transpose()
}

/// Retorna o id da nova categoria.
pub fn insert(
    connection: &Connection,
    kind: TransactionKind,
    category: &ValidCategoryName,
) -> AppResult<i64> {
    ensure_unique_name(connection, kind, &category.name, None)?;
    connection.execute(
        "INSERT INTO finance_categories (kind, name, color) VALUES (?1, ?2, ?3)",
        params![kind.as_str(), category.name, category.color.as_str()],
    )?;
    Ok(connection.last_insert_rowid())
}

pub fn update(connection: &Connection, id: i64, category: &ValidCategoryName) -> AppResult<()> {
    let kind = kind_of(connection, id)?.ok_or(AppError::NotFound(CATEGORY_NOT_FOUND))?;
    ensure_unique_name(connection, kind, &category.name, Some(id))?;
    connection.execute(
        "UPDATE finance_categories
         SET name = ?2, color = ?3, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1",
        params![id, category.name, category.color.as_str()],
    )?;
    Ok(())
}

/// Exclui a categoria; os lançamentos ficam sem categoria (`ON DELETE SET NULL`).
pub fn delete(connection: &Connection, id: i64) -> AppResult<FinanceCategory> {
    let category = find(connection, id)?.ok_or(AppError::NotFound(CATEGORY_NOT_FOUND))?;
    connection.execute("DELETE FROM finance_categories WHERE id = ?1", [id])?;
    Ok(category)
}

/// Nomes únicos dentro do tipo, sem diferenciar maiúsculas (inclusive acentuadas).
fn ensure_unique_name(
    connection: &Connection,
    kind: TransactionKind,
    name: &str,
    except_id: Option<i64>,
) -> AppResult<()> {
    let wanted = name.to_lowercase();
    let mut statement =
        connection.prepare("SELECT id, name FROM finance_categories WHERE kind = ?1")?;
    let clash = statement
        .query_map([kind.as_str()], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?
        .into_iter()
        .any(|(id, existing)| Some(id) != except_id && existing.to_lowercase() == wanted);
    if clash {
        let kind_label = match kind {
            TransactionKind::Income => "receita",
            _ => "despesa",
        };
        return Err(AppError::Validation(format!(
            "já existe uma categoria de {kind_label} chamada “{name}”"
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn valid(name: &str) -> ValidCategoryName {
        ValidCategoryName {
            name: name.into(),
            color: CategoryColor::Teal,
        }
    }

    fn with_db(test: impl FnOnce(&Connection) -> AppResult<()>) {
        let db = Database::open_in_memory().unwrap();
        db.with_connection(|connection| test(connection)).unwrap();
    }

    #[test]
    fn lists_the_default_categories() {
        with_db(|connection| {
            let categories = list(connection)?;
            assert_eq!(categories.len(), 14);
            // Receitas primeiro, depois despesas, em ordem alfabética.
            assert_eq!(categories[0].kind, TransactionKind::Income);
            assert_eq!(categories[0].name, "Freelance");
            assert_eq!(categories[4].kind, TransactionKind::Expense);
            assert_eq!(categories[4].name, "Alimentação");
            Ok(())
        });
    }

    #[test]
    fn names_are_unique_within_the_kind() {
        with_db(|connection| {
            // "Outros" já existe nos dois tipos.
            assert!(matches!(
                insert(connection, TransactionKind::Expense, &valid("OUTROS")),
                Err(AppError::Validation(_))
            ));
            let pets = insert(connection, TransactionKind::Expense, &valid("Pets"))?;
            insert(connection, TransactionKind::Income, &valid("Pets"))?;
            update(connection, pets, &valid("PETS"))?;
            assert_eq!(find(connection, pets)?.unwrap().name, "PETS");
            assert_eq!(kind_of(connection, pets)?, Some(TransactionKind::Expense));
            assert!(matches!(
                update(connection, 999, &valid("Nada")),
                Err(AppError::NotFound(_))
            ));
            Ok(())
        });
    }

    #[test]
    fn delete_detaches_transactions() {
        with_db(|connection| {
            let id = insert(connection, TransactionKind::Expense, &valid("Viagem"))?;
            connection.execute(
                "INSERT INTO finance_accounts (name, kind, color) VALUES ('C6', 'checking', 'slate')",
                [],
            )?;
            connection.execute(
                "INSERT INTO finance_transactions
                     (account_id, category_id, kind, description, amount, date, status)
                 VALUES (1, ?1, 'expense', 'Hotel', 50000, '2026-09-28', 'paid')",
                [id],
            )?;

            let deleted = delete(connection, id)?;
            assert_eq!(
                (deleted.name.as_str(), deleted.transaction_count),
                ("Viagem", 1)
            );
            let category: Option<i64> = connection.query_row(
                "SELECT category_id FROM finance_transactions",
                [],
                |row| row.get(0),
            )?;
            assert_eq!(category, None);
            assert!(matches!(delete(connection, id), Err(AppError::NotFound(_))));
            Ok(())
        });
    }
}
