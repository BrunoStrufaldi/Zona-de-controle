-- 0012_investments — Investimentos (Fase 6.1): ativos, movimentações e valores informados.
--
-- Valores em CENTAVOS. O valor atual de cada ativo é sempre INFORMADO pelo
-- usuário (copiado do app do banco/corretora): o app não baixa cotações nem
-- calcula rendimentos. Quantidades em 1e-8 unidade (cripto e Tesouro têm frações).

-- Ativo da carteira, guardado numa conta do tipo Investimentos (a instituição).
-- As aplicações e os resgates movem o dinheiro dessa conta; por isso a conta
-- não pode ser excluída enquanto tiver ativos.
CREATE TABLE investment_assets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id    INTEGER NOT NULL REFERENCES finance_accounts (id) ON DELETE RESTRICT,
    class         TEXT NOT NULL
                  CHECK (class IN ('fixed_income', 'stocks', 'reits', 'etfs', 'crypto', 'other')),
    name          TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
    ticker        TEXT CHECK (ticker IS NULL OR length(ticker) BETWEEN 1 AND 20),
    -- Renda fixa: vencimento do título (aaaa-mm-dd).
    maturity_date TEXT CHECK (maturity_date IS NULL
                              OR (length(maturity_date) = 10 AND date(maturity_date) = maturity_date)),
    notes         TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_investment_assets_account ON investment_assets (account_id);

-- Aplicação (compra), resgate (venda) ou provento (dividendos, juros, rendimentos).
-- Pode estar vinculada ao lançamento que moveu o dinheiro (a transferência para
-- ou da conta de investimentos, ou a entrada do provento); o valor e a data
-- seguem o lançamento. Excluir o lançamento só desfaz o vínculo: a aplicação
-- aconteceu e continua na carteira.
CREATE TABLE investment_movements (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id       INTEGER NOT NULL REFERENCES investment_assets (id) ON DELETE CASCADE,
    kind           TEXT NOT NULL CHECK (kind IN ('contribution', 'withdrawal', 'income')),
    date           TEXT NOT NULL CHECK (length(date) = 10 AND date(date) = date),
    amount         INTEGER NOT NULL CHECK (amount > 0),
    -- Cotas/ações/unidades em 1e-8 (opcional; proventos não têm).
    quantity       INTEGER CHECK (quantity IS NULL OR quantity > 0),
    transaction_id INTEGER UNIQUE REFERENCES finance_transactions (id) ON DELETE SET NULL,
    notes          TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 500),
    created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK (kind != 'income' OR quantity IS NULL)
) STRICT;

CREATE INDEX idx_investment_movements_asset ON investment_movements (asset_id, date);

-- Valor total do ativo informado pelo usuário numa data (inclui as
-- movimentações até esse dia). Um por dia; informar de novo substitui.
CREATE TABLE investment_valuations (
    asset_id   INTEGER NOT NULL REFERENCES investment_assets (id) ON DELETE CASCADE,
    date       TEXT NOT NULL CHECK (length(date) = 10 AND date(date) = date),
    value      INTEGER NOT NULL CHECK (value >= 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (asset_id, date)
) STRICT, WITHOUT ROWID;
