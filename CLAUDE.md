# CLAUDE.md — Zona de Controle

Regras do projeto para sessões futuras. Leia antes de alterar qualquer coisa.

## Visão geral

App desktop **local-first** (Tauri 2 + React/TypeScript + Rust + SQLite) que reúne
**Produtividade**, **Central do Sistema** e **Finanças**. A Fase 1 (fundação) está
pronta; os módulos são implementados um por vez, seguindo o roadmap do README.

## Antes de finalizar QUALQUER tarefa

Rode e garanta que tudo passa:

```bash
npm run check          # tsc + eslint + cargo check
npm run check:rust     # cargo fmt --check + cargo clippy -D warnings
npm run test           # Vitest (frontend)
npm run test:rust      # cargo test (migrations, repositórios, serviços)
npm run build          # typecheck + build do Vite
npm run format:check   # Prettier
```

Se mexeu em algo visível, abra o app (`npm run dev`) e confira a tela de verdade.

A CI (`.github/workflows/ci.yml`) roda essas mesmas etapas a cada push: frontend no
Ubuntu, Rust no Windows. Se adicionar um passo de validação, inclua-o nos dois lugares.
Ao alterar `package.json` à mão, rode `npm install` para manter o `package-lock.json`
em sincronia — senão o `npm ci` da CI falha.
Em terminais novos no Windows, o `cargo` pode não estar no PATH até reabrir o VS Code.

## Idioma e localização

- **UI em pt-BR**. Código (variáveis, funções, arquivos, pastas, commits de código) em **inglês**.
  Comentários e documentação em pt-BR.
- Moeda BRL (`R$ 1.234,56`), datas `dd/mm/aaaa`. **Sempre** use `src/lib/format.ts`
  (`formatCurrency`, `formatDate`, `formatDateTime`, `formatPercent`, `formatBytes`…).
  Nunca chame `toLocaleString`/`Intl` direto em componentes.
- Datas `aaaa-mm-dd` são interpretadas como data local por `toDate()` — não use `new Date("2026-09-25")`.
- Valores financeiros persistidos em **centavos** (inteiros); converta só na exibição.

## Arquitetura

Fluxo de dados (nunca pule camadas):

```
page → hook (useAsyncResource) → src/services/*-service.ts → invokeCommand
     → [IPC] → commands/*.rs → services/*.rs → repositories/*.rs (SQL) / domain/*.rs
```

### Frontend (`src/`)

| Pasta                | Responsabilidade                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `app/`               | Composição da aplicação: `router/` (paths, rotas, router), `layouts/`, `providers/`                               |
| `config/`            | Configuração declarativa (ex.: `navigation.ts` — fonte única da sidebar/breadcrumb)                               |
| `components/ui/`     | Primitivos visuais no padrão shadcn (Radix + CVA). Sem lógica de negócio                                          |
| `components/layout/` | Sidebar, header, breadcrumb, logo                                                                                 |
| `components/shared/` | Componentes compostos reutilizáveis (PageHeader, estados, WidgetCard, DemoBadge, ModulePlaceholder, ResourceView) |
| `features/<módulo>/` | Tudo de um módulo: `types.ts` (contratos), `domain/` (regras puras), `components/`, `module-info.ts`              |
| `pages/`             | Páginas das rotas. Compõem features; não contêm regra de negócio                                                  |
| `hooks/`             | Hooks genéricos (`use-async-resource`, `use-media-query`…)                                                        |
| `stores/`            | Zustand — **apenas** estado global de UI (ex.: sidebar). Dados de negócio não vão aqui                            |
| `services/`          | **Único** ponto que fala com o Rust. `tauri/commands.ts` tem o `CommandMap` tipado                                |
| `lib/`               | Utilitários puros (format, math, navigation, cn, chart-theme)                                                     |
| `mocks/`             | Dados fictícios de demonstração (ver "Regra de mocks")                                                            |
| `types/`             | Tipos compartilhados entre módulos (espelham structs Rust quando aplicável)                                       |
| `styles/`            | `tokens.css` (tema) e `globals.css` (ponte Tailwind, keyframes, base)                                             |
| `test/`              | Setup do Vitest e helpers (`renderRoute`, `mockDesktopRuntime`)                                                   |

