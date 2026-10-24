# Folha de Pagamento

Sistema para fazer a folha de pagamento de uma ou mais empresas (de qualquer ramo), imprimir os cards de pagamento em folha A4 e guardar o histórico de todos os meses.

## Duas versões: produção e testes

| | **Produção** | **Testes** |
|---|---|---|
| Onde fica | Servidor da empresa, por exemplo em `C:\FolhaPagamento` | Computador de desenvolvimento (pasta `folha de pagamento`) |
| Para que serve | A folha de verdade, usada por todos | Criar e testar funções novas antes de levar para o servidor |
| Como abre | Liga sozinho com o servidor. Nos outros computadores: navegador em `http://<IP do servidor>:3210`, com senha | `Abrir Versão de Testes.bat` (só neste computador) |
| Como reconhecer | Rodapé do menu mostra "Versão AAAA-MM-DD HH:MM" | Faixa amarela **VERSÃO DE TESTES** no menu, "TESTES" na aba do navegador e marca d'água "NÃO USAR PARA PAGAMENTO" em tudo que for impresso |
| Dados | Os dados oficiais | Uma cópia para testes. **O que é lançado aqui não vai para o servidor** |

Regras:

- **Lançamentos do dia a dia são feitos só na produção** (servidor).
- Mudanças no sistema são feitas e testadas na versão de testes e só depois levadas para o servidor com o **Gerar Atualização.bat** + **Atualizar Servidor.bat** (veja "Como atualizar o servidor").
- O banco de dados **nunca** vai da versão de testes para o servidor. O pacote de atualização leva só o código.
- Para testar com os dados reais, traga uma cópia do servidor para os testes com o **Carregar Dados do Servidor.bat**.

Arquivos na pasta `folha de pagamento`:

| Arquivo | Onde usar | O que faz |
|---|---|---|
| `Abrir Versão de Testes.bat` | Testes | Liga a versão de testes neste computador (em segundo plano) e abre o navegador |
| `Fechar Versão de Testes.bat` | Testes | Desliga a versão de testes |
| `Gerar Atualização.bat` | Testes | Roda os testes e cria o pacote `atualizacoes\atualizacao-AAAA-MM-DD-HHMM.zip`, só com o código |
| `Carregar Dados do Servidor.bat` | Testes | Troca os dados de testes por uma cópia baixada do servidor |
| `Instalar no Servidor.bat` | Servidor | Primeira instalação (como administrador) |
| `Atualizar Servidor.bat` | Servidor | Instala um pacote de atualização (como administrador) e volta para a versão anterior se der problema |

O `Instalar no Servidor.bat` e o `Atualizar Servidor.bat` se recusam a rodar no computador de testes.

## Como abrir a versão de testes

Dê dois cliques em **`Abrir Versão de Testes.bat`** (na pasta `folha de pagamento` do computador de testes).

- Na primeira vez ele instala o sistema (precisa de internet, leva 1–2 minutos).
- O navegador abre sozinho em **http://localhost:3210**. A janela preta fecha sozinha: o sistema fica ligado em segundo plano.
- Pode fechar e abrir o navegador à vontade (ou guardar `http://localhost:3210` nos favoritos). O sistema continua ligado até você usar o **`Fechar Versão de Testes.bat`** ou desligar o computador.
- Abrir o `.bat` de novo com o sistema já ligado reinicia o sistema, já com as últimas mudanças.
- Se algo der errado, o que o sistema escreveu fica em `sistema\dados\testes.log`.
- Se os dados de testes vieram do servidor, ele pede a mesma senha do servidor.

