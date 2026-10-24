# Folha de Pagamento: instruções para o Claude

**Este computador é a VERSÃO DE TESTES.** A versão de produção (dados oficiais, usada por todos) roda no servidor da empresa, em `C:\FolhaPagamento`, iniciada pelo Agendador de Tarefas com `node server/index.js --rede`, porta 3210, com senha. Não há acesso ao servidor a partir daqui.

- Todo desenvolvimento acontece aqui. A produção só recebe código pelo fluxo `Gerar Atualização.bat` (gera `atualizacoes/atualizacao-*.zip`, só código) → `Atualizar Servidor.bat` no servidor (faz backup, troca o código, volta sozinho se a versão nova não subir).
- `sistema/dados/` daqui são dados de teste (podem ser uma cópia do servidor carregada com `Carregar Dados do Servidor.bat`). Nunca devem ir para o servidor; o pacote não leva banco.
- Mudanças na estrutura do banco precisam ser migrações automáticas e aditivas em `sistema/server/db.js` (padrão `colunas(...)` / `PRAGMA user_version`): o banco de produção é atualizado sozinho ao iniciar a versão nova, e o atualizador pode voltar para o código anterior com esse banco.
- Antes de dizer que algo está pronto para produção: `npm test` em `sistema/` e conferir na versão de testes. Lembrar o usuário de gerar o pacote e rodar o `Atualizar Servidor.bat` no servidor.
- Scripts `.ps1` precisam ficar em ASCII puro (Windows PowerShell 5.1 lê sem BOM como ANSI) e os `.bat` com quebra de linha CRLF.
- Documentação para o usuário: `sistema/LEIA-ME.md` (em português, linguagem simples). O usuário não é programador.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
