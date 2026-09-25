-- 0004_notes — Notas e diário (Fase 2.3): pastas, notas em Markdown, tags e histórico.

-- Pastas de um nível. Nomes únicos sem diferenciar caixa.
CREATE TABLE note_folders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE COLLATE NOCASE
               CHECK (length(trim(name)) BETWEEN 1 AND 60),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- Título pode ficar vazio (exibido como "Sem título" ou pela data do diário).
-- Entradas de diário têm `journal_date` (uma por dia).
CREATE TABLE notes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT NOT NULL DEFAULT '' CHECK (length(title) <= 200),
    content      TEXT NOT NULL DEFAULT '' CHECK (length(content) <= 200000),
    folder_id    INTEGER REFERENCES note_folders (id) ON DELETE SET NULL,
    favorite     INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
    journal_date TEXT UNIQUE
                 CHECK (journal_date IS NULL
                        OR (length(journal_date) = 10 AND date(journal_date) = journal_date)),
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_notes_folder ON notes (folder_id) WHERE folder_id IS NOT NULL;
CREATE INDEX idx_notes_updated ON notes (updated_at);

-- Mesmas tags das tarefas (tabela `tags`).
CREATE TABLE note_tags (
    note_id INTEGER NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX idx_note_tags_tag ON note_tags (tag_id);

-- Histórico: cópias anteriores de título e conteúdo, gravadas automaticamente
-- (no máximo uma a cada poucos minutos; o serviço mantém as mais recentes).
CREATE TABLE note_versions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id    INTEGER NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_note_versions_note ON note_versions (note_id, created_at);
