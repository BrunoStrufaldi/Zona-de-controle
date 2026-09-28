//! Leitor de extrato OFX (1.x SGML e 2.x XML). Só lê o que importa: os
//! lançamentos (`<STMTTRN>`), o banco e o tipo de conta.
//!
//! Cada valor vai de `<TAG>` até o próximo `<` ou fim de linha, o que cobre
//! tags com e sem fechamento. O identificador do lançamento é o FITID, que o
//! banco garante único.

use crate::domain::calendar::CalendarDate;
use crate::domain::finance::accounts::AccountKind;
use crate::domain::finance::import::{
    clean_description, parse_cents, ImportFormat, ParsedStatement, StatementLine,
};
use crate::error::{AppError, AppResult};

pub fn parse(content: &str) -> AppResult<ParsedStatement> {
    let upper = content.to_ascii_uppercase();
    let bank = tag_value(content, &upper, "BANKID").unwrap_or_default();
    let account_kind = tag_value(content, &upper, "ACCTTYPE").and_then(|kind| {
        match kind.to_ascii_uppercase().as_str() {
            "CHECKING" => Some(AccountKind::Checking),
            "SAVINGS" | "MONEYMRKT" => Some(AccountKind::Savings),
            "CREDITLINE" => Some(AccountKind::CreditCard),
            _ => None,
        }
    });
    // Extrato de cartão em OFX usa CCSTMTRS em vez de STMTRS.
    let account_kind = account_kind.or_else(|| {
        upper
            .contains("<CCSTMTRS>")
            .then_some(AccountKind::CreditCard)
    });

    let lines = blocks(content, &upper, "STMTTRN")
        .enumerate()
        .map(|(index, (block, block_upper))| {
            parse_transaction(block, block_upper, &bank).map_err(|problem| {
                AppError::Validation(format!("lançamento {} do OFX: {problem}", index + 1))
            })
        })
        .collect::<AppResult<Vec<_>>>()?;

    Ok(ParsedStatement {
        format: ImportFormat::Ofx,
        lines,
        account_kind,
    })
}

fn parse_transaction(block: &str, upper: &str, bank: &str) -> Result<StatementLine, String> {
    let fitid = tag_value(block, upper, "FITID").ok_or("sem identificador (FITID)")?;
    let posted = tag_value(block, upper, "DTPOSTED").ok_or("sem data (DTPOSTED)")?;
    let date = ofx_date(&posted).ok_or_else(|| format!("data inválida: {posted}"))?;
    let raw_amount = tag_value(block, upper, "TRNAMT").ok_or("sem valor (TRNAMT)")?;
    let amount = parse_cents(&raw_amount).ok_or_else(|| format!("valor inválido: {raw_amount}"))?;
    if amount == 0 {
        return Err("valor zerado".into());
    }
    let memo = tag_value(block, upper, "MEMO").filter(|value| !value.is_empty());
    let name = tag_value(block, upper, "NAME").filter(|value| !value.is_empty());
    let description = clean_description(&memo.or(name).unwrap_or_else(|| "Sem descrição".into()));

    Ok(StatementLine {
        external_id: format!("ofx:{bank}:{fitid}"),
        date,
        description,
        amount,
        installment: None,
        source_category: None,
        bill_payment: false,
    })
}

/// `20260928000000[-3:BRT]` → 2026-09-28 (só a data; o horário e o fuso são ignorados).
fn ofx_date(value: &str) -> Option<CalendarDate> {
    let digits = value.get(..8)?;
    if !digits.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    CalendarDate::parse(&format!(
        "{}-{}-{}",
        &digits[..4],
        &digits[4..6],
        &digits[6..8]
    ))
}

/// Valor da primeira ocorrência de `<TAG>` (sem diferenciar maiúsculas).
fn tag_value(text: &str, upper: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let start = upper.find(&open)? + open.len();
    let rest = &text[start..];
    let end = rest.find(['<', '\n', '\r']).unwrap_or(rest.len());
    Some(decode_entities(rest[..end].trim()))
}

/// Trechos entre `<TAG>` e `</TAG>`, com a versão em maiúsculas ao lado.
fn blocks<'a>(
    text: &'a str,
    upper: &'a str,
    tag: &str,
) -> impl Iterator<Item = (&'a str, &'a str)> + 'a {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let mut cursor = 0;
    std::iter::from_fn(move || {
        let start = cursor + upper[cursor..].find(&open)? + open.len();
        let end = upper[start..]
            .find(&close)
            .map(|offset| start + offset)
            // Sem fechamento: vai até o próximo bloco (ou o fim).
            .or_else(|| upper[start..].find(&open).map(|offset| start + offset))
            .unwrap_or(upper.len());
        cursor = end;
        Some((&text[start..end], &upper[start..end]))
    })
}

