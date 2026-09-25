-- 0003_tasks_extras — Tarefas (Fase 2.2): categorias, recorrência, checklists e arquivamento.

-- Categorias definidas pelo usuário. A cor é um nome da paleta de tokens do
-- frontend (nunca um hexadecimal). Nomes são únicos sem diferenciar caixa.
CREATE TABLE task_categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE COLLATE NOCASE
               CHECK (length(trim(name)) BETWEEN 1 AND 40),
    color      TEXT NOT NULL
               CHECK (color IN ('red', 'orange', 'amber', 'green', 'teal',
                                'blue', 'violet', 'pink', 'slate')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- No máximo uma categoria por tarefa; excluir a categoria deixa a tarefa sem categoria.
ALTER TABLE tasks ADD COLUMN category_id INTEGER
    REFERENCES task_categories (id) ON DELETE SET NULL;

-- Regra de recorrência em JSON ({ frequency, interval, weekdays }), validada no Rust.
-- Ao concluir, a próxima ocorrência é criada e a regra passa para ela.
ALTER TABLE tasks ADD COLUMN recurrence TEXT
    CHECK (recurrence IS NULL OR json_valid(recurrence));

-- Tarefas arquivadas saem da lista, do Kanban e do dashboard, mas podem ser restauradas.
ALTER TABLE tasks ADD COLUMN archived_at TEXT;

CREATE INDEX idx_tasks_category ON tasks (category_id) WHERE category_id IS NOT NULL;
CREATE INDEX idx_tasks_archived ON tasks (archived_at) WHERE archived_at IS NOT NULL;

-- Itens de checklist de uma tarefa, na ordem de `position`.
CREATE TABLE task_checklist_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id    INTEGER NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    text       TEXT NOT NULL CHECK (length(trim(text)) BETWEEN 1 AND 200),
    done       INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
    position   INTEGER NOT NULL
) STRICT;

CREATE INDEX idx_task_checklist_items_task ON task_checklist_items (task_id, position);
