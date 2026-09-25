-- 0001_initial — estrutura mínima do Zona de Controle.
--
-- As tabelas dos módulos (tarefas, finanças etc.) serão criadas em migrations
-- próprias, quando cada módulo for implementado.

-- Preferências do aplicativo em formato chave/valor (valor sempre JSON válido).
CREATE TABLE app_settings (
    key        TEXT PRIMARY KEY NOT NULL CHECK (length(key) BETWEEN 1 AND 64),
    value      TEXT NOT NULL CHECK (json_valid(value)),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- Log de auditoria de operações sensíveis. Somente inserção: registros não
-- podem ser alterados nem apagados pela aplicação (ver triggers abaixo).
CREATE TABLE audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    category    TEXT NOT NULL,
    action      TEXT NOT NULL,
    target      TEXT,
    outcome     TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'cancelled')),
    details     TEXT CHECK (details IS NULL OR json_valid(details))
) STRICT;

CREATE INDEX idx_audit_log_occurred_at ON audit_log (occurred_at DESC);

CREATE TRIGGER audit_log_prevent_update
BEFORE UPDATE ON audit_log
BEGIN
    SELECT RAISE(ABORT, 'audit_log é somente inserção');
END;

CREATE TRIGGER audit_log_prevent_delete
BEFORE DELETE ON audit_log
BEGIN
    SELECT RAISE(ABORT, 'audit_log é somente inserção');
END;
