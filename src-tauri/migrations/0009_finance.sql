-- 0009_finance — Finanças (Fases 5.1 e 5.2): contas, categorias, lançamentos,
-- transferências e importação de extratos.
--
-- Valores monetários em CENTAVOS (inteiros); a conversão para reais acontece só
-- na exibição. Cores são nomes da paleta de tokens do frontend (nunca hexadecimal).

-- Contas onde o dinheiro está (conta corrente, cartão, dinheiro, investimentos…).
-- O saldo é calculado: saldo inicial + entradas pagas − saídas pagas ± transferências pagas.
CREATE TABLE finance_accounts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL UNIQUE COLLATE NOCASE
                    CHECK (length(trim(name)) BETWEEN 1 AND 40),
    kind            TEXT NOT NULL
                    CHECK (kind IN ('checking', 'savings', 'credit_card', 'cash', 'investment', 'other')),
    color           TEXT NOT NULL
                    CHECK (color IN ('red', 'orange', 'amber', 'green', 'teal',
                                     'blue', 'violet', 'pink', 'slate')),
    -- Pode ser negativo (ex.: fatura em aberto ao começar a usar o app).
    opening_balance INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- Categorias de receita ou de despesa. O nome é único dentro do tipo (sem
-- diferenciar caixa), então "Outros" pode existir nos dois.
CREATE TABLE finance_categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    kind       TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
    name       TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(name)) BETWEEN 1 AND 40),
    color      TEXT NOT NULL
               CHECK (color IN ('red', 'orange', 'amber', 'green', 'teal',
                                'blue', 'violet', 'pink', 'slate')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (kind, name)
) STRICT;

-- Categorias iniciais (editáveis e removíveis pelo usuário).
INSERT INTO finance_categories (kind, name, color) VALUES
    ('expense', 'Moradia', 'blue'),
    ('expense', 'Alimentação', 'orange'),
    ('expense', 'Transporte', 'amber'),
    ('expense', 'Saúde', 'red'),
    ('expense', 'Educação', 'violet'),
    ('expense', 'Lazer', 'pink'),
    ('expense', 'Assinaturas', 'teal'),
    ('expense', 'Compras', 'green'),
    ('expense', 'Impostos e taxas', 'slate'),
    ('expense', 'Outros', 'slate'),
    ('income', 'Salário', 'green'),
    ('income', 'Freelance', 'teal'),
    ('income', 'Rendimentos', 'blue'),
    ('income', 'Outros', 'slate');

-- Lançamentos. O valor é sempre positivo; o tipo define se entra, sai ou se
-- move entre contas. Transferência: sai de `account_id` e entra em
-- `transfer_account_id`, sem categoria e fora de receita/despesa.
-- Uma conta com lançamentos não pode ser excluída (RESTRICT); excluir a
-- categoria deixa o lançamento sem categoria.
CREATE TABLE finance_transactions (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id          INTEGER NOT NULL REFERENCES finance_accounts (id) ON DELETE RESTRICT,
    transfer_account_id INTEGER REFERENCES finance_accounts (id) ON DELETE RESTRICT,
    category_id         INTEGER REFERENCES finance_categories (id) ON DELETE SET NULL,
    kind                TEXT NOT NULL CHECK (kind IN ('income', 'expense', 'transfer')),
    description         TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 120),
    amount              INTEGER NOT NULL CHECK (amount > 0),
    -- Data local no formato aaaa-mm-dd (sem fuso). Na fatura do cartão, o vencimento.
    date                TEXT NOT NULL CHECK (length(date) = 10 AND date(date) = date),
    status              TEXT NOT NULL CHECK (status IN ('paid', 'pending')),
    notes               TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
    -- Importados: data da compra (fatura), parcela n/N e o identificador de
    -- origem (FITID do OFX ou a impressão digital da linha da fatura), que
    -- impede importar o mesmo lançamento duas vezes.
    purchase_date       TEXT CHECK (purchase_date IS NULL
                                    OR (length(purchase_date) = 10 AND date(purchase_date) = purchase_date)),
    installment_number  INTEGER,
    installment_count   INTEGER,
    external_id         TEXT UNIQUE CHECK (external_id IS NULL OR length(external_id) BETWEEN 1 AND 300),
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK ((kind = 'transfer') = (transfer_account_id IS NOT NULL)),
    CHECK (transfer_account_id IS NULL OR transfer_account_id != account_id),
    CHECK (kind != 'transfer' OR category_id IS NULL),
    CHECK ((installment_number IS NULL) = (installment_count IS NULL)),
    CHECK (installment_number IS NULL
           OR (installment_number BETWEEN 1 AND installment_count AND installment_count <= 420))
) STRICT;

CREATE INDEX idx_finance_transactions_date ON finance_transactions (date);
CREATE INDEX idx_finance_transactions_account ON finance_transactions (account_id, date);
CREATE INDEX idx_finance_transactions_category ON finance_transactions (category_id)
    WHERE category_id IS NOT NULL;
CREATE INDEX idx_finance_transactions_transfer ON finance_transactions (transfer_account_id)
    WHERE transfer_account_id IS NOT NULL;

-- Tags dos lançamentos, na tabela `tags` compartilhada com tarefas e notas.
CREATE TABLE finance_transaction_tags (
    transaction_id INTEGER NOT NULL REFERENCES finance_transactions (id) ON DELETE CASCADE,
    tag_id         INTEGER NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
    PRIMARY KEY (transaction_id, tag_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX idx_finance_transaction_tags_tag ON finance_transaction_tags (tag_id);

-- Regras aprendidas na importação: ao escolher a categoria (ou a conta de uma
-- transferência) de uma linha importada, a escolha vale como sugestão para as
-- próximas linhas com a mesma chave (descrição normalizada ou categoria do
-- banco). A última escolha vence.
CREATE TABLE finance_import_rules (
    pattern             TEXT PRIMARY KEY CHECK (length(pattern) BETWEEN 1 AND 200),
    category_id         INTEGER REFERENCES finance_categories (id) ON DELETE CASCADE,
    transfer_account_id INTEGER REFERENCES finance_accounts (id) ON DELETE CASCADE,
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK ((category_id IS NULL) != (transfer_account_id IS NULL))
) STRICT;
