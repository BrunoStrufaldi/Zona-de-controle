-- 0010_finance_recurring — Finanças (Fase 5.3): lançamentos recorrentes.
--
-- A série guarda só a regra (como os eventos do calendário); os vencimentos
-- são calculados no Rust para o período pedido. Cada vencimento é
-- identificado pela data original (`occurrence_date`). Valores em CENTAVOS.

-- Conta fixa ou receita recorrente (aluguel, internet, salário, aporte…).
-- `recurrence` é JSON (frequência, intervalo e fim opcional por data ou número
-- de vezes), validado no Rust. `import_key` é a chave da descrição do extrato
-- aprendida ao vincular uma linha importada: nas próximas importações, a
-- linha com a mesma chave é sugerida para o vencimento mesmo se o valor mudar.
CREATE TABLE finance_recurring (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    kind                TEXT NOT NULL CHECK (kind IN ('income', 'expense', 'transfer')),
    description         TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 120),
    amount              INTEGER NOT NULL CHECK (amount > 0),
    account_id          INTEGER NOT NULL REFERENCES finance_accounts (id) ON DELETE RESTRICT,
    transfer_account_id INTEGER REFERENCES finance_accounts (id) ON DELETE RESTRICT,
    category_id         INTEGER REFERENCES finance_categories (id) ON DELETE SET NULL,
    -- Primeiro vencimento acompanhado (aaaa-mm-dd).
    start_date          TEXT NOT NULL CHECK (length(start_date) = 10 AND date(start_date) = start_date),
    recurrence          TEXT NOT NULL CHECK (json_valid(recurrence)),
    notes               TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
    import_key          TEXT CHECK (import_key IS NULL OR length(import_key) BETWEEN 1 AND 200),
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK ((kind = 'transfer') = (transfer_account_id IS NOT NULL)),
    CHECK (transfer_account_id IS NULL OR transfer_account_id != account_id),
    CHECK (kind != 'transfer' OR category_id IS NULL)
) STRICT;

CREATE INDEX idx_finance_recurring_account ON finance_recurring (account_id);
CREATE INDEX idx_finance_recurring_transfer ON finance_recurring (transfer_account_id)
    WHERE transfer_account_id IS NOT NULL;
CREATE INDEX idx_finance_recurring_category ON finance_recurring (category_id)
    WHERE category_id IS NOT NULL;

-- Vencimentos já resolvidos: vinculados a um lançamento (registrado na tela,
-- vinculado depois ou importado do extrato) ou pulados (`transaction_id` nulo).
-- Excluir o lançamento apaga o vínculo e o vencimento volta a ficar em aberto;
-- excluir a série apaga os vínculos, mas os lançamentos continuam.
CREATE TABLE finance_recurring_occurrences (
    recurring_id    INTEGER NOT NULL REFERENCES finance_recurring (id) ON DELETE CASCADE,
    occurrence_date TEXT NOT NULL
                    CHECK (length(occurrence_date) = 10 AND date(occurrence_date) = occurrence_date),
    transaction_id  INTEGER UNIQUE REFERENCES finance_transactions (id) ON DELETE CASCADE,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (recurring_id, occurrence_date)
) STRICT, WITHOUT ROWID;