Regras:

- **Sem lógica de negócio em componentes.** Cálculos vão para `features/*/domain` ou `lib/` (funções puras, testáveis).
- Importar `@tauri-apps/api` fora de `src/services` é bloqueado pelo ESLint.
- Um módulo de `features/` não importa de outro módulo; o que for comum vai para `lib/` ou `types/`.
- Arquivos de componente exportam só componentes (fast refresh). Variantes CVA ficam em `*-variants.ts`.

### Backend (`src-tauri/`)

| Caminho                     | Responsabilidade                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `src/lib.rs`                | Builder do Tauri, `setup` (estado + migrations), registro de commands                                                       |
| `src/commands/`             | Camada IPC fina: recebe args, delega para `services`. Leitura e escrita em commands separados                               |
| `src/services/`             | Casos de uso: validação, transações, auditoria                                                                              |
| `src/repositories/`         | **Único lugar com SQL**                                                                                                     |
| `src/domain/`               | Regras e contratos puros (auditoria, settings, devices, optimization)                                                       |
| `src/platform/`             | **Único lugar que lê o SO** (`sysinfo`, `hidapi`, XInput, CfgMgr32), somente leitura. Commands chamam direto via `AppState` |
| `src/db/`                   | Conexão SQLite (WAL, foreign keys) e runner de migrations                                                                   |
| `src/error.rs`              | `AppError` → serializado como `{ kind, message }` para o frontend                                                           |
| `migrations/`               | SQL versionado `NNNN_descricao.sql`, embutido via `include_str!`                                                            |
| `capabilities/default.toml` | Permissões da janela — mínimo necessário, cada uma comentada                                                                |
| `build.rs`                  | `APP_COMMANDS`: lista explícita de commands permitidos                                                                      |

## Convenções de nomes

- Arquivos TS/TSX: `kebab-case` (`tasks-page.tsx`, `use-media-query.ts`, `settings-service.ts`).
- Componentes e tipos: `PascalCase`. Funções/variáveis: `camelCase`. Constantes de módulo: `UPPER_SNAKE_CASE`.
- Páginas: `<nome>-page.tsx` exportando `<Nome>Page`. Hooks: `use-*.ts` exportando `use*`.
- Rust: `snake_case`; structs expostas ao frontend usam `#[serde(rename_all = "camelCase")]`.
- Commands Rust: `verbo_substantivo` (`list_settings`, `set_setting`).
- Chaves de configuração: `[a-z][a-z0-9._-]*` (ex.: `profile.display_name`).

## Como criar uma nova página

1. Crie `src/pages/<area>/<nome>-page.tsx`.
2. Adicione o caminho em `src/app/router/paths.ts`.
3. Registre a rota (com `lazyPage`) em `src/app/router/routes.tsx`.
4. Adicione o item em `src/config/navigation.ts` (título/ícone da página vêm daqui).
5. O teste de roteamento cobre automaticamente todo item da navegação.

## Como implementar um módulo

**Referência completa: Tarefas.** Use como modelo:

- **Rust:** `src-tauri/src/{domain,repositories,services,commands}/tasks.rs` + `migrations/0002_tasks.sql`
  (e, na 2.2, `task_categories.rs`, `task_recurrence.rs` e `migrations/0003_tasks_extras.sql`).
- **Frontend:** `src/features/productivity/tasks/` (types, domain, hooks, components), a página `pages/productivity/tasks-page.tsx` e o serviço `services/tasks-service.ts`.

