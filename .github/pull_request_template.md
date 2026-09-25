## O que muda

<!-- Resumo da mudança e motivação. Relacione a fase do roadmap, se aplicável. -->

## Como validar

<!-- Passos para conferir no app (npm run dev). -->

## Checklist

- [ ] `npm run check`, `npm run check:rust`, `npm run test`, `npm run test:rust` e `npm run build` passam
- [ ] Nenhuma query SQL fora de `src-tauri/src/repositories`
- [ ] Commands novos registrados em `lib.rs`, `build.rs`, `capabilities/default.toml` (com comentário) e `CommandMap`
- [ ] Operações destrutivas (se houver) pedem confirmação, são auditadas e seguem o CLAUDE.md
- [ ] Dados fictícios apenas em `src/mocks` e com selo "Demo"
- [ ] Textos da UI em pt-BR; moeda/datas via `src/lib/format.ts`