Precisa do [Node.js](https://nodejs.org) versão 22.13 ou mais nova.

## Ajuda dentro do sistema (guia passo a passo)

Na primeira vez que o sistema é aberto num computador, aparece um convite para um guia rápido. O guia mostra, com balões, onde fica cada coisa e o que fazer, destacando na tela o botão ou o campo de cada passo.

- Para ver de novo, clique em **Ajuda** (no rodapé do menu da esquerda) e escolha a parte do sistema: Conhecendo o sistema, Criar uma empresa, Cadastrar funcionários, Fazer a folha do mês, Ajustes de um funcionário, Lançar vales, Relógio de ponto, Regras de pagamento, Histórico, Configurações da empresa ou Cópias de segurança. No alto aparecem os guias da tela em que você está.
- Avance com **Próximo** (ou a seta → do teclado), volte com **Voltar** (seta ←) e saia quando quiser no **×** ou com a tecla **Esc**.
- O guia troca de tela e abre os painéis sozinho, mas **não muda nada nos dados**: ele nunca salva, apaga nem lança nada.
- Se uma parte ainda não aparece na tela (por exemplo, a folha do mês ainda não foi aberta ou o relógio de ponto ainda não tem arquivo), o balão explica quando ela vai aparecer.

## Como fazer a folha do mês

1. Entre na empresa (menu da esquerda), aba **Folha do mês**, escolha o mês e a folha (1ª, 2ª, 3ª…).
2. Clique em **Abrir folha**: todos os funcionários ativos daquela folha entram com salário, bonificações e parcelas de vales.
3. Lance **faltas** (dias, aceita 0,5), **sábados**, **horas extras** e **atrasos** (aceitam `1:30` ou `1h30`) e **comissão**.
   Vales, compras e acréscimos (erro de folha, produção, meta…) ficam no botão **Ajustes** de cada pessoa.
   Tudo é salvo automaticamente.
4. **Imprimir cards** abre os cards em folhas A4. Marque também a **lista de conferência** para controlar os PIX pagos.
   Os cards ficam encostados uns nos outros: corte nas linhas tracejadas (marcadas com ✂) e cada corte já separa dois cards.

   **QR Code do Pix:** o card sai com um QR Code da chave Pix da pessoa **só se o cadastro tiver a chave, o titular da conta e o banco** preenchidos (assim quem paga sempre tem com o que conferir). Na lista de **Funcionários**, quem está incompleto aparece com a etiqueta amarela **Sem QR Code: falta…**. Para pagar, abra o aplicativo do banco, escolha **Pix → Ler QR Code** e aponte para o card.
   - O QR Code leva **só a chave, sem o valor**: o banco pede para digitar o valor. Assim dá para pagar um valor diferente do líquido (correção de erro, bonificação do patrão etc.).
   - Antes de confirmar, **confira se o nome e o banco que o app mostra batem com o titular e o banco escritos no card**. Se não baterem, não pague: corrija o cadastro em **Funcionários**.
   - Se o card não tiver QR Code, falta titular ou banco, ou a chave está num formato que o Pix não aceita (ex.: CPF sem um número, ou tipo de chave errado). A etiqueta na lista de Funcionários diz o que falta.
5. **Fechar folha**: os valores ficam congelados no **Histórico** (mudanças futuras de salário ou bonificação não alteram meses fechados). Se precisar corrigir, use **Reabrir folha**.

## Regras de cálculo

| Item | Regra |
|---|---|
| Valor do dia | salário ÷ 22, usando só o **quociente inteiro** (900 ÷ 22 = 40). Pode desligar na aba Regras. |
| Falta | dias de falta × valor do dia |
| Atraso / saída antecipada | horas × (valor do dia ÷ horas por dia; padrão 8 h) |
| Hora extra | horas × valor da hora extra (padrão R$ 7,00) |
| Sábado | um dia de salário (padrão) ou um valor fixo por sábado |
| Bonificações, prêmios e descontos | montados por cada empresa na aba **Regras** (veja abaixo). Ex.: zero falta, vale almoço. |
| Vales | descontados sozinhos todo mês até quitar o saldo (aba Vales) |

Todos os valores (hora extra, sábado, divisor e as regras da empresa) podem ser mudados na aba **Regras** de cada empresa, a qualquer hora. Valem para as folhas em andamento e as próximas; folhas fechadas não mudam. Ao lado do divisor dá para trocar o nome que aparece no lugar de "dias" (ex.: "dias úteis").

## Regras da empresa (sem precisar programar)

Cada empresa tem as suas bonificações, prêmios e descontos. Eles ficam na aba **Regras** e cada regra é montada em três passos:

1. **Quem recebe:** todos os funcionários, só quem estiver marcado no cadastro (como o vale almoço; cada pessoa pode ter um valor próprio) ou só algumas funções (ex.: Vendedor).
2. **Quando:** nenhuma condição (vale sempre) ou condições com os dados do mês. Ex.: *faltas igual a 0* **e** *horas de atraso no máximo 2h*; *mês da folha igual a 12* (só em dezembro). Dá para pedir todas as condições ou só uma delas.
3. **Quanto:**
   - **valor fixo** (R$ 100,00);
   - **porcentagem** de um valor (10% do salário, 3% da comissão, 8% do bruto do mês);
   - **por quantidade** (R$ 0,50 por peça produzida; 1,5 × o valor da hora por hora extra; R$ 50,00 por filho);
   - **tabela de faixas**, de três jeitos:
     - um valor em R$ por faixa (até 2 anos de casa: R$ 50,00; até 5 anos: R$ 100,00; acima: R$ 150,00);
     - uma porcentagem conforme a faixa (comissão até R$ 5.000: 3%; acima: 5%);
     - **progressiva**, como o INSS: cada porcentagem vale só sobre a parte do valor que cai na faixa;
   - **fórmula**, como no Excel, para o que os outros jeitos não cobrem (veja abaixo).

   Em qualquer jeito dá para pôr um **valor mínimo** e um **valor máximo** (teto). Ex.: 5% da comissão, no máximo R$ 300,00.

A regra pode **somar** no pagamento ou **descontar**. Para começar rápido, escolha um dos **modelos prontos** (prêmio assiduidade, prêmio que diminui com as faltas, vale almoço, benefício proporcional aos dias trabalhados, tempo de casa, bônus sobre a comissão com teto, hora extra 50%, abono de dezembro, desconto por atraso, INSS) e ajuste. O modelo do INSS traz a tabela de 2025 só como exemplo: confira a tabela do ano antes de usar.

**A ordem das regras importa:** elas são calculadas de cima para baixo, e uma regra pode usar o **valor de outra regra que está acima dela** e os **totais da folha até ali** (total de proventos, bruto do mês, valor das horas extras, desconto das faltas…). Ex.: um "reflexo" de 10% sobre o prêmio, ou um desconto de 8% sobre o bruto. Mude a ordem com as setas ao lado de cada regra. O botão **Duplicar** cria uma cópia para fazer uma variação.

**Teste antes de salvar:** no fim da tela da regra, escolha um funcionário (ou preencha um exemplo) e o sistema calcula o mês inteiro dele com todas as regras: mostra se recebe, quanto, por quê (quando não recebe) e o líquido do mês.

**Fórmulas:** escritas como no Excel, com os dados entre colchetes e os valores separados por ponto e vírgula. Exemplos:
- `SE([Faltas] = 0; 150; 50)`: R$ 150 para quem não faltou, R$ 50 para quem faltou;
- `MIN([Comissão] * 5%; 300)`: 5% da comissão, no máximo R$ 300;
- `[Valor da regra] * [Dias trabalhados] / [Dias do mês (divisor)]`: proporcional aos dias trabalhados;
- `SE(E([Faltas] = 0; [Horas de atraso] <= 1); 100; 0)`: R$ 100 se não faltou e atrasou até 1 hora.

Números vão sem ponto de milhar e com vírgula nos centavos: `100000`, `1500,50` (com ponto, a fórmula avisa o erro). Funções: SE, E, OU, NÃO, MIN, MAX, ARRED (arredondar), TRUNCAR e ABS. Use os botões **Inserir dado** e **Inserir função** para não errar os nomes. Enquanto digita, o sistema diz se a fórmula está certa ou explica o erro. Renomear um campo não quebra a fórmula.

**Na folha do mês:** cada regra com condição ganha uma coluna (Sim/Não). Clicando, dá para aplicar ou tirar a regra de uma pessoa só naquele mês (fica marcado com `*`). No botão **Ajustes** da pessoa tem a mesma escolha: Automático, Recebe ou Não recebe.

**Campos personalizados:** se a empresa precisa de algo que o sistema não tem, crie um campo em **Regras → Campos personalizados**. Pode ser:
- **da folha do mês** (peças produzidas, vendas, meta batida…): vira uma coluna na folha do mês;
- **do cadastro** (número de filhos, nível, tem moto…): aparece em **Dados para as regras**, no cadastro do funcionário.

Os dois podem ser usados nas regras. Tipos: número, horas, valor em R$ ou sim/não.

Bom saber:
- **Tempo de casa** usa a **data de admissão** do cadastro. Sem data de admissão, conta como 0.
- **Dias trabalhados** = dias do mês (o divisor do salário, normalmente 22) menos as faltas.
- **Desligar** uma regra guarda ela sem usar. **Apagar** tira de vez (folhas fechadas não mudam).
- Um campo ou uma regra que está sendo usado por outra regra não pode ser apagado: mude ou apague a outra regra antes.
- Se for usar uma regra de hora extra (ex.: hora extra 50%), deixe a hora extra do **Cálculo básico** em R$ 0,00 para não pagar duas vezes.
- Numa fórmula, dividir por zero dá zero, e uma fórmula com erro não paga nada (o teste mostra o erro).

## Empresas e folhas (grupos)

**Criar uma empresa:** clique em **+ Nova empresa** (no menu da esquerda ou no Início), dê o nome e escolha uma cor. Ela começa com uma folha e as regras padrão (salário ÷ 22, 8 horas por dia, hora extra R$ 7,00, sábado = um dia). Depois ajuste tudo em **Configurações** e na aba **Regras** da empresa.

**Mudar o nome ou a cor:** **Configurações → Empresa**. As folhas que já foram fechadas continuam com o nome antigo no histórico e nos cards.

**Folhas (grupos):** em **Configurações → Folhas (grupos)**:

- **+ Nova folha** cria mais um grupo na hora. Dê um apelido (ex.: Grupo D), o dia de fechamento e clique em **Salvar folhas**.
- A **lixeira** apaga uma folha. Antes, passe os funcionários **ativos** dela para outra folha (no cadastro de cada um) e feche ou exclua a folha do mês que estiver em andamento. Os desligados vão sozinhos para a primeira folha que sobrar.
- As folhas já fechadas de um grupo apagado **continuam no Histórico** (com a marca "apagada") e podem ser impressas de novo.
- Os números não se repetem: se apagar a 2ª e criar outra, a nova vira a 4ª, para não misturar com o histórico da antiga.

**Apagar uma empresa:** no fim de **Configurações**, **Apagar empresa**. O sistema mostra quantos funcionários, folhas do mês e vales serão apagados e pede para digitar o nome da empresa. Isso apaga **tudo** dela (funcionários, histórico, vales, ponto, logo). Antes de apagar, o sistema faz uma cópia de segurança do dia: se foi engano, restaure por ela (veja "Onde ficam os dados"). Se a empresa só parou de funcionar, prefira deixar os funcionários como desligados em vez de apagar, para não perder o histórico.

## Vales

Na aba **Vales** de cada empresa:

1. **+ Lançar vale**: escolha o funcionário, o valor, em quantas vezes descontar (de uma vez, 2×, 3×…) e a partir de qual folha.
   Antes de salvar aparece como vai ser descontado (ex.: "3 parcelas de R$ 116,67: OUT, NOV, DEZ").
2. O vale é **descontado sozinho** nas folhas do funcionário até quitar e aparece no card (ex.: "Vale 14/10 (1/3)").
3. **Recibo**: imprime um recibo em duas vias (empresa e funcionário) com o valor por extenso, para o funcionário assinar.
4. A lista mostra quanto já foi descontado e o **saldo** de cada vale. O saldo só baixa quando a folha é **fechada**.

Também dá para lançar um vale direto na folha do mês: clique no funcionário e use **+ Lançar vale** na seção Vales.

Se a folha de um mês já estiver fechada, ou se você marcar "Não descontar vales neste mês", a parcela passa para a folha seguinte e não se perde.
Um vale que já foi descontado não pode ser excluído; use **Encerrar saldo** para parar de descontar o que falta.

## Relógio de ponto

Cada empresa tem a sua aba **Ponto**. As faltas, sábados, horas extras e atrasos saem do arquivo do relógio, sem precisar digitar.

**Tirar o arquivo no relógio:** encaixe um pendrive (de preferência FAT32) na porta fiscal do relógio e espere ele gerar o arquivo **AFD** (um `.txt` com "AFD" no nome). Não abra nem edite o arquivo.

**Primeira vez (uma vez só):**

1. Na aba **Ponto**, clique em **Importar arquivo do relógio** e escolha o arquivo do pendrive.
   O relógio fica ligado a essa empresa; se o arquivo for de outra empresa, o sistema avisa.
2. Confira o **Horário de trabalho** da empresa (ex.: `07:00-11:00 12:10-17:00`).
3. Em **Pessoas do relógio**, ligue cada pessoa do relógio ao funcionário da folha. O sistema sugere pelo nome: confira e clique em **Ligar todas as sugestões**; as que faltarem, escolha na lista.
4. Quem trabalha em outro horário ganha um **Horário próprio** na mesma tela, por exemplo `07:00-13:00` (meio período) ou `07:00-17:00` (quem não bate o ponto no almoço).

**Todo mês:**

1. Tire o arquivo do relógio de novo e importe. Pode importar o arquivo inteiro: o que já estava no sistema é ignorado.
2. Abra a folha do mês (aba **Folha do mês**) e clique em **Puxar do ponto** (ou vá na aba Ponto, em **Espelho da folha**).
3. Confira o espelho: **Ver dias** mostra as batidas de cada dia. Depois clique em **Levar para a folha**.
   Isso troca faltas, sábados, horas extras e atrasos pelo que deu no ponto. Comissões, vales e outros ajustes não mudam.
   Depois ainda dá para mudar qualquer valor à mão na folha.

**Espelho de ponto impresso:** em **Ver dias**, o botão **Imprimir** gera uma folha A4 com todos os dias, as batidas, os totais, um recado incentivando a bater o ponto certinho e espaço para o funcionário assinar. É bom entregar quando alguém questionar faltas ou atrasos. **Imprimir espelhos** (ao lado das datas) imprime de todos da folha, um por página.

**Como o ponto é contado:**

| Item | Regra |
|---|---|
| Período | pelo dia de fechamento da folha (Configurações). Fechando dia 10, a folha de outubro vai de 11/09 a 10/10. Dá para mudar as datas na tela. |
| Tolerância | pela lei (CLT art. 58): até 5 minutos em cada batida, somando no máximo 10 no dia, não contam. Passou disso, conta a diferença inteira. |
| Hora extra / atraso | no dia, compara o tempo trabalhado com o do horário (8h50 em 07:00-11:00 12:10-17:00). |
| Falta | dia de segunda a sexta sem batida, em que outras pessoas bateram ponto. Dia em que ninguém bateu (feriado, folga geral) não é falta. Antes da data de admissão também não. |
| Sábado | sábado com batida conta 1 sábado trabalhado. |
| Para conferir | dia com batida faltando ou sobrando (ex.: esqueceu de bater o almoço) ou ponto no domingo. Esses dias não entram na conta de horas: veja em **Ver dias** e ajuste na folha se precisar. |
| Batida repetida | duas batidas com menos de 5 minutos de diferença contam como uma só. |

O arquivo tirado hoje ainda não tem o dia de hoje completo, então o sistema só conta até ontem e avisa quando o período da folha passa da data do arquivo.

## Logo da empresa

Em **Configurações → Logo da empresa**, escolha a imagem (PNG ou JPG; fundo branco ou transparente fica melhor). Antes de salvar, aparece uma prévia de como fica no card. Você pode salvar só naquela empresa ou usar o mesmo logo em todas. O logo sai no topo de cada card, na lista de conferência e na tela do sistema.

## Onde ficam os dados

- Tudo fica no arquivo `sistema/dados/folha.db` **do computador onde o sistema está instalado**: este computador ou o servidor da empresa (veja a seção abaixo). Nada vai para a internet.
- O sistema faz **cópia de segurança automática** uma vez por dia (ao abrir e, se ficar ligado direto como no servidor, conferindo a cada hora) e sempre que uma folha é fechada, em `sistema/dados/backups` (guarda as 60 mais recentes).
- **Segunda pasta de cópias**: em **Cópias de segurança** (no rodapé do menu da esquerda), informe o caminho de uma segunda pasta, por exemplo `D:\Backups\Folha`. Cada cópia passa a ser gravada nos dois lugares, e também são guardadas as 60 mais recentes nessa pasta.
  - Use outro disco do servidor, um HD externo ou uma pasta sincronizada com a nuvem. Por exemplo, o Google Drive para computador no modo "Espelhar arquivos" (a pasta "Meu Drive" dentro de `C:\Users\...`); ele só envia para a nuvem enquanto o usuário dono do Drive estiver conectado no servidor.
  - Pasta de outro computador da rede (`\\computador\pasta`) costuma **não** funcionar no servidor, porque o sistema roda como serviço do Windows, sem o usuário de rede. Se der erro de permissão ao salvar, use uma das opções acima.
  - Se a segunda pasta falhar (HD desconectado, disco cheio…), o sistema avisa na tela inicial e na página de cópias, e tenta de novo a cada hora.
- Na mesma página, **Fazer cópia agora** faz uma cópia na hora e **Baixar cópia** baixa o banco inteiro para o computador que está usando.
- Para restaurar uma cópia: feche o sistema, troque o arquivo `sistema/dados/folha.db` pela cópia (renomeada para `folha.db`) e abra de novo.

## Usar no servidor da empresa (vários computadores)

O sistema pode ficar no servidor da empresa, que fica ligado 24 horas. Os outros computadores só abrem o navegador e não precisam instalar nada. Nesse modo o sistema **pede senha**.

### 1. Primeira instalação no servidor

1. No computador de testes, dê dois cliques em **`Gerar Atualização.bat`**. Ele cria o pacote `atualizacoes\atualizacao-AAAA-MM-DD-HHMM.zip`.
2. Feche a versão de testes (**`Fechar Versão de Testes.bat`**).
3. Leve para o servidor (pendrive ou área de trabalho remota) o pacote `.zip`.
   - **Empresa nova:** leve só o `.zip`. O servidor começa vazio e tudo é configurado lá (veja "Instalação nova (começar do zero)").
   - **Só se você já lançou dados de verdade na versão de testes** e quer aproveitar: leve também a pasta `sistema\dados` deste computador. Depois disso, os dados oficiais passam a ser os do servidor.
4. No servidor:
   1. extraia o `.zip` em `C:\FolhaPagamento`;
   2. (só se trouxe os dados) copie a pasta `dados` para dentro de `C:\FolhaPagamento\sistema`, ficando `C:\FolhaPagamento\sistema\dados\folha.db`.
5. No servidor, instale o [Node.js](https://nodejs.org) (versão LTS). O servidor precisa ter Windows 10 / Windows Server 2016 ou mais novo.
6. Clique com o botão direito em **`C:\FolhaPagamento\Instalar no Servidor.bat`** e escolha **Executar como administrador**. Ele:
   - instala os componentes e prepara as telas;
   - pede a senha de acesso (mínimo 8 caracteres), a mesma para todos;
   - libera a porta 3210 no firewall **só para a rede local e o Tailscale**;
   - cria a tarefa "Folha de Pagamento" no Agendador de Tarefas, que liga o sistema sozinho sempre que o servidor iniciar. Não é preciso criar essa tarefa à mão;
   - mostra os endereços que os outros computadores devem usar.
7. **Daqui em diante, a folha é feita só no servidor.** Os dados que ficaram no computador de testes viram dados de teste.

### 2. Acessar dos outros computadores

- **Na rede da empresa**: abra o navegador em `http://<IP do servidor>:3210` (o instalador mostra o endereço, por exemplo `http://192.168.1.10:3210`) e salve nos favoritos.
- **Fora da empresa**: use o Tailscale (próximo item).
- O login vale por 7 dias em cada computador. O botão **Sair** fica no rodapé do menu.
- Depois de 5 senhas erradas seguidas, aquele computador fica bloqueado por 5 minutos.

### 3. Acesso de fora da empresa: Tailscale

**Não abra a porta 3210 no roteador nem use um endereço de DDNS (como os do tipo `empresa.ddns...`) para este sistema.** Isso deixaria a folha (salários e chaves PIX) exposta para a internet inteira, sujeita a robôs que ficam testando senhas. O Tailscale cria uma rede privada e criptografada só entre os computadores autorizados, sem abrir nenhuma porta.

1. Crie uma conta gratuita em [tailscale.com](https://tailscale.com) (pode ser com um e-mail da empresa). O plano gratuito atende usando a mesma conta em todos os computadores.
2. Instale o Tailscale no servidor e entre com a conta. Nas preferências do ícone do Tailscale, ative **Run unattended**, para ele funcionar mesmo sem ninguém conectado no servidor.
3. No [painel do Tailscale](https://login.tailscale.com/admin/machines), no menu "…" do servidor, escolha **Disable key expiry** (senão ele pede para entrar de novo a cada 6 meses).
4. Instale o Tailscale nos computadores de fora e entre com a mesma conta.
5. No painel aparece o endereço do servidor, que começa com `100.`. Nos computadores de fora, acesse `http://100.x.y.z:3210`.

### Manutenção no servidor

- **Trocar a senha**: execute `sistema\instalacao\Trocar Senha.bat` como administrador. Todos vão precisar entrar de novo.
- **Atualizar para uma versão nova**: use o `Atualizar Servidor.bat` (veja "Como atualizar o servidor"). Não copie arquivos por cima à mão.
- **Se o sistema não abrir**: veja o arquivo `sistema\dados\servidor.log`. No Agendador de Tarefas, a tarefa "Folha de Pagamento" pode ser iniciada ou finalizada.
- **Cópias de segurança**: continuam automáticas em `sistema\dados\backups`, agora no servidor. Configure também a **segunda pasta** (veja "Onde ficam os dados") em outro disco, para ter as cópias em dois lugares.
- **Desinstalar**: apague a tarefa "Folha de Pagamento" no Agendador de Tarefas e a regra "Folha de Pagamento" no Firewall do Windows.

## Como atualizar o servidor (função nova ou correção)

**No computador de testes**

1. Faça a mudança e teste na versão de testes. Para testar com dados reais, veja "Testar com os dados do servidor" abaixo.
2. Dê dois cliques em **`Gerar Atualização.bat`**. Ele roda os testes, confere se as telas compilam e cria `atualizacoes\atualizacao-AAAA-MM-DD-HHMM.zip`. Se algum teste falhar, o pacote não é criado.

**No servidor**

3. Copie o `.zip` para a pasta do sistema (`C:\FolhaPagamento`).
4. Clique com o botão direito em **`Atualizar Servidor.bat`** e escolha **Executar como administrador**. Ele mostra a versão atual e a nova e pede confirmação. Depois:
   - para o sistema (fica fora do ar por alguns minutos);
   - copia o banco para `sistema\dados\backups\antes-da-atualizacao-AAAA-MM-DD-HHMM`;
   - guarda o código atual em `C:\FolhaPagamento\versao-anterior`;
   - troca **só o código** (a pasta `sistema\dados` não é tocada), reinstala e liga o sistema;
   - confere se a versão nova está no ar. **Se não estiver, volta sozinho para a versão anterior e para o banco de antes**, e avisa.
5. Peça para quem estiver com o sistema aberto apertar **F5** no navegador. A versão nova aparece no rodapé do menu.

Se a versão nova mudar a estrutura do banco (por exemplo, uma coluna nova), o sistema ajusta o banco sozinho ao iniciar, sem perder dados.

### Testar com os dados do servidor

1. No sistema do **servidor**, vá em **Cópias de segurança → Baixar cópia** (o arquivo vai para a pasta Downloads).
2. No computador de testes, feche a versão de testes e dê dois cliques em **`Carregar Dados do Servidor.bat`**. Ele pega a cópia mais recente da pasta Downloads e substitui os dados de testes. Os dados de testes anteriores ficam guardados em `sistema\dados\backups\testes-antes-de-carregar-...`.
3. Abra a versão de testes. Ela pede a mesma senha do servidor.

O que for lançado na versão de testes continua sem ir para o servidor.

## Instalação nova (começar do zero)

O código do sistema **não guarda nenhum dado de funcionário nem de empresa**. O que está no GitHub é só o código: banco de dados, cópias de segurança, senha, arquivos do relógio e planilhas nunca vão para lá (o arquivo `.gitignore` bloqueia).

**Instalar numa empresa nova a partir do GitHub:**

1. No computador que vai ser o de testes, instale o [Node.js](https://nodejs.org) (versão LTS).
2. Na página do sistema no GitHub, clique em **Code → Download ZIP** e extraia numa pasta, por exemplo `Documentos\folha de pagamento`.
3. Dê dois cliques em **`Abrir Versão de Testes.bat`** para conhecer o sistema e testar à vontade (os testes ficam só neste computador).
4. Para o servidor, siga "Primeira instalação no servidor" (acima) como **empresa nova**: leve só o `.zip` gerado pelo **`Gerar Atualização.bat`**, sem a pasta `dados`.

Quando o sistema é aberto com a pasta `sistema\dados` vazia, ele começa com uma única empresa chamada **Minha Empresa**, com uma folha, as regras padrão e nenhum funcionário. Na produção (servidor), a senha é pedida pelo instalador. Depois é só:

1. Em **Configurações**, trocar o nome, a cor e o logo. Na aba **Regras**, ajustar o cálculo (hora extra, sábado) e criar as bonificações, prêmios e descontos da empresa.
2. Cadastrar os funcionários em **Funcionários** (quem estiver sem PIX aparece com a etiqueta vermelha **Sem PIX**).
3. Se tiver mais de uma empresa ou unidade, criar as outras em **+ Nova empresa**.

Na versão de testes, para ter os dados de verdade do servidor, use o `Carregar Dados do Servidor.bat`.

## Para quem for mexer no código

```
sistema/
  shared/calculo.js     regras de cálculo (usadas pela tela e pelo servidor) + testes em calculo.test.js
  shared/regras.js      regras de pagamento montadas por cada empresa (quem / quando / quanto), guardadas
                        como dados em bonificacoes.definicao + testes em regras.test.js
  shared/formula.js     fórmulas das regras no estilo do Excel, lidas sem eval + testes em formula.test.js
  shared/ponto.js       leitura do AFD do relógio (Portaria 1510 e 671) e regras do ponto + testes em ponto.test.js
  server/               API (Express) e banco SQLite (node:sqlite)
  server/acesso.js      senha e sessões (exigidas quando há senha definida)
  client/src/           telas em React
  client/src/guia/      guia passo a passo (botão Ajuda): roteiros.js tem os passos de cada parte, e cada passo
                        aponta para um data-guia nas telas + teste em roteiros.test.js (avisa se um sumir)
  instalacao/           scripts do servidor: instalar, atualizar (com volta automática), trocar senha
  desenvolvimento/      scripts só do computador de testes: gerar pacote, carregar dados do servidor
                        (esta pasta não vai no pacote; os scripts do servidor usam a presença dela
                        para se recusar a rodar no computador de testes)
  versao.json           criado pelo Gerar Atualização (não existe na pasta de desenvolvimento)
```

- `node server/index.js --rede`: modo **produção**. Aceita outros computadores (0.0.0.0) e só inicia se houver senha (`node server/definir-senha.js`). Sem `--rede` é a **versão de testes** (só 127.0.0.1, com faixa e marca d'água de testes).
- `GET /api/info` devolve `{ ambiente: 'producao' | 'testes', versao }` (público, usado pela tela e pelo atualizador).

- `npm test`: testes das regras de cálculo, das regras das empresas, das fórmulas, do ponto, do Pix e dos roteiros do guia
- `npm run dev:servidor` e `npm run dev:tela`: modo de desenvolvimento (tela em http://localhost:5173)
- `npm run build` + `npm start`: modo normal
