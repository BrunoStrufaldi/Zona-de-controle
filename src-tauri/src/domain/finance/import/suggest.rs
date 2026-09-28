//! Sugestões da prévia e conversão das linhas escolhidas em lançamentos.
//!
//! Ordem das sugestões: duplicado/pagamento da fatura (não importar) → regra
//! aprendida pela descrição → regra pela categoria do banco → pagamento de
//! fatura e aplicações (transferências) → entrada ou saída pelo sinal.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::domain::calendar::CalendarDate;
use crate::domain::finance::accounts::AccountKind;
use crate::domain::finance::import::{ImportFormat, StatementLine};
use crate::domain::finance::transactions::{
    ImportedFields, Installment, TransactionStatus, ValidTransaction,
};
use crate::domain::finance::TransactionKind;
use crate::domain::text::fold;
use crate::error::{AppError, AppResult};

/// Palavras que sozinhas não identificam nada ("TRANSF ENVIADA PIX"): uma
/// descrição só com elas não gera nem usa regra.
const GENERIC_WORDS: &[&str] = &[
    "pix",
    "transf",
    "transferencia",
    "enviada",
    "enviado",
    "recebida",
    "recebido",
    "de",
    "da",
    "do",
    "para",
    "via",
    "ted",
    "doc",
    "c6",
    "compra",
    "pagamento",
    "debito",
    "credito",
];

/// Palavras de aplicação/resgate de investimentos.
const INVESTMENT_WORDS: &[&str] = &["cdb", "tesouro", "lci", "lca", "aplicacao", "resgate"];

/// Destino de uma regra aprendida.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuleTarget {
    Category {
        id: i64,
        kind: TransactionKind,
    },
    /// Conta do outro lado de uma transferência.
    Counterpart(i64),
}

pub type Rules = HashMap<String, RuleTarget>;

/// Chave de regra pela descrição: sem acentos, números e pontuação. `None`
/// quando a descrição é genérica demais para identificar algo.
pub fn description_key(description: &str) -> Option<String> {
    let cleaned: String = fold(description)
        .chars()
        .map(|c| if c.is_alphabetic() { c } else { ' ' })
        .collect();
    let words: Vec<&str> = cleaned.split_whitespace().collect();
    let meaningful = words
        .iter()
        .any(|word| word.chars().count() > 1 && !GENERIC_WORDS.contains(word));
    meaningful.then(|| format!("desc:{}", words.join(" ")))
}

