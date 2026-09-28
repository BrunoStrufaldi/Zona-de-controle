-- 0007_device_markings — Marcações de dispositivos USB (Fase 3.3).
--
-- Pela USB não dá para saber se um mouse/teclado/headset é sem fio (receptor
-- 2.4 GHz) ou com fio. O usuário marca uma vez; modelos conhecidos já vêm
-- reconhecidos no código e só aparecem aqui se o usuário mudar o padrão.
-- `device_key` é `vid:pid` em hexadecimal minúsculo (ex.: `24ae:1416`).
CREATE TABLE device_markings (
    device_key TEXT PRIMARY KEY
               CHECK (device_key GLOB '[0-9a-f][0-9a-f][0-9a-f][0-9a-f]:[0-9a-f][0-9a-f][0-9a-f][0-9a-f]'),
    wireless   INTEGER NOT NULL CHECK (wireless IN (0, 1)),
    kind       TEXT NOT NULL CHECK (kind IN ('mouse', 'keyboard', 'headset', 'controller', 'other')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
