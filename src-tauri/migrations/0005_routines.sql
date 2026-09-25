-- 0005_routines — Rotinas e hábitos (Fase 2.4).

-- `weekdays` é uma máscara de bits (bit 0 = domingo … bit 6 = sábado);
-- 127 = todos os dias. A agenda vale a partir de `start_date` (data local).
CREATE TABLE routines (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE COLLATE NOCASE
               CHECK (length(trim(name)) BETWEEN 1 AND 80),
    weekdays   INTEGER NOT NULL CHECK (weekdays BETWEEN 1 AND 127),
    start_date TEXT NOT NULL CHECK (length(start_date) = 10 AND date(start_date) = start_date),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- Um hábito vale de `created_on` (inclusive) até `removed_on` (exclusive).
-- Remover um hábito só marca `removed_on`: o histórico dos dias passados não muda.
CREATE TABLE habits (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    routine_id INTEGER NOT NULL REFERENCES routines (id) ON DELETE CASCADE,
    name       TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
    position   INTEGER NOT NULL,
    created_on TEXT NOT NULL CHECK (length(created_on) = 10 AND date(created_on) = created_on),
    removed_on TEXT CHECK (removed_on IS NULL
                           OR (length(removed_on) = 10 AND date(removed_on) = removed_on)),
    CHECK (removed_on IS NULL OR removed_on >= created_on)
) STRICT;

CREATE INDEX idx_habits_routine ON habits (routine_id, position);

-- Um registro por hábito feito em um dia (data local).
CREATE TABLE habit_completions (
    habit_id     INTEGER NOT NULL REFERENCES habits (id) ON DELETE CASCADE,
    date         TEXT NOT NULL CHECK (length(date) = 10 AND date(date) = date),
    completed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (habit_id, date)
) STRICT, WITHOUT ROWID;

CREATE INDEX idx_habit_completions_date ON habit_completions (date);
