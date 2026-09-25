-- 0002_tasks — módulo de Tarefas (Fase 2.1).

CREATE TABLE tasks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
    description  TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 10000),
    status       TEXT NOT NULL DEFAULT 'todo'
                 CHECK (status IN ('todo', 'in_progress', 'done')),
    priority     TEXT NOT NULL DEFAULT 'medium'
                 CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    -- Data local no formato aaaa-mm-dd (sem fuso).
    due_date     TEXT CHECK (due_date IS NULL OR (length(due_date) = 10 AND date(due_date) = due_date)),
    -- Ordem dentro da coluna do Kanban (fracionária para inserir entre dois itens).
    position     REAL NOT NULL DEFAULT 0,
    completed_at TEXT,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    -- Uma tarefa tem data de conclusão se, e somente se, estiver concluída.
    CHECK ((status = 'done') = (completed_at IS NOT NULL))
) STRICT;

CREATE INDEX idx_tasks_status_position ON tasks (status, position);
CREATE INDEX idx_tasks_due_date ON tasks (due_date) WHERE due_date IS NOT NULL;

-- Tags compartilhadas entre módulos (tarefas agora; notas no futuro).
-- Nomes são armazenados normalizados em minúsculas.
CREATE TABLE tags (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 32),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE task_tags (
    task_id INTEGER NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, tag_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX idx_task_tags_tag ON task_tags (tag_id);
