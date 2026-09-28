//! Acesso à tabela `finance_import_rules`: sugestões aprendidas na importação.

use rusqlite::{params, Connection};

use crate::domain::finance::import::suggest::{RuleTarget, Rules};
use crate::domain::finance::TransactionKind;
use crate::error::AppResult;

/// Todas as regras, com o tipo da categoria (para respeitar entrada/saída).
pub fn load(connection: &Connection) -> AppResult<Rules> {
    let mut statement = connection.prepare(
        "SELECT r.pattern, r.category_id, c.kind, r.transfer_account_id
         FROM finance_import_rules r
         LEFT JOIN finance_categories c ON c.id = r.category_id",
    )?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<i64>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<i64>>(3)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut rules = Rules::new();
    for (pattern, category, kind, account) in rows {
        let target = match (category, kind, account) {
            (Some(id), Some(kind), _) => RuleTarget::Category {
                id,
                kind: TransactionKind::parse(&kind)?,
            },
            (_, _, Some(account)) => RuleTarget::Counterpart(account),
            _ => continue,
        };
        rules.insert(pattern, target);
    }
    Ok(rules)
}

/// Grava a regra (a última escolha para a mesma chave vence).
pub fn upsert(connection: &Connection, pattern: &str, target: RuleTarget) -> AppResult<()> {
    let (category, account) = match target {
        RuleTarget::Category { id, .. } => (Some(id), None),
        RuleTarget::Counterpart(account) => (None, Some(account)),
    };
    connection.execute(
        "INSERT INTO finance_import_rules (pattern, category_id, transfer_account_id)
         VALUES (?1, ?2, ?3)
         ON CONFLICT (pattern) DO UPDATE
         SET category_id = excluded.category_id,
             transfer_account_id = excluded.transfer_account_id,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        params![pattern, category, account],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    #[test]
    fn stores_and_replaces_rules() {
        let db = Database::open_in_memory().unwrap();
        db.with_connection(|connection| {
            connection.execute(
                "INSERT INTO finance_accounts (name, kind, color) VALUES ('Cartão', 'credit_card', 'slate')",
                [],
            )?;
            let food: i64 = connection.query_row(
                "SELECT id FROM finance_categories WHERE name = 'Alimentação'",
                [],
                |row| row.get(0),
            )?;
            upsert(connection, "desc:mercado exemplo", RuleTarget::Counterpart(1))?;
            upsert(
                connection,
                "desc:mercado exemplo",
                RuleTarget::Category {
                    id: food,
                    kind: TransactionKind::Expense,
                },
            )?;
            upsert(connection, "desc:fatura de cartao", RuleTarget::Counterpart(1))?;

            let rules = load(connection)?;
            assert_eq!(rules.len(), 2);
            assert_eq!(
                rules["desc:mercado exemplo"],
                RuleTarget::Category {
                    id: food,
                    kind: TransactionKind::Expense
                }
            );
            assert_eq!(rules["desc:fatura de cartao"], RuleTarget::Counterpart(1));

            // Excluir a categoria apaga as regras dela.
            connection.execute("DELETE FROM finance_categories WHERE id = ?1", [food])?;
            assert_eq!(load(connection)?.len(), 1);
            Ok(())
        })
        .unwrap();
    }
}
