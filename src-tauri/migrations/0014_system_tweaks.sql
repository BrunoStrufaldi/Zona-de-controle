-- 0014_system_tweaks — Ajustes reversíveis do Windows feitos pelo app (Fase 4.6).
--
-- Cada linha é um ajuste aplicado: o valor que estava antes (para o Desfazer) e
-- o gravado, em JSON (`TweakValue` em `domain/system_tweaks.rs`). `target`
-- identifica onde o ajuste mexe (ex.: `power.active`, `gameMode`,
-- `startup:userRun:Nome`). Só o ajuste mais recente de cada `target` pode ser
-- desfeito; desfazer só marca `undone_at` (o histórico é mantido). O registro
-- completo, com sucesso e falha, fica no `audit_log`.
CREATE TABLE system_tweaks (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    kind           TEXT NOT NULL CHECK (kind IN ('power_plan', 'game_mode', 'startup_item')),
    target         TEXT NOT NULL CHECK (length(target) BETWEEN 1 AND 600),
    label          TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 300),
    previous_value TEXT NOT NULL CHECK (json_valid(previous_value)),
    applied_value  TEXT NOT NULL CHECK (json_valid(applied_value)),
    applied_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    undone_at      TEXT
) STRICT;

CREATE INDEX system_tweaks_by_target ON system_tweaks (target, id);