/// Chave de regra pela categoria que o banco deu (fatura).
pub fn source_category_key(category: &str) -> Option<String> {
    let folded = fold(category.trim());
    (!folded.is_empty()).then(|| format!("banco:{folded}"))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SuggestionReason {
    /// Já importado antes.
    Duplicate,
    /// Pagamento da fatura anterior dentro da fatura (fica pela conta corrente).
    BillPayment,
    /// Escolha anterior do usuário para a mesma descrição/categoria do banco.
    LearnedRule,
    /// Pagamento da fatura na conta corrente: transferência para o cartão.
    CardPayment,
    /// Aplicação ou resgate: transferência com a conta de investimentos.
    Investment,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LineSuggestion {
    pub include: bool,
    pub kind: TransactionKind,
    pub category_id: Option<i64>,
    pub counterpart_account_id: Option<i64>,
    pub reason: Option<SuggestionReason>,
}

/// Linha da prévia, como a tela mostra.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewLine {
    pub index: usize,
    /// OFX: data do lançamento. Fatura: data da compra (o lançamento usa o vencimento).
    pub date: String,
    pub description: String,
    /// Centavos, positivo.
    pub amount: i64,
    /// Entra na conta (senão, sai).
    pub inflow: bool,
    pub installment: Option<Installment>,
    pub source_category: Option<String>,
    /// Chave da descrição (a mesma das regras): linhas com a mesma chave são
    /// "parecidas" e a tela aplica a categoria escolhida a todas.
    pub description_key: Option<String>,
    pub duplicate: bool,
    pub suggestion: LineSuggestion,
}

pub fn preview_line(
    index: usize,
    line: &StatementLine,
    duplicate: bool,
    rules: &Rules,
    accounts: &[(i64, AccountKind)],
) -> PreviewLine {
    PreviewLine {
        index,
        date: line.date.to_string(),
        description: line.description.clone(),
        amount: line.amount.abs(),
        inflow: line.amount > 0,
        installment: line.installment,
        source_category: line.source_category.clone(),
        description_key: description_key(&line.description),
        duplicate,
        suggestion: suggest(line, duplicate, rules, accounts),
    }
}

fn suggest(
    line: &StatementLine,
    duplicate: bool,
    rules: &Rules,
    accounts: &[(i64, AccountKind)],
) -> LineSuggestion {
    let inflow = line.amount > 0;
    let natural = if inflow {
        TransactionKind::Income
    } else {
        TransactionKind::Expense
    };
    let plain = |include, reason| LineSuggestion {
        include,
        kind: natural,
        category_id: None,
        counterpart_account_id: None,
        reason,
    };
    if duplicate {
        return plain(false, Some(SuggestionReason::Duplicate));
    }
    if line.bill_payment {
        return plain(false, Some(SuggestionReason::BillPayment));
    }

    let keys = [
        description_key(&line.description),
        line.source_category
            .as_deref()
            .and_then(source_category_key),
    ];
    for key in keys.iter().flatten() {
        match rules.get(key) {
            Some(RuleTarget::Category { id, kind }) if *kind == natural => {
                return LineSuggestion {
                    category_id: Some(*id),
                    ..plain(true, Some(SuggestionReason::LearnedRule))
                };
            }
            Some(RuleTarget::Counterpart(account)) => {
                return transfer(*account, SuggestionReason::LearnedRule);
            }
            _ => {}
        }
    }

    let folded = fold(&line.description);
    let first_of = |wanted: AccountKind| {
        accounts
            .iter()
            .find(|(_, kind)| *kind == wanted)
            .map(|(id, _)| *id)
    };
    if !inflow && folded.contains("fatura") {
        if let Some(card) = first_of(AccountKind::CreditCard) {
            return transfer(card, SuggestionReason::CardPayment);
        }
    }
    let words: Vec<&str> = folded
        .split(|c: char| !c.is_alphanumeric())
        .filter(|word| !word.is_empty())
        .collect();
    if words.iter().any(|word| INVESTMENT_WORDS.contains(word)) {
        if let Some(investments) = first_of(AccountKind::Investment) {
            return transfer(investments, SuggestionReason::Investment);
        }
    }
    plain(true, None)
}

fn transfer(counterpart: i64, reason: SuggestionReason) -> LineSuggestion {
    LineSuggestion {
        include: true,
        kind: TransactionKind::Transfer,
        category_id: None,
        counterpart_account_id: Some(counterpart),
        reason: Some(reason),
    }
}

/// Escolha da tela para uma linha a importar.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportDecision {
    pub index: usize,
    pub kind: TransactionKind,
    #[serde(default)]
    pub category_id: Option<i64>,
    #[serde(default)]
    pub counterpart_account_id: Option<i64>,
}

/// Monta o lançamento de uma linha. Valor, data, descrição e identificador vêm
/// do arquivo; a tela só escolhe tipo, categoria e a conta da transferência.
pub fn to_transaction(
    line: &StatementLine,
    decision: &ImportDecision,
    account_id: i64,
    format: ImportFormat,
    statement_date: Option<CalendarDate>,
) -> AppResult<ValidTransaction> {
    let inflow = line.amount > 0;
    let problem =
        |message: &str| AppError::Validation(format!("“{}”: {message}", line.description));
    let (account, transfer_account, category) = match decision.kind {
        TransactionKind::Income if !inflow => {
            return Err(problem("uma saída não pode ser importada como entrada"))
        }
        TransactionKind::Expense if inflow => {
            return Err(problem("uma entrada não pode ser importada como saída"))
        }
        TransactionKind::Transfer => {
            let other = decision
                .counterpart_account_id
                .ok_or_else(|| problem("escolha a outra conta da transferência"))?;
            if other == account_id {
                return Err(problem(
                    "a outra conta da transferência precisa ser diferente da conta importada",
                ));
            }
            // Saindo: desta conta para a outra. Entrando: da outra para esta.
            if inflow {
                (other, Some(account_id), None)
            } else {
                (account_id, Some(other), None)
            }
        }
        _ => (account_id, None, decision.category_id),
    };

    let (date, purchase_date) = match format {
        ImportFormat::Ofx => (line.date, None),
        ImportFormat::C6CardCsv => (
            statement_date
                .ok_or_else(|| AppError::Validation("informe o vencimento da fatura".into()))?,
            Some(line.date),
        ),
    };

    Ok(ValidTransaction {
        account_id: account,
        transfer_account_id: transfer_account,
        category_id: category,
        kind: decision.kind,
        description: line.description.clone(),
        amount: line.amount.abs(),
        date,
        status: TransactionStatus::Paid,
        notes: String::new(),
        tags: Vec::new(),
        imported: Some(ImportedFields {
            external_id: line.external_id.clone(),
            purchase_date,
            installment: line.installment,
        }),
    })
}