fn decode_entities(value: &str) -> String {
    value
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Amostra FICTÍCIA no formato do extrato do C6 (OFX 1.02 SGML, tags fechadas).
    const SAMPLE: &str = "OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:UTF-8
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS>
<DTSERVER>20260928120000[-3:BRT]</DTSERVER><LANGUAGE>POR</LANGUAGE>
<FI><ORG>BANCO EXEMPLO S.A.</ORG><FID>999</FID></FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><TRNUID>1</TRNUID>
<STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS>
<STMTRS><CURDEF>BRL</CURDEF>
<BANKACCTFROM><BANKID>999</BANKID><ACCTID>123456789</ACCTID><ACCTTYPE>CHECKING</ACCTTYPE></BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260901000000[-3:BRT]</DTSTART><DTEND>20260928000000[-3:BRT]</DTEND>
<STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20260902000000[-3:BRT]</DTPOSTED>
<TRNAMT>-45.90</TRNAMT>
<FITID>000000000000000000000000000000000001</FITID>
<REFNUM>AB0001</REFNUM>
<MEMO>TRANSF ENVIADA PIX</MEMO>
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT</TRNTYPE>
<DTPOSTED>20260905103000[-3:BRT]</DTPOSTED>
<TRNAMT>5000.00</TRNAMT>
<FITID>000000000000000000000000000000000002</FITID>
<MEMO>Pix recebido de EMPRESA EXEMPLO LTDA</MEMO>
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20260910000000[-3:BRT]</DTPOSTED>
<TRNAMT>-1234.56</TRNAMT>
<FITID>000000000000000000000000000000000003</FITID>
<MEMO>Fatura de cartão</MEMO>
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>
";

    #[test]
    fn reads_the_transactions() {
        let parsed = parse(SAMPLE).unwrap();
        assert_eq!(parsed.format, ImportFormat::Ofx);
        assert_eq!(parsed.account_kind, Some(AccountKind::Checking));
        assert_eq!(parsed.lines.len(), 3);

        let first = &parsed.lines[0];
        assert_eq!(first.date.to_string(), "2026-09-02");
        assert_eq!(first.amount, -4_590);
        assert_eq!(first.description, "TRANSF ENVIADA PIX");
        assert_eq!(
            first.external_id,
            "ofx:999:000000000000000000000000000000000001"
        );
        assert_eq!(parsed.lines[1].amount, 500_000);
        assert_eq!(parsed.lines[1].date.to_string(), "2026-09-05");
        assert_eq!(parsed.lines[2].description, "Fatura de cartão");
    }

    #[test]
    fn reads_sgml_without_closing_tags() {
        let sgml = "<OFX><BANKACCTFROM><BANKID>1<ACCTTYPE>SAVINGS</BANKACCTFROM>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260101<TRNAMT>10,50<FITID>A1<NAME>Rendimento &amp; juros
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260102<TRNAMT>-3<FITID>A2<MEMO>Tarifa
</OFX>";
        let parsed = parse(sgml).unwrap();
        assert_eq!(parsed.account_kind, Some(AccountKind::Savings));
        assert_eq!(parsed.lines.len(), 2);
        assert_eq!(parsed.lines[0].amount, 1_050);
        assert_eq!(parsed.lines[0].description, "Rendimento & juros");
        assert_eq!(parsed.lines[1].external_id, "ofx:1:A2");
        assert_eq!(parsed.lines[1].amount, -300);
    }

    #[test]
    fn reports_broken_transactions() {
        let broken =
            "<OFX><STMTTRN><DTPOSTED>20260101</DTPOSTED><TRNAMT>10</TRNAMT></STMTTRN></OFX>";
        let error = parse(broken).unwrap_err().to_string();
        assert!(
            error.contains("lançamento 1") && error.contains("FITID"),
            "{error}"
        );

        let bad_date = "<OFX><STMTTRN><FITID>1</FITID><DTPOSTED>2026-01-01</DTPOSTED><TRNAMT>1</TRNAMT></STMTTRN></OFX>";
        assert!(parse(bad_date).is_err());
    }
}
