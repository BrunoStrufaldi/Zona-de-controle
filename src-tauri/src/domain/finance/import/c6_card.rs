//! Leitor da fatura do cartão do C6 em CSV (separador `;`), com as colunas
//! "Data de Compra", "Final do Cartão", "Categoria", "Descrição", "Parcela" e
//! "Valor (em R$)" (as de nome e dólar são ignoradas).
//!
//! Compras vêm positivas (saem da conta do cartão); créditos, negativos. A
//! fatura não tem identificador por linha: o identificador é montado com os
//! dados da linha (e um contador para linhas idênticas no mesmo arquivo).

use std::collections::HashMap;

use crate::domain::calendar::CalendarDate;
use crate::domain::finance::accounts::AccountKind;
use crate::domain::finance::import::{
    clean_description, parse_cents, ImportFormat, ParsedStatement, StatementLine,
};
use crate::domain::finance::transactions::Installment;
use crate::domain::text::fold;
use crate::error::{AppError, AppResult};

const DELIMITER: char = ';';

/// Colunas obrigatórias (nomes sem acento e em minúsculas).
const PURCHASE_DATE: &str = "data de compra";
const DESCRIPTION: &str = "descricao";
const AMOUNT_BRL: &str = "valor (em r$)";
const INSTALLMENT: &str = "parcela";
const CATEGORY: &str = "categoria";
const CARD_END: &str = "final do cartao";

/// O cabeçalho tem as colunas da fatura do C6?
pub fn looks_like(content: &str) -> bool {
    let header = content.lines().next().map(fold).unwrap_or_default();
    [PURCHASE_DATE, DESCRIPTION, AMOUNT_BRL]
        .iter()
        .all(|column| header.contains(column))
}

pub fn parse(content: &str) -> AppResult<ParsedStatement> {
    let mut rows = content.lines().filter(|line| !line.trim().is_empty());
    let header: Vec<String> = split_row(rows.next().unwrap_or_default())
        .iter()
        .map(|name| fold(name.trim()))
        .collect();
    let column = |name: &str| header.iter().position(|column| column == name);
    let missing = |name: &str| AppError::Validation(format!("a fatura não tem a coluna “{name}”"));
    let date_at = column(PURCHASE_DATE).ok_or_else(|| missing("Data de Compra"))?;
    let description_at = column(DESCRIPTION).ok_or_else(|| missing("Descrição"))?;
    let amount_at = column(AMOUNT_BRL).ok_or_else(|| missing("Valor (em R$)"))?;
    let installment_at = column(INSTALLMENT);
    let category_at = column(CATEGORY);
    let card_at = column(CARD_END);

    let mut seen: HashMap<String, u32> = HashMap::new();
    let mut lines = Vec::new();
    for (index, row) in rows.enumerate() {
        let fields = split_row(row);
        let field = |at: usize| fields.get(at).map(|value| value.trim()).unwrap_or("");
        let problem = |message: String| {
            AppError::Validation(format!("linha {} da fatura: {message}", index + 2))
        };

        let date = br_date(field(date_at))
            .ok_or_else(|| problem(format!("data inválida: {}", field(date_at))))?;
        let value = parse_cents(field(amount_at))
            .ok_or_else(|| problem(format!("valor inválido: {}", field(amount_at))))?;
        if value == 0 {
            continue;
        }
        let description = clean_description(field(description_at));
        let installment_text = installment_at.map(field).unwrap_or("");
        let installment = parse_installment(installment_text);
        let source_category = category_at
            .map(field)
            .filter(|category| !category.is_empty() && *category != "-")
            .map(str::to_string);
        let card = card_at.map(field).unwrap_or("");

        // Compra (positiva na fatura) sai da conta do cartão.
        let amount = -value;
        let fingerprint = format!(
            "c6card:{card}:{date}:{installment_text}:{value}:{}",
            fold(&description).chars().take(100).collect::<String>()
        );
        let occurrence = seen.entry(fingerprint.clone()).or_insert(0);
        *occurrence += 1;
        let external_id = if *occurrence == 1 {
            fingerprint
        } else {
            format!("{fingerprint}#{occurrence}")
        };

        lines.push(StatementLine {
            external_id,
            date,
            bill_payment: amount > 0 && fold(&description).contains("pagamento"),
            description: if description.is_empty() {
                "Sem descrição".into()
            } else {
                description
            },
            amount,
            installment,
            source_category,
        });
    }

    Ok(ParsedStatement {
        format: ImportFormat::C6CardCsv,
        lines,
        account_kind: Some(AccountKind::CreditCard),
    })
}

/// "3/6" → parcela 3 de 6; "Única" ou vazio → sem parcelamento.
fn parse_installment(value: &str) -> Option<Installment> {
    let (number, count) = value.trim().split_once('/')?;
    Installment::new(number.trim().parse().ok()?, count.trim().parse().ok()?)
        .filter(|installment| installment.count > 1)
}