/// Regras aprendidas com a escolha de uma linha (a última escolha vence).
pub fn learned_rules(line: &StatementLine, decision: &ImportDecision) -> Vec<(String, RuleTarget)> {
    let description = description_key(&line.description);
    match (
        decision.kind,
        decision.category_id,
        decision.counterpart_account_id,
    ) {
        (TransactionKind::Transfer, _, Some(account)) => description
            .map(|key| (key, RuleTarget::Counterpart(account)))
            .into_iter()
            .collect(),
        (kind, Some(id), _) if kind != TransactionKind::Transfer => {
            let target = RuleTarget::Category { id, kind };
            [
                description,
                line.source_category
                    .as_deref()
                    .and_then(source_category_key),
            ]
            .into_iter()
            .flatten()
            .map(|key| (key, target))
            .collect()
        }
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(description: &str, amount: i64) -> StatementLine {
        StatementLine {
            external_id: format!("ofx:1:{description}"),
            date: CalendarDate::parse("2026-09-10").unwrap(),
            description: description.into(),
            amount,
            installment: None,
            source_category: None,
            bill_payment: false,
        }
    }

    const ACCOUNTS: &[(i64, AccountKind)] = &[
        (1, AccountKind::Checking),
        (2, AccountKind::CreditCard),
        (3, AccountKind::Investment),
    ];

    fn suggestion(line: &StatementLine, rules: &Rules) -> LineSuggestion {
        suggest(line, false, rules, ACCOUNTS)
    }

    #[test]
    fn generic_descriptions_have_no_rule_key() {
        assert_eq!(description_key("TRANSF ENVIADA PIX"), None);
        assert_eq!(description_key("Pix recebido de"), None);
        assert_eq!(
            description_key("Pix recebido de Empresa Exemplo 123"),
            Some("desc:pix recebido de empresa exemplo".into())
        );
        assert_eq!(
            description_key("POSTO EXEMPLO*0042"),
            Some("desc:posto exemplo".into())
        );
        assert_eq!(
            source_category_key("Elétrico"),
            Some("banco:eletrico".into())
        );
    }

    #[test]
    fn default_kind_follows_the_sign() {
        let rules = Rules::new();
        assert_eq!(
            suggestion(&line("Mercado", -100), &rules).kind,
            TransactionKind::Expense
        );
        let salary = suggestion(&line("Salário", 100), &rules);
        assert_eq!(
            (salary.kind, salary.include, salary.reason),
            (TransactionKind::Income, true, None)
        );
    }

    #[test]
    fn duplicates_and_bill_payments_are_left_out() {
        let rules = Rules::new();
        let duplicate = suggest(&line("Mercado", -100), true, &rules, ACCOUNTS);
        assert_eq!(
            (duplicate.include, duplicate.reason),
            (false, Some(SuggestionReason::Duplicate))
        );

        let mut payment = line("Inclusao de Pagamento", 150_000);
        payment.bill_payment = true;
        let suggested = suggestion(&payment, &rules);
        assert!(!suggested.include);
        assert_eq!(suggested.reason, Some(SuggestionReason::BillPayment));
    }

    #[test]
    fn card_payments_and_investments_become_transfers() {
        let rules = Rules::new();
        let card = suggestion(&line("Fatura de cartão", -123_456), &rules);
        assert_eq!(card.kind, TransactionKind::Transfer);
        assert_eq!(card.counterpart_account_id, Some(2));
        assert_eq!(card.reason, Some(SuggestionReason::CardPayment));

        let redeem = suggestion(&line("RESGATE DE CDB", 50_000), &rules);
        assert_eq!(
            (redeem.kind, redeem.counterpart_account_id),
            (TransactionKind::Transfer, Some(3))
        );
        // Sem conta de investimentos, fica como entrada comum.
        let no_investments = suggest(
            &line("RESGATE DE CDB", 50_000),
            false,
            &Rules::new(),
            &ACCOUNTS[..2],
        );
        assert_eq!(no_investments.kind, TransactionKind::Income);
    }

    #[test]
    fn learned_rules_win_and_respect_the_direction() {
        let mut rules = Rules::new();
        rules.insert(
            "desc:posto exemplo".into(),
            RuleTarget::Category {
                id: 7,
                kind: TransactionKind::Expense,
            },
        );
        let fuel = suggestion(&line("POSTO EXEMPLO*0042", -20_000), &rules);
        assert_eq!(
            (fuel.category_id, fuel.reason),
            (Some(7), Some(SuggestionReason::LearnedRule))
        );

        // Estorno do mesmo posto (entrada): a regra de despesa não vale.
        assert_eq!(
            suggestion(&line("POSTO EXEMPLO*0042", 20_000), &rules).category_id,
            None
        );

        let mut snack = line("LANCHONETE NOVA", -3_000);
        snack.source_category = Some("Restaurante / Lanchonete / Bar".into());
        rules.insert(
            "banco:restaurante / lanchonete / bar".into(),
            RuleTarget::Category {
                id: 9,
                kind: TransactionKind::Expense,
            },
        );
        assert_eq!(suggestion(&snack, &rules).category_id, Some(9));
    }

    #[test]
    fn converts_decisions_into_transactions() {
        let expense = ImportDecision {
            index: 0,
            kind: TransactionKind::Expense,
            category_id: Some(5),
            counterpart_account_id: None,
        };
        let valid = to_transaction(
            &line("Mercado", -4_590),
            &expense,
            1,
            ImportFormat::Ofx,
            None,
        )
        .unwrap();
        assert_eq!(
            (valid.account_id, valid.amount, valid.category_id),
            (1, 4_590, Some(5))
        );
        assert_eq!(valid.date.to_string(), "2026-09-10");
        assert_eq!(valid.imported.unwrap().external_id, "ofx:1:Mercado");

        // Entrada importada como saída é recusada.
        assert!(
            to_transaction(&line("Salário", 100), &expense, 1, ImportFormat::Ofx, None).is_err()
        );

        // Resgate (entra na conta importada): sai da conta de investimentos.
        let redeem = ImportDecision {
            index: 1,
            kind: TransactionKind::Transfer,
            category_id: Some(5),
            counterpart_account_id: Some(3),
        };
        let valid = to_transaction(
            &line("RESGATE DE CDB", 50_000),
            &redeem,
            1,
            ImportFormat::Ofx,
            None,
        )
        .unwrap();
        assert_eq!(
            (
                valid.account_id,
                valid.transfer_account_id,
                valid.category_id
            ),
            (3, Some(1), None)
        );
        let same = ImportDecision {
            counterpart_account_id: Some(1),
            ..redeem
        };
        assert!(to_transaction(
            &line("RESGATE DE CDB", 50_000),
            &same,
            1,
            ImportFormat::Ofx,
            None
        )
        .is_err());
    }

    #[test]
    fn card_lines_use_the_due_date() {
        let mut purchase = line("LOJA EXEMPLO", -19_900);
        purchase.installment = Installment::new(3, 6);
        let decision = ImportDecision {
            index: 0,
            kind: TransactionKind::Expense,
            category_id: None,
            counterpart_account_id: None,
        };
        assert!(to_transaction(&purchase, &decision, 2, ImportFormat::C6CardCsv, None).is_err());

        let due = CalendarDate::parse("2026-10-05");
        let valid = to_transaction(&purchase, &decision, 2, ImportFormat::C6CardCsv, due).unwrap();
        assert_eq!(valid.date.to_string(), "2026-10-05");
        let imported = valid.imported.unwrap();
        assert_eq!(
            imported.purchase_date.map(|d| d.to_string()),
            Some("2026-09-10".into())
        );
        assert_eq!(imported.installment, Installment::new(3, 6));
    }

    #[test]
    fn learns_from_the_choices() {
        let mut snack = line("LANCHONETE NOVA", -3_000);
        snack.source_category = Some("Restaurante".into());
        let categorized = ImportDecision {
            index: 0,
            kind: TransactionKind::Expense,
            category_id: Some(9),
            counterpart_account_id: None,
        };
        let rules = learned_rules(&snack, &categorized);
        let keys: Vec<_> = rules.iter().map(|(key, _)| key.as_str()).collect();
        assert_eq!(keys, vec!["desc:lanchonete nova", "banco:restaurante"]);

        let pix = ImportDecision {
            category_id: Some(9),
            ..categorized
        };
        assert!(learned_rules(&line("TRANSF ENVIADA PIX", -10), &pix).is_empty());

        let card = ImportDecision {
            index: 0,
            kind: TransactionKind::Transfer,
            category_id: None,
            counterpart_account_id: Some(2),
        };
        assert_eq!(
            learned_rules(&line("Fatura de cartão", -10), &card),
            vec![(
                "desc:fatura de cartao".to_string(),
                RuleTarget::Counterpart(2)
            )]
        );
    }
}
