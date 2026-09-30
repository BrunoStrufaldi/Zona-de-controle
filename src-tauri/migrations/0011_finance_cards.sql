-- 0011_finance_cards — Finanças (Fase 5.4): ciclo da fatura dos cartões.
--
-- Dia de fechamento e de vencimento da fatura (só em contas cartão de crédito,
-- os dois juntos ou nenhum; validado no Rust). Compras a partir do dia do
-- fechamento vão para a fatura seguinte. Servem para saber em que fatura cai
-- uma cobrança (recorrentes no cartão, projeção das faturas futuras).
ALTER TABLE finance_accounts ADD COLUMN closing_day INTEGER
    CHECK (closing_day IS NULL OR closing_day BETWEEN 1 AND 31);
ALTER TABLE finance_accounts ADD COLUMN due_day INTEGER
    CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31);

-- Parcelamentos são calculados a partir dos lançamentos com parcela (n/N).
CREATE INDEX idx_finance_transactions_installment ON finance_transactions (account_id, purchase_date)
    WHERE installment_number IS NOT NULL;