1. Contratos em `features/<módulo>/types.ts` (espelhando o Rust); regras puras em `features/<módulo>/domain/` + testes.
2. Migration nova em `src-tauri/migrations/` (+ registro em `db/migrations.rs`). Teste também a atualização a partir da versão anterior.
3. Rust: `domain/` (validação) → `repositories/` (SQL + testes com `Database::open_in_memory`) → `services/` (transações/auditoria) → `commands/`.
4. Exponha o command (checklist abaixo).
5. Frontend: função em `src/services/<módulo>-service.ts`, hook de estado em `features/<módulo>/hooks/`, componentes em `features/<módulo>/components`, página em `pages/`.
6. Testes de página com backend em memória (ver `src/test/fake-tasks-backend.ts`).
7. Troque os widgets do dashboard de `src/mocks` pela fonte real e **remova a flag `demo`**.
8. Valide no app real (`npm run dev`), não só nos testes.

## Como expor um novo command Rust

1. Função `#[tauri::command] async fn` em `src-tauri/src/commands/<área>.rs` (retorna `AppResult<T>`).
2. Registre em `generate_handler!` (`src/lib.rs`).
3. Adicione o nome em `APP_COMMANDS` (`build.rs`).
4. Conceda `allow-<nome-com-hifens>` em `capabilities/default.toml` **com comentário justificando**.
5. Declare args/retorno no `CommandMap` (`src/services/tauri/commands.ts`) e crie a função no service.

## Migrations

- Nunca edite uma migration já commitada — crie `NNNN+1_*.sql`.
- Versões consecutivas a partir de 1 (há teste garantindo). Cada migration roda em transação.
- Prefira tabelas `STRICT`, `CHECK` para enums e `json_valid()` para colunas JSON.

## Segurança (obrigatório)

- **Nenhuma operação destrutiva sem**: confirmação explícita mostrando exatamente o que será
  removido, allowlist de locais (nunca arquivos críticos), registro no `audit_log`,
  cancelamento quando possível e execução sem privilégios de administrador.
- Análise (somente leitura) e execução (destrutiva) são **traits/commands separados**.
- **Nunca** executar comandos shell arbitrários; não adicionar `tauri-plugin-shell`.
- Não adicionar plugins/permissões (`fs`, `shell`, `sql`, `http`, `core:*`) sem necessidade real
  e comentário na capability. O plugin SQL do Tauri **não** deve ser usado: SQL só no Rust.
  Único plugin em uso: `tauri-plugin-notification` (lembretes), com só `is-permission-granted`,
  `request-permission` e `notify`. Plugins só são importados em `src/services` (ESLint bloqueia
  `@tauri-apps/plugin-*` fora dali).
- Nunca armazenar senhas/segredos em texto puro.
- `audit_log` é somente inserção (triggers bloqueiam UPDATE/DELETE). Operações sensíveis devem auditar sucesso **e** falha.
- Padrão de exclusão: `AlertDialog` que nomeia o item e avisa que é permanente e auditado
  (ver `DeleteTaskDialog`) → service Rust que exclui + audita na mesma transação
  (ver `services/tasks.rs::delete_task`). Guarde nos `details` do log algo legível (ex.: título).
- Não reative `app.security.freezePrototype` no `tauri.conf.json`: quebra o `decimal.js-light` usado pelo Recharts.

## Regra de mocks

- Dados fictícios existem **somente** em `src/mocks/`.
- Todo componente que exibe dado de mock mostra o selo **Demo** (`WidgetCard demo` ou `<DemoBadge />`).
- Nunca apresente métricas do sistema, bateria ou valores financeiros fictícios como reais.
  Sem leitura real → "Não disponível" / estado vazio, nunca um valor estimado.

## Design system

- Cores **apenas** via tokens (`src/styles/tokens.css`) e classes Tailwind geradas
  (`bg-card`, `text-primary`, `border-border`…). Nada de hexadecimal em componentes.
- Gráficos usam `src/lib/chart-theme.ts`. A paleta categórica (`--zdc-chart-1/2`) foi
  validada para contraste e daltonismo; valide de novo antes de adicionar séries.
