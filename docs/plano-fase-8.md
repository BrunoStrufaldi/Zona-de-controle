# Plano — Fase 8 (Polish)

Plano aprovado pelo usuário em 17/10/2026, ainda **não iniciado**. Começa depois da 0.3.0 (Otimização 4.5–4.7)
publicada e testada. As regras do projeto estão no [`CLAUDE.md`](../CLAUDE.md).

Fora do plano por decisão do usuário: **assinatura Authenticode do executável** (o UAC do reparo continua mostrando
"Editor desconhecido").

## Problemas concretos encontrados no levantamento

- Erro na abertura fecha o app sem nenhuma mensagem (`lib.rs`: `.expect` no `run`; o app não tem console). Foi o que
  aconteceu em 17/10/2026 com o banco migrado por uma versão de desenvolvimento.
- Não há nenhum log: um erro no app instalado não deixa rastro.
- Duas instâncias podem rodar juntas: mesmo banco, leitores dos receptores em dobro e limpeza ou reparo em paralelo.
- `--zdc-text-subtle` (`#5c5c63`) tem contraste de ~2,8:1 sobre `--zdc-surface` (WCAG AA pede 4,5:1); usado 61 vezes.

## 8.1 Robustez e empacotamento (primeira)

- **Erro na abertura vira janela do Windows** (MessageBox nativo) com o motivo em pt-BR, em vez de fechar calado.
  Banco mais novo que o app: explicar que é preciso atualizar e mostrar a pasta dos backups. Nada é apagado nem
  desfeito automaticamente.
- **Log em arquivo local** em `%APPDATA%\com.brunostrufaldi.zonadecontrole\logs`, com tamanho limitado e rotação:
  abertura, versão, erros de commands e de migrations. **Nunca** conteúdo de notas, valores financeiros ou caminhos de
  arquivos do usuário. Botão "Abrir pasta de logs" em Configurações > Sobre.
- **Instância única** (`tauri-plugin-single-instance`, sem permissão na janela): abrir de novo traz a janela existente
  para a frente.
- **Lembrar tamanho e posição da janela** (em `settings`, sempre dentro da área visível de algum monitor).

## 8.2 Acessibilidade

- Ajustar `--zdc-text-subtle` para ≥ 4,5:1 e conferir os demais tokens de texto (a paleta dos gráficos e das
  categorias já foi validada; revalidar se algo mudar).
- Verificação automática com `axe-core` (só desenvolvimento) nas páginas já cobertas pelos testes, travando
  regressões.
- Revisão manual de teclado: diálogos, Kanban, árvore do Espaço em disco e formulários (ordem do foco, foco visível,
  Esc).
- `aria-live` no andamento da limpeza, do reparo e da importação.

## 8.3 Desempenho (medir antes de mexer)

- Medir o tempo até a janela abrir e a memória do app parado e com o Espaço em disco aberto.
- Medir os commands pesados (Analytics de 36 meses, Projeção, Investimentos) com um banco grande **gerado em
  memória** nos testes, nunca com os dados do usuário.
- Corrigir só o que a medição mostrar (índices, consultas repetidas). O pacote do frontend está razoável: rotas sob
  demanda e o maior arquivo com ~123 KB comprimido.

## 8.4 Testes

- Corrigir o teste instável de Notas ("cria uma nota e salva automaticamente ao digitar").
- Teste de fumaça do app real por CDP (`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` +
  `puppeteer-core`), somente leitura: abre cada página e confere que não há erro no console. Script manual, fora da CI
  (precisa do Windows com WebView2).

## 8.5 Refinamento visual

- Passada de consistência em todas as telas: estados vazios, carregamento, espaçamentos, títulos e larguras estreitas
  (janela mínima de 960 px), com capturas de antes e depois.

## Em aberto (perguntar ao começar)

1. Tema claro: incluir? Hoje só existe o escuro; exige revalidar a paleta dos gráficos.
2. Log em arquivo e instância única: confirmar como descrito acima.
3. Atalhos de teclado (ex.: Ctrl+K para buscar e navegar): entram na 8.5 ou ficam de fora?
4. Ordem sugerida: 8.1 → 8.2 → 8.3 → 8.4 → 8.5.
