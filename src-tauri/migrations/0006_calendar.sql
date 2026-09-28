-- 0006_calendar — Calendário: eventos, recorrência com exceções e lembretes (Fase 2.5).

-- Datas e horários são locais (sem fuso): `aaaa-mm-dd` e `HH:MM`. Evento de
-- dia inteiro não tem horário. `recurrence` é JSON (frequência, intervalo,
-- dias da semana e fim opcional por data ou número de ocorrências).
-- `reminder_minutes`: minutos antes do início (no dia inteiro, antes das 09:00).
CREATE TABLE calendar_events (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    title            TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
    description      TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 4000),
    location         TEXT NOT NULL DEFAULT '' CHECK (length(location) <= 200),
    color            TEXT NOT NULL CHECK (color IN ('red', 'orange', 'amber', 'green', 'teal',
                                                    'blue', 'violet', 'pink', 'slate')),
    all_day          INTEGER NOT NULL CHECK (all_day IN (0, 1)),
    start_date       TEXT NOT NULL CHECK (length(start_date) = 10 AND date(start_date) IS start_date),
    start_time       TEXT CHECK (start_time IS NULL OR (length(start_time) = 5
                                 AND time(start_time) IS (start_time || ':00'))),
    end_date         TEXT NOT NULL CHECK (length(end_date) = 10 AND date(end_date) IS end_date),
    end_time         TEXT CHECK (end_time IS NULL OR (length(end_time) = 5
                               AND time(end_time) IS (end_time || ':00'))),
    reminder_minutes INTEGER CHECK (reminder_minutes IS NULL
                                    OR reminder_minutes BETWEEN 0 AND 40320),
    recurrence       TEXT CHECK (recurrence IS NULL OR json_valid(recurrence)),
    created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK (end_date >= start_date),
    CHECK ((all_day = 1 AND start_time IS NULL AND end_time IS NULL)
           OR (all_day = 0 AND start_time IS NOT NULL AND end_time IS NOT NULL))
) STRICT;

CREATE INDEX idx_calendar_events_start ON calendar_events (start_date);

-- Exceção de uma ocorrência de evento recorrente, identificada pela data
-- original (`occurrence_date`). `cancelled = 1`: a ocorrência foi excluída.
-- Senão, os campos substituem os da série só nessa ocorrência (pode mudar de dia).
CREATE TABLE calendar_event_exceptions (
    event_id         INTEGER NOT NULL REFERENCES calendar_events (id) ON DELETE CASCADE,
    occurrence_date  TEXT NOT NULL
                     CHECK (length(occurrence_date) = 10 AND date(occurrence_date) IS occurrence_date),
    cancelled        INTEGER NOT NULL CHECK (cancelled IN (0, 1)),
    title            TEXT CHECK (title IS NULL OR length(trim(title)) BETWEEN 1 AND 120),
    description      TEXT CHECK (description IS NULL OR length(description) <= 4000),
    location         TEXT CHECK (location IS NULL OR length(location) <= 200),
    all_day          INTEGER CHECK (all_day IS NULL OR all_day IN (0, 1)),
    start_date       TEXT CHECK (start_date IS NULL
                                 OR (length(start_date) = 10 AND date(start_date) IS start_date)),
    start_time       TEXT CHECK (start_time IS NULL OR (length(start_time) = 5
                                 AND time(start_time) IS (start_time || ':00'))),
    end_date         TEXT CHECK (end_date IS NULL
                                 OR (length(end_date) = 10 AND date(end_date) IS end_date)),
    end_time         TEXT CHECK (end_time IS NULL OR (length(end_time) = 5
                               AND time(end_time) IS (end_time || ':00'))),
    reminder_minutes INTEGER CHECK (reminder_minutes IS NULL
                                    OR reminder_minutes BETWEEN 0 AND 40320),
    PRIMARY KEY (event_id, occurrence_date),
    -- Ocorrência alterada precisa de todos os campos obrigatórios.
    CHECK (cancelled = 1 OR (title IS NOT NULL AND description IS NOT NULL
                             AND location IS NOT NULL AND all_day IS NOT NULL
                             AND start_date IS NOT NULL AND end_date IS NOT NULL
                             AND end_date >= start_date))
) STRICT, WITHOUT ROWID;

-- Lembretes já disparados (evita repetir a notificação). A chave inclui o
-- instante do lembrete: se o evento mudar de horário, o novo lembrete dispara.
CREATE TABLE calendar_reminders_sent (
    event_id        INTEGER NOT NULL REFERENCES calendar_events (id) ON DELETE CASCADE,
    occurrence_date TEXT NOT NULL,
    remind_at       TEXT NOT NULL,
    sent_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (event_id, occurrence_date, remind_at)
) STRICT, WITHOUT ROWID;