- Animações sutis (`animate-fade-in`, `animate-slide-up`, `shadow-glow`); `prefers-reduced-motion` já é respeitado globalmente.
- Layout do conteúdo responde à largura do container (`@container`), não só da janela.

## Decisões técnicas a preservar

- **TypeScript fixado em `~6.0`**: o `typescript-eslint` ainda não suporta TS ≥ 6.1/7.
- **Tauri fixado em `2`** (a v3 está em alpha).
- Testes do frontend simulam o Tauri com `mockDesktopRuntime` (`src/test/tauri.ts`); fora dele,
  os services lançam `ServiceError` com `kind: "desktop-only"` (útil para `npm run dev:web`).
- Commands Rust recebem argumentos em camelCase do JS (`beforeId` → `before_id`), padrão do Tauri.
- Testes que renderizam o dashboard chamam `preloadDashboard` em `beforeAll` (a importação a frio
  do Recharts passa do timeout na CI); os da tela Monitoramento, `preloadMonitor`.
- **Kanban (@dnd-kit):** o teclado usa `kanbanKeyboardCoordinates` (←/→ trocam de coluna). Não
  aplique `rotate`/`scale` no `DragOverlay`: distorce o retângulo de colisão. Arrastar não roda no
  jsdom — teste `resolveDrop`/`applyMove` (domínio) e valide o arraste num Chromium real.
- **Datas no Rust:** sem `chrono`. Use `domain/calendar.rs` (`CalendarDate`) e, para "hoje" no fuso
  local, `repositories::clock::local_today` (`date('now', 'localtime')` do SQLite).
- **Recorrência de tarefas:** modelo "gera ao concluir". A regra passa para a nova ocorrência (a
  concluída fica sem regra), então reabrir e concluir de novo não duplica. O cálculo existe no Rust
  (`task_recurrence.rs`, fonte da verdade) e no TS (`domain/recurrence.ts`, só para a prévia). Os dois
  têm os mesmos casos de teste: altere os dois juntos.
- **Tarefas arquivadas** não aparecem em `list_tasks` (nem no dashboard); use `list_archived_tasks`.
  Arquivadas não podem ser editadas ou movidas: restaure antes.
- **Cores nomeadas** (categorias de tarefas e eventos) são nomes (`red`, `teal`…) de
  `src/types/palette.ts`, mapeados para `--zdc-category-*` em `src/lib/palette.ts`
  (`ColorPicker` em `components/shared`). Nunca grave hexadecimal no banco. Frequências e rótulos
  de repetição comuns: `src/types/recurrence.ts` e `src/lib/recurrence.ts`.
- **Rotinas:** sequência, recorde e consistência são calculados só no Rust
  (`domain/routines.rs::Schedule::stats`, com testes); o frontend exibe o que vem de `list_routines`.
  Hábitos têm validade (`created_on` inclusive, `removed_on` exclusive): editar a rotina nunca apaga
  hábitos, só encerra a validade, para não reescrever o passado. Marcação: de hoje até
  `BACKFILL_DAYS` (7) dias atrás, só em dias da agenda. Nomes dos dias da semana: `src/lib/weekdays.ts`.
- **Calendário:** datas/horários locais sem fuso (`aaaa-mm-dd` + `HH:MM`; `TimeOfDay` e
  `LocalDateTime` em `domain/calendar.rs`, "agora" via `repositories::clock::local_now`). A série guarda
  só a regra; as ocorrências são calculadas no Rust (`domain/calendar_events.rs`, fonte da verdade)
  para o intervalo pedido (`list_calendar`, até 100 dias). Uma ocorrência é identificada pela **data
  original** (`occurrence_date`); exceções (`calendar_event_exceptions`) cancelam ou substituem uma
  ocorrência (pode mudar de dia). Mudar `start_date` ou a regra da série apaga as exceções (auditado).
  Semanal com dias escolhidos: ocorrências são os dias marcados a partir do início (o próprio início
  só conta se for um deles). Mensal no dia 31 usa o último dia do mês, como nas tarefas.
