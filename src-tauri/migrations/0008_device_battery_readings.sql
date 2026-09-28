-- 0008_device_battery_readings — Última leitura de bateria por modelo (Fase 3.3b).
--
-- Os leitores por modelo (headset MCHOSE, mouse Rapoo…) só recebem a bateria
-- quando o receptor avisa. Guardar a última leitura permite mostrar, ao abrir
-- o app, o "último registro" (com data e hora) até chegar um aviso novo —
-- sempre como registro antigo, nunca como nível atual.
-- `device_key` é `vid:pid` em hexadecimal minúsculo (ex.: `24ae:1416`).
CREATE TABLE device_battery_readings (
    device_key   TEXT PRIMARY KEY
                 CHECK (device_key GLOB '[0-9a-f][0-9a-f][0-9a-f][0-9a-f]:[0-9a-f][0-9a-f][0-9a-f][0-9a-f]'),
    -- Estado informado na leitura.
    power        TEXT NOT NULL CHECK (power IN ('onBattery', 'charging', 'off')),
    -- Nível informado na leitura (0 quando desligado).
    percent      INTEGER NOT NULL CHECK (percent BETWEEN 0 AND 100),
    -- Último nível informado com o dispositivo ligado (NULL se nunca houve).
    last_percent INTEGER CHECK (last_percent IS NULL OR last_percent BETWEEN 0 AND 100),
    -- Instante da leitura em segundos desde a época Unix.
    read_at_unix INTEGER NOT NULL
) STRICT;
