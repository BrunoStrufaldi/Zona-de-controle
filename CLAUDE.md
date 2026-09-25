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

| Caminho                     | Responsabilidade                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `src/lib.rs`                | Builder do Tauri, `setup` (estado + migrations), registro de commands                         |
| `src/commands/`             | Camada IPC fina: recebe args, delega para `services`. Leitura e escrita em commands separados |
| `src/services/`             | Casos de uso: validação, transações, auditoria                                                |
| `src/repositories/`         | **Único lugar com SQL**                                                                       |
| `src/domain/`               | Regras e contratos puros (auditoria, settings, devices, optimization)                         |
| `src/db/`                   | Conexão SQLite (WAL, foreign keys) e runner de migrations                                     |
| `src/error.rs`              | `AppError` → serializado como `{ kind, message }` para o frontend                             |
| `migrations/`               | SQL versionado `NNNN_descricao.sql`, embutido via `include_str!`                              |
| `capabilities/default.toml` | Permissões da janela — mínimo necessário, cada uma comentada                                  |
| `build.rs`                  | `APP_COMMANDS`: lista explícita de commands permitidos                                        |

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

## Como implementar um módulo (ex.: Tarefas)

1. Contratos em `features/<módulo>/types.ts`; regras puras em `features/<módulo>/domain/` + testes.
2. Migration nova em `src-tauri/migrations/` (+ registro em `db/migrations.rs`).
3. Rust: `domain/` → `repositories/` (SQL + testes com `Database::open_in_memory`) → `services/` → `commands/`.
4. Exponha o command (checklist abaixo).
5. Frontend: função em `src/services/<módulo>-service.ts`, componentes em `features/<módulo>/components`, página em `pages/`.
6. Troque os widgets do dashboard de `src/mocks` pela fonte real e **remova a flag `demo`**.

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
- Nunca armazenar senhas/segredos em texto puro.
- `audit_log` é somente inserção (triggers bloqueiam UPDATE/DELETE). Operações sensíveis devem auditar sucesso **e** falha.
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