- **Lembretes:** `useReminderNotifications` (montado no `AppLayout`) chama `claim_due_reminders` a
  cada 30 s; o Rust devolve lembretes vencidos há até 15 min e grava em `calendar_reminders_sent`
  (chave inclui o instante, então mudar o horário rearma). Cada lembrete vira notificação do Windows
  **e** toast no app: o plugin não detecta notificações desativadas no Windows. Só funciona com o
  app aberto (sem bandeja/segundo plano, por decisão). Dia inteiro: lembrete relativo às 09:00.
- **Links entre módulos por URL:** `?new=1` abre o formulário de criação (Tarefas e Calendário) e
  `?task=<id>` abre a edição de uma tarefa (`taskHref`, usado pelo calendário).
- **Tags compartilhadas:** normalização em `domain/tags.rs` (Rust) e `src/lib/tags.ts` (TS); tarefas e
  notas usam a mesma tabela `tags`. Busca sem acentos: `src/lib/text.ts`.
- **Notas:** o editor salva sozinho (`use-autosave.ts`: debounce, fila sem saves paralelos e salvamento
  ao desmontar). Salvar atualiza só a nota na lista; não recarregue tudo durante a edição. O histórico
  é decidido no Rust (`services/notes.rs::update_note`: intervalo mínimo de 5 min e as 20 mais recentes).
  Na prévia Markdown (`markdown-preview.tsx`), links e imagens não podem navegar nem carregar nada:
  um link abriria a URL dentro da janela do app.
- **Monitoramento (3.1):** `platform/system_monitor.rs` lê CPU, memória, discos e processos com o
  `sysinfo` **0.36** (a 0.37+ exige Rust ≥ 1.95; o `rust-version` é 1.80), sem as features `component`
  (temperatura via WMI exige administrador e chama `CoInitializeSecurity` no processo todo), `network`
  e `user`. Nada é persistido: a tela relê com `usePollingResource` (`src/hooks`: sem leituras
  simultâneas, pausa com a janela oculta, para em erro) e o histórico dos gráficos (2 min) vive só no
  componente. CPU é medida por diferença entre leituras (≥ 200 ms): antes da segunda leitura o Rust
  devolve `null` e a tela mostra "Medindo…", nunca 0%. Processos são agrupados por nome
  (`domain/system_monitor.rs::group_processes`, ignora o PID 0 ocioso) e **não há** command para
  encerrá-los.
- **Diagnóstico (3.2):** as regras ficam no Rust (`domain/diagnostics.rs::diagnose`, fonte da verdade),
  sobre a leitura atual do monitor; `run_diagnostics` é somente leitura. O Rust devolve achados
  estruturados (`kind` + números) e os textos/recomendações ficam em
  `features/system/diagnostics/domain/findings.ts` (percentuais com 1 casa: 89,6% não pode aparecer
  como "90%" ao lado de "crítico a partir de 90%"). Unidades removíveis e processos internos do Windows
  (`System`, `Memory Compression`…) não geram alerta. Os limites ficam na chave reservada
  `diagnostics.thresholds`: só `set_diagnostic_thresholds` grava (valida e audita via
  `services::settings::save_setting`); o `set_setting` genérico recusa a chave. Campos `u32` para valor
  fora da faixa virar mensagem em pt-BR, não erro de desserialização. Valor salvo inválido volta ao
  padrão. A análise espera 200 ms na primeira vez para medir a CPU por programa
  (`SystemMonitor::measured_processes`). As cores do Monitoramento continuam com os limites fixos.
  Configurações abre a aba pela URL (`?tab=diagnostics`, `diagnosticThresholdsHref`).