/// `dd/mm/aaaa` → data.
fn br_date(value: &str) -> Option<CalendarDate> {
    let mut parts = value.split('/');
    let (day, month, year) = (parts.next()?, parts.next()?, parts.next()?);
    if parts.next().is_some() || day.len() != 2 || month.len() != 2 || year.len() != 4 {
        return None;
    }
    CalendarDate::parse(&format!("{year}-{month}-{day}"))
}

/// Separa uma linha pelo `;`, respeitando aspas (`"a;b"`) e aspas escapadas (`""`).
fn split_row(row: &str) -> Vec<String> {
    let mut fields = vec![String::new()];
    let mut quoted = false;
    let mut chars = row.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            '"' if quoted && chars.peek() == Some(&'"') => {
                chars.next();
                push(&mut fields, '"');
            }
            '"' => quoted = !quoted,
            DELIMITER if !quoted => fields.push(String::new()),
            _ => push(&mut fields, ch),
        }
    }
    fields
}

fn push(fields: &mut [String], ch: char) {
    if let Some(last) = fields.last_mut() {
        last.push(ch);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Amostra FICTÍCIA no formato da fatura do C6.
    const SAMPLE: &str = "Data de Compra;Nome no Cartão;Final do Cartão;Categoria;Descrição;Parcela;Valor (em US$);Cotação (em R$);Valor (em R$)\r
12/07/2026;FULANO DE TAL;1234;Restaurante / Lanchonete / Bar;LANCHONETE EXEMPLO;Única;0;0;45.90\r
03/06/2026;FULANO DE TAL;1234;Elétrico;LOJA EXEMPLO*ONLINE;3/6;0;0;199.00\r
20/08/2026;FULANO DE TAL;5678;-;Inclusao de Pagamento;Única;0;0;-1500.00\r
21/08/2026;FULANO DE TAL;1234;Entretenimento;\"STREAMING; PLANO\";Única;9.99;5.50;54.95\r
21/08/2026;FULANO DE TAL;1234;Entretenimento;\"STREAMING; PLANO\";Única;9.99;5.50;54.95\r
";

    #[test]
    fn recognizes_the_header() {
        assert!(looks_like(SAMPLE));
        assert!(!looks_like("Data;Descrição;Valor\n"));
    }

    #[test]
    fn reads_purchases_installments_and_credits() {
        let parsed = parse(SAMPLE).unwrap();
        assert_eq!(parsed.format, ImportFormat::C6CardCsv);
        assert_eq!(parsed.account_kind, Some(AccountKind::CreditCard));
        assert_eq!(parsed.lines.len(), 5);

        let snack = &parsed.lines[0];
        assert_eq!(snack.date.to_string(), "2026-07-12");
        assert_eq!(snack.amount, -4_590);
        assert_eq!(snack.installment, None);
        assert_eq!(
            snack.source_category.as_deref(),
            Some("Restaurante / Lanchonete / Bar")
        );

        let store = &parsed.lines[1];
        assert_eq!(store.installment, Installment::new(3, 6));
        assert_eq!(store.amount, -19_900);

        let payment = &parsed.lines[2];
        assert!(payment.bill_payment);
        assert_eq!(payment.amount, 150_000);
        assert_eq!(payment.source_category, None);

        // Campo entre aspas com `;` e compras idênticas no mesmo arquivo.
        assert_eq!(parsed.lines[3].description, "STREAMING; PLANO");
        assert_ne!(parsed.lines[3].external_id, parsed.lines[4].external_id);
        assert!(parsed.lines[4].external_id.ends_with("#2"));
    }

    #[test]
    fn the_same_line_gets_the_same_id_in_another_file() {
        let again = parse(SAMPLE).unwrap();
        assert_eq!(
            parse(SAMPLE).unwrap().lines[1].external_id,
            again.lines[1].external_id
        );
        // A próxima parcela da mesma compra é outra linha.
        let next = SAMPLE.replace(";3/6;", ";4/6;");
        assert_ne!(
            parse(&next).unwrap().lines[1].external_id,
            again.lines[1].external_id
        );
    }

    #[test]
    fn reports_invalid_rows() {
        let bad = "Data de Compra;Descrição;Valor (em R$)\n31/02/2026;X;10.00\n";
        let error = parse(bad).unwrap_err().to_string();
        assert!(error.contains("linha 2"), "{error}");
        assert!(parse("Data de Compra;Descrição\n").is_err());
    }

    #[test]
    fn splits_quoted_fields() {
        assert_eq!(
            split_row("a;\"b;c\";\"d \"\"e\"\"\""),
            vec!["a", "b;c", "d \"e\""]
        );
        assert_eq!(parse_installment("10/12"), Installment::new(10, 12));
        assert_eq!(parse_installment("Única"), None);
        assert_eq!(parse_installment("1/1"), None);
        assert_eq!(
            br_date("05/09/2026").map(|d| d.to_string()),
            Some("2026-09-05".into())
        );
        assert_eq!(br_date("5/9/2026"), None);
    }
}
