-- 0013_weekly_plan — Planejamento semanal fixo (aba da tela Rotinas).
--
-- Cada bloco vale para os mesmos dias toda semana. `weekdays` é a máscara das
-- rotinas (bit 0 = domingo … bit 6 = sábado). Bloco com horário: `start_time` <
-- `end_time` (`HH:MM`, no mesmo dia). Anotação do dia inteiro: os dois nulos.
-- Blocos com horário não se sobrepõem no mesmo dia (checado no Rust).
CREATE TABLE weekly_plan_blocks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 80),
    notes      TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 500),
    weekdays   INTEGER NOT NULL CHECK (weekdays BETWEEN 1 AND 127),
    start_time TEXT CHECK (start_time IS NULL
                           OR (length(start_time) = 5 AND start_time GLOB '[0-2][0-9]:[0-5][0-9]')),
    end_time   TEXT CHECK (end_time IS NULL
                           OR (length(end_time) = 5 AND end_time GLOB '[0-2][0-9]:[0-5][0-9]')),
    color      TEXT NOT NULL CHECK (color IN ('red', 'orange', 'amber', 'green', 'teal',
                                              'blue', 'violet', 'pink', 'slate')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK ((start_time IS NULL) = (end_time IS NULL)),
    CHECK (start_time IS NULL OR start_time < end_time)
) STRICT;