- **Dispositivos (3.3):** `platform/devices.rs` (só Windows; fora dele volta vazio) lê as interfaces
  HID USB (`hidapi` com backend `windows-native`, Rust puro), os controles Xbox (XInput, `windows-sys`)
  e a bateria Bluetooth que o Windows grava no nó do dispositivo (propriedade
  `{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2`, a mesma de Configurações; não documentada). As regras
  ficam em `domain/devices` (testes com o PC real do usuário). Pela USB um receptor 2.4 GHz e um
  aparelho com fio parecem iguais: `KNOWN_WIRELESS_MODELS` reconhece os receptores conhecidos
  (`24ae:1416` Rapoo VT7 Max, `291d:385d` MCHOSE V9 PRO) e o usuário marca os outros
  (`device_markings`, chave `vid:pid` minúsculo; igual ao padrão, a marcação é apagada; auditado como
  `device.marked`). Só entram mouses, teclados e headsets (páginas HID Generic Desktop 0x02/0x06 e
  Telephony). Receptor sem leitor do modelo: presente, bateria "Não disponível". **Leitores por modelo
  (3.3b)** ficam em `domain/devices/readers.rs` (parser puro, testado com relatórios capturados do
  receptor real) e se ligam pelo campo `reader` de `KNOWN_WIRELESS_MODELS`. O app só **escuta**: uma
  thread por modelo (`platform/devices.rs::start_listeners`, iniciada no `AppState`) abre a coleção
  do fabricante e guarda a última leitura em memória e em `device_battery_readings` (migration 0008).
  A gravação vem por callback (`SaveReading`, montado no `AppState`, que tem `db: Arc<Database>`),
  então `platform/` continua sem SQL; `ModelReading::should_persist` grava na hora mudanças de nível
  ou estado e regrava o mesmo status no máximo a cada 5 min (o mouse repete a cada 3 s). Ao abrir o
  app, as leituras salvas entram como `from_saved` e aparecem como `LastKnown` ("Último registro:
  80%", com data, sem barra) até o primeiro aviso novo — nunca como nível atual. Receptor removido:
  a leitura vira registro antigo e a thread volta a procurá-lo a cada 5 s; sem o receptor, o
  aparelho não aparece na lista. Nunca envie relatórios ao receptor (mudariam DPI, iluminação…); se
  um modelo exigir consulta, só a mesma leitura que o software oficial faz. Estado não mapeado vira
  `None` (nada exibido), nunca um palpite. Com leitor e sem aviso ainda: `Waiting` ("Aguardando
  leitura"); aviso de desligado: `Off { last_percent }` (o aviso vem com nível 0, então o Rust guarda
  o último nível informado com ele ligado — `ModelReading::next` — e a tela mostra "Desligado · 100%",
  sem barra). `ReportReader` escolhe a coleção (`usage_page` + `usage` opcional) e, para modelos que
  repetem o status, `off_after_silence_secs` transforma silêncio em "desligado". Mapeados:
  MCHOSE V9 PRO (coleção `0xFF90`, relatório `55 65 NÍVEL ESTADO`, avisa só em eventos) e Rapoo VT7
  Max (coleção `0xFF00`/`0x02`, relatório `0x07` a cada ~3 s: byte 7 = estado, byte 8 = nível;
  desligado = silêncio > 10 s). O nível do Rapoo só foi visto em 100%: confira quando baixar.
  `usePollingResource().refresh()` relê sem voltar a "carregando".
- **Backup:** `services/backup.rs` grava em `AppState::backup_dir` (Documentos/Zona de Controle/Backups,
  que no Windows pode estar sincronizado pelo OneDrive). Só lista arquivos com o nome gerado pelo
  app; não adicione exclusão ou restauração sem seguir as regras de operação destrutiva.
- **Validação no app real:** `npm run dev` usa o banco de verdade (`%APPDATA%\com.brunostrufaldi.zonadecontrole`).
  Faça backup dos arquivos `zona-de-controle.db*` antes de criar dados de teste e restaure depois:
  o `audit_log` não permite apagar registros. Com `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`
  dá para dirigir o WebView2 via CDP (puppeteer-core).
