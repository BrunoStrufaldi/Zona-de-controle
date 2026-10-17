# Plano — Otimização, fase 2 (4.5 a 4.7)

Documento de passagem para continuar o trabalho em outra conversa. As regras do projeto e os detalhes técnicos do que
já existe estão no [`CLAUDE.md`](../CLAUDE.md) (seções "Segurança" e "Decisões técnicas": 4.5, 4.6, 4.7); aqui fica o
plano, as decisões do usuário e o que falta.

## Objetivo

A Otimização só limpava arquivos. Agora também:

1. lê as configurações do Windows e do hardware e diz o que dá para melhorar (4.5);
2. aplica ajustes seguros, com confirmação e Desfazer (4.6);
3. roda os reparos do Windows (DISM e SFC) quando o usuário pede (4.7).

Cada subfase é uma aba da tela **Otimização**: Limpeza (padrão), `?tab=settings` (Ajustes do Windows),
`?tab=hardware` (Hardware e BIOS) e `?tab=repair` (Reparo do Windows).

## Situação

| Subfase                         | Código                  | Commit            | Validação no app real                           |
| ------------------------------- | ----------------------- | ----------------- | ----------------------------------------------- |
| 4.5 Leitura (sem admin)         | pronto                  | `41494aa`         | feita (dados conferidos com o PC do usuário)    |
| 4.6 Ajustes reversíveis         | pronto (migration 0014) | `d4b2c48`         | feita (aplicar e desfazer voltaram iguais)      |
| 4.7 Reparo DISM/SFC (com admin) | pronto, testes passando | **não commitado** | **falta**: precisa de alguém para aceitar o UAC |

Versão publicada: **0.2.1** (sem a 4.5–4.7). Próxima sugerida: **0.3.0** com as três.

## Decisões do usuário (não mudar sem perguntar)

- **4.7 — opção 1:** o próprio executável, elevado pelo UAC a cada reparo, com `--windows-repair <pipe>`; DISM pela API
  (`DismApi.dll` de System32), SFC por `System32\sfc.exe /scannow`; progresso por named pipe. O UAC mostra "Editor
  desconhecido" (exe sem assinatura Authenticode); aceito por enquanto.
- **App fechado durante o reparo:** cancela a DISM e não começa o próximo passo (o SFC iniciado vai até o fim).
- **Plano de energia:** sugerir **sempre o Alto desempenho** quando não estiver ativo, inclusive no lugar do
  "Desempenho Máximo" personalizado.
- **Leituras extras:** microcódigo Intel 13ª/14ª geração, Integridade da memória (só informativo, nunca sugerir
  desligar) e aviso de módulos de RAM diferentes.
- **Inicialização:** desligar **e religar** itens do usuário (HKCU); itens da máquina e apps da Store só leitura.
- **BIOS:** nunca alterada pelo app; só recomendação com passo a passo. Sem internet: nunca dizer "desatualizada".
- **XMP/EXPO:** velocidade abaixo da informada pelo módulo é **suspeita**, nunca certeza.

## O que falta

### 1. Commit da 4.7

Os arquivos da 4.7 estão no working tree (ver `git status`). Antes do commit, rodar as validações do CLAUDE.md. Em
17/10/2026 passaram: Rust 468, Vitest 382, check, clippy, format e build. O teste de Notas "cria uma nota e salva
automaticamente ao digitar" falhou uma vez numa rodada completa e passou isolado e em mais duas rodadas: instabilidade de
tempo anterior a esta fase, vale investigar à parte.

### 2. Publicar a 0.3.0

Push não atualiza o app: o app instalado só vê versões publicadas nas Releases.

```bash
npm run version:bump -- minor
git commit -am "Versão 0.3.0"
git push
git tag -a v0.3.0 -m "Otimização: ajustes, hardware e reparo do Windows" -m "- Leitura das configurações do Windows e do hardware
- Ajustes reversíveis com Desfazer
- Reparo do Windows (DISM e SFC)"
git push origin v0.3.0
```

Depois: GitHub → Releases → **Publish release** no rascunho → no app, Configurações > Sobre > Buscar atualização.

### 3. Validar a 4.7 no app instalado (com o usuário presente para o UAC)

Sem reinício pendente no Windows:

1. Reparar → confirmar → **Não** no UAC: deve aparecer "Reparo: falhou" com "A permissão de administrador foi
   recusada".
2. Reparar → **Sim** no UAC → cancelar durante o ScanHealth: termina "Cancelado" e não sobra `zona-de-controle.exe`
   extra no Gerenciador de Tarefas.
3. Reparo completo (10 a 30 min): conferir o resultado do SFC com o fim de `C:\Windows\Logs\CBS\CBS.log`.
4. "Reparos anteriores" mostra as três execuções; os registros `windows_repair.started` / `windows_repair.executed`
   estão no log de auditoria.

Já validado sem admin: o ajudante recusa argumento inválido (sai com 64) e recusa rodar sem elevação (sai com 2),
sem abrir janela; a aba abre sem erros.

## Cuidado ao validar com `npm run dev`

`npm run dev` usa o **banco real**. Uma versão de desenvolvimento com migration nova (ex.: 0014) atualiza o banco, e o
app instalado mais antigo passa a **fechar sozinho ao abrir** (recusa banco de versão maior). Aconteceu em 17/10/2026 e
foi corrigido desfazendo a migration 14 (tabela vazia). Até a 0.3.0 ser instalada:

- faça backup dos `zona-de-controle.db*` antes de rodar `npm run dev` e **restaure depois** (o CLAUDE.md já pede isso);
- ou instale a 0.3.0 primeiro, que já conhece a migration 0014.

O app instalado fica em `D:\Zona de Controle\zona-de-controle.exe` (a pasta em AppData\Local é sobra antiga, só com o
desinstalador).

## Possíveis próximos passos (não pedidos ainda)

A próxima fase é a 8 (Polish), em [`plano-fase-8.md`](plano-fase-8.md). A assinatura Authenticode do executável ficou
de fora por decisão do usuário.

- Card no dashboard com o reinício pendente ou a última execução do reparo.
- Separar, na contagem da inicialização, os apps da Store que nunca pediram para iniciar.
