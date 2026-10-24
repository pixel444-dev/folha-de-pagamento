// Roteiros do guia (botão "Ajuda"): cada roteiro ensina uma parte do sistema, passo a passo.
// Só dados, sem React, para o teste conferir que cada passo aponta para um lugar que existe nas telas.
//
// Cada passo:
//   titulo, texto   o que aparece no balão (**texto** sai em negrito)
//   alvo            data-guia do que fica em destaque; sem alvo, o balão aparece no meio da tela
//   rota            tela onde o passo acontece (":empresa" vira a empresa aberta, ou a primeira)
//   abrir           data-guia de um botão que o guia clica antes (só botões que abrem algo, nunca os que salvam)
//   gaveta          o alvo fica dentro do painel lateral aberto pelo "abrir" deste passo ou de um anterior
//   seFaltar        explicação quando o alvo não está na tela agora (ex.: a folha ainda não foi aberta)
//   obrigatorio     sem o alvo não dá para continuar: o guia para e mostra o seFaltar
//   sugerir         id de outro roteiro oferecido quando o obrigatorio falta
//   lado            onde o balão prefere ficar: 'baixo', 'cima', 'direita' ou 'esquerda'

export const GRUPOS_GUIA = [
  { id: 'comecar', titulo: 'Para começar' },
  { id: 'mes', titulo: 'Todo mês' },
  { id: 'consultar', titulo: 'Configurar e consultar' },
];

const ABERTA = 'Aparece depois que a folha deste mês é aberta.';
const SEM_RELOGIO = 'Aparece depois que o primeiro arquivo do relógio é importado.';
const SEM_HISTORICO = 'Aparece depois que a primeira folha da empresa é aberta.';

export const ROTEIROS = [
  {
    id: 'visao-geral',
    grupo: 'comecar',
    titulo: 'Conhecendo o sistema',
    resumo: 'Um passeio rápido pelas telas principais.',
    telas: ['inicio'],
    passos: [
      {
        rota: '/',
        titulo: 'Bem-vindo!',
        texto: 'Este guia mostra onde fica cada coisa no sistema. Avance com **Próximo** (ou com as setas do teclado). Pode ficar tranquilo: o guia não muda nada nos seus dados.',
      },
      {
        alvo: 'menu',
        lado: 'direita',
        titulo: 'O menu',
        texto: 'O menu da esquerda está sempre à mão. **Início** volta para a tela inicial. Embaixo de **Empresas** fica cada empresa: clique no nome para entrar nela. O número ao lado é quantos funcionários ativos ela tem.',
      },
      {
        alvo: 'inicio-empresa',
        lado: 'direita',
        titulo: 'As folhas deste mês',
        texto: 'A tela inicial mostra um quadro como este para cada empresa, com as folhas do mês e a situação de cada uma: **Não iniciada**, **Em andamento** ou **Fechada**. Clique numa folha para ir direto para ela.',
      },
      {
        alvo: 'inicio-atalhos',
        titulo: 'Atalhos',
        texto: 'Botões para ir direto à **Folha do mês**, aos **Funcionários** e ao **Histórico** da empresa.',
      },
      {
        alvo: 'inicio-dicas',
        lado: 'cima',
        titulo: 'O dia a dia em 3 passos',
        texto: 'Todo mês é assim: abrir a folha, lançar faltas, sábados e horas extras, imprimir os cards de pagamento e fechar a folha.',
      },
      {
        rota: '/empresa/:empresa/folha',
        alvo: 'empresa-abas',
        titulo: 'Dentro de uma empresa',
        texto: 'Cada empresa tem estas abas: **Folha do mês**, **Ponto**, **Funcionários**, **Vales**, **Histórico**, **Regras** e **Configurações**. Cada uma tem o seu guia no botão Ajuda.',
      },
      {
        alvo: 'menu-copias',
        lado: 'direita',
        titulo: 'Cópias de segurança',
        texto: 'O sistema guarda cópias dos dados sozinho, todo dia e sempre que uma folha é fechada. Aqui você confere as cópias e pode fazer uma na hora.',
      },
      {
        alvo: 'menu-ajuda',
        lado: 'direita',
        titulo: 'Precisou de ajuda?',
        texto: 'Clique em **Ajuda** quando quiser e escolha a parte do sistema em que tem dúvida. O guia daquela parte mostra de novo, passo a passo, o que fazer.',
      },
    ],
  },

  {
    id: 'empresa',
    grupo: 'comecar',
    titulo: 'Criar uma empresa',
    resumo: 'Cadastrar outra empresa ou unidade e deixar pronta para a folha.',
    telas: ['inicio'],
    passos: [
      {
        rota: '/',
        alvo: 'inicio-nova-empresa',
        titulo: 'Nova empresa',
        texto: 'Para cadastrar outra empresa (ou outra unidade), clique em **+ Nova empresa**. O mesmo botão também fica no menu da esquerda.',
      },
      {
        abrir: 'inicio-nova-empresa',
        gaveta: true,
        alvo: 'nova-empresa-nome',
        titulo: 'Nome da empresa',
        texto: 'Digite o nome como ele deve aparecer nos cards de pagamento.',
      },
      {
        gaveta: true,
        alvo: 'nova-empresa-cor',
        titulo: 'Cor',
        texto: 'Escolha uma cor. Ela ajuda a reconhecer a empresa no menu e nas telas.',
      },
      {
        gaveta: true,
        alvo: 'nova-empresa-criar',
        titulo: 'Criar',
        texto: 'Clique em **Criar empresa**. Ela já começa com uma folha e as regras padrão (salário ÷ 22, 8 horas por dia, hora extra de R$ 7,00 e sábado valendo um dia). Logo depois o sistema abre as Configurações dela.',
      },
      {
        rota: '/empresa/:empresa/configuracoes',
        alvo: 'config-folhas',
        titulo: 'Folhas (grupos)',
        texto: 'Em **Configurações**, ajuste as folhas: cada folha é um grupo de funcionários pago junto. Dê um apelido e o dia em que cada uma fecha e clique em **Salvar folhas**.',
      },
      {
        alvo: 'config-logo',
        titulo: 'Logo',
        texto: 'Escolha o logo da empresa: ele sai no topo de cada card de pagamento.',
      },
      {
        alvo: 'aba-regras',
        titulo: 'Próximos passos',
        texto: 'Depois confira a aba **Regras** (hora extra, faltas, sábados e bonificações) e cadastre as pessoas na aba **Funcionários**. As duas têm guia no botão Ajuda.',
      },
    ],
  },

  {
    id: 'funcionarios',
    grupo: 'comecar',
    titulo: 'Cadastrar funcionários',
    resumo: 'Salário, bonificações, chave PIX e o que fazer quando alguém sai.',
    telas: ['funcionarios'],
    passos: [
      {
        rota: '/empresa/:empresa/funcionarios',
        alvo: 'aba-funcionarios',
        titulo: 'Funcionários',
        texto: 'O cadastro das pessoas fica na aba **Funcionários** de cada empresa.',
      },
      {
        alvo: 'func-filtros',
        titulo: 'Procurar alguém',
        texto: 'Busque pelo nome, função ou titular do PIX e filtre pela folha (1ª, 2ª…). Quem foi desligado fica escondido: marque **Mostrar desligados** para ver.',
      },
      {
        alvo: 'func-tabela',
        titulo: 'A lista',
        texto: 'Clique em qualquer linha para abrir o cadastro e mudar salário, bonificações ou PIX. As etiquetas mostram bonificações, comissão e vales. **Sem PIX** e **Sem QR Code** avisam o que falta preencher.',
      },
      {
        alvo: 'func-novo',
        titulo: 'Cadastrar',
        texto: 'Para cadastrar uma pessoa, clique em **+ Novo funcionário**.',
      },
      {
        abrir: 'func-novo',
        gaveta: true,
        alvo: 'func-dados',
        titulo: 'Dados principais',
        texto: 'Preencha o nome (como sai no card), a função, a folha em que a pessoa recebe e o salário mensal. A **data de admissão** é usada nas regras de tempo de casa.',
      },
      {
        gaveta: true,
        alvo: 'func-bonificacoes',
        titulo: 'Bonificações e comissão',
        texto: 'Marque as bonificações que esta pessoa recebe (ex.: vale almoço). Dá para pôr um valor diferente só para ela. Marque **Recebe comissão** se ela ganha sobre vendas: isso abre a coluna Comissão na folha.',
      },
      {
        gaveta: true,
        alvo: 'func-pix',
        titulo: 'Chave PIX',
        texto: 'Preencha o tipo e a chave PIX, o titular da conta e o banco. Com os três preenchidos, o card sai com **QR Code** para pagar mais rápido.',
      },
      {
        gaveta: true,
        alvo: 'func-desligado',
        titulo: 'Quando alguém sai',
        texto: 'Não exclua: marque **Funcionário desligado**. A pessoa não entra nas próximas folhas e o histórico de pagamentos continua guardado.',
      },
      {
        gaveta: true,
        alvo: 'func-salvar',
        titulo: 'Salvar',
        texto: 'Clique em **Cadastrar funcionário**. A pessoa entra sozinha na próxima folha aberta. Se a folha do mês já estiver aberta, ela aparece num aviso com o botão **Incluir na folha**.',
      },
    ],
  },

  {
    id: 'folha',
    grupo: 'mes',
    titulo: 'Fazer a folha do mês',
    resumo: 'Abrir a folha, lançar faltas e horas, imprimir os cards e fechar.',
    telas: ['folha'],
    passos: [
      {
        rota: '/empresa/:empresa/folha',
        alvo: 'aba-folha',
        titulo: 'Folha do mês',
        texto: 'A folha de cada mês é feita na aba **Folha do mês** da empresa.',
      },
      {
        alvo: 'folha-mes',
        titulo: 'Escolha o mês',
        texto: 'Use as setas para ir para o mês anterior ou para o próximo. A tela abre sempre no mês atual.',
      },
      {
        alvo: 'folha-abas',
        titulo: 'Escolha a folha',
        texto: 'Cada folha é um grupo de funcionários pago junto (1ª folha, 2ª folha…). Clique na que vai fazer. A etiqueta mostra se ela está **Não iniciada**, **Em andamento** ou **Fechada**.',
      },
      {
        alvo: 'folha-abrir',
        titulo: 'Abrir a folha',
        texto: 'Uma folha nova começa no botão **Abrir…**: todos os funcionários ativos dela entram sozinhos, com salário, bonificações e parcelas de vales.',
        seFaltar: 'Esta folha já foi aberta, por isso o botão não aparece agora.',
      },
      {
        alvo: 'folha-tabela',
        titulo: 'Lançar o mês',
        texto: 'Para cada pessoa, digite as **faltas** (em dias; meio dia = 0,5), os **sábados** trabalhados, as **horas extras** e os **atrasos** (escreva 1:30 ou 1h30). **Enter** ou as setas ↑ ↓ descem para a pessoa de baixo. Os valores são recalculados na hora.',
        seFaltar: 'A tabela aparece depois que a folha é aberta.',
      },
      {
        alvo: 'folha-salvo',
        titulo: 'Salva sozinho',
        texto: 'Não tem botão de salvar: tudo é salvo automaticamente. Aqui aparece **✓ Tudo salvo**.',
        seFaltar: ABERTA,
      },
      {
        alvo: 'folha-pendentes',
        titulo: 'Alguém ficou de fora?',
        texto: 'Se você cadastrar alguém depois de abrir a folha, aparece um aviso amarelo com o botão **Incluir na folha**.',
        seFaltar: 'Agora não tem ninguém faltando nesta folha.',
      },
      {
        alvo: 'folha-ajustes',
        lado: 'esquerda',
        titulo: 'Ajustes de cada pessoa',
        texto: 'Em **Ajustes** ficam os vales, as compras e outros descontos, os acréscimos (erro de folha, produção, meta…) e a prévia do card. O guia **Ajustes de um funcionário** mostra cada parte.',
        seFaltar: 'O botão Ajustes aparece em cada pessoa quando a folha está aberta.',
      },
      {
        alvo: 'folha-totais',
        titulo: 'Totais',
        texto: 'O total de proventos, de descontos e o **total a pagar** desta folha. Quando a empresa tem mais de uma folha, o quadro **Mês inteiro**, mais acima, soma todas.',
        seFaltar: ABERTA,
      },
      {
        alvo: 'folha-puxar-ponto',
        titulo: 'Relógio de ponto',
        texto: 'Se a empresa usa relógio de ponto, **Puxar do ponto** leva as faltas, sábados, horas extras e atrasos do relógio para a folha. Veja o guia **Ponto**.',
        seFaltar: 'O botão Puxar do ponto aparece quando a folha está aberta.',
      },
      {
        alvo: 'folha-imprimir',
        titulo: 'Imprimir os cards',
        texto: '**Imprimir cards** abre os cards de pagamento em folhas A4, com a chave PIX e o QR Code. Na tela de impressão dá para incluir também a **lista de conferência** dos pagamentos.',
        seFaltar: ABERTA,
      },
      {
        alvo: 'folha-fechar',
        titulo: 'Fechar a folha',
        texto: 'Com tudo conferido e pago, clique em **Fechar folha**. Os valores ficam guardados no Histórico e o saldo dos vales baixa. Precisou corrigir depois? Use **Reabrir folha**.',
        seFaltar: ABERTA,
      },
    ],
  },

  {
    id: 'ajustes',
    grupo: 'mes',
    titulo: 'Ajustes de um funcionário',
    resumo: 'Vales, compras, acréscimos e a prévia do card de uma pessoa.',
    telas: ['folha'],
    passos: [
      {
        rota: '/empresa/:empresa/folha',
        alvo: 'folha-ajustes',
        lado: 'esquerda',
        obrigatorio: true,
        sugerir: 'folha',
        titulo: 'Abrir os ajustes',
        texto: 'Na folha do mês, clique em **Ajustes** (ou no nome da pessoa) para abrir o painel dela.',
        seFaltar: 'Para ver os ajustes, a folha deste mês precisa estar aberta e ter pelo menos um funcionário. Abra a folha primeiro: o guia **Fazer a folha do mês** mostra como.',
      },
      {
        abrir: 'folha-ajustes',
        gaveta: true,
        alvo: 'ajustes-lancamentos',
        titulo: 'Lançamentos do mês',
        texto: 'No alto ficam as faltas, sábados, horas extras e atrasos (os mesmos da tabela). As regras com condição, como o prêmio por zero falta, podem ser trocadas aqui para **Recebe** ou **Não recebe** só para esta pessoa neste mês.',
      },
      {
        gaveta: true,
        alvo: 'ajustes-vales',
        titulo: 'Vales',
        texto: 'Mostra as parcelas de vale descontadas neste mês. **+ Lançar vale** lança um vale novo que já desconta nesta folha. Marque **Não descontar vales neste mês** para passar a parcela para a próxima folha.',
      },
      {
        gaveta: true,
        alvo: 'ajustes-descontos',
        titulo: 'Outros descontos',
        texto: 'Compras e outros descontos que valem só para este mês. Escreva uma descrição: ela sai no card.',
      },
      {
        gaveta: true,
        alvo: 'ajustes-acrescimos',
        titulo: 'Acréscimos',
        texto: 'Valores a mais neste mês, como erro de folha, produção ou meta.',
      },
      {
        gaveta: true,
        alvo: 'ajustes-observacao',
        titulo: 'Observação',
        texto: 'Um recado curto que sai impresso no card (não é obrigatório).',
      },
      {
        gaveta: true,
        alvo: 'ajustes-previa',
        titulo: 'Prévia do card',
        texto: 'O card exatamente como vai ser impresso. O botão **Imprimir só este card**, embaixo, imprime só o desta pessoa.',
      },
      {
        gaveta: true,
        alvo: 'ajustes-pronto',
        titulo: 'Pronto',
        texto: 'Aqui também tudo é salvo sozinho. Clique em **Pronto** para voltar para a folha.',
      },
    ],
  },

  {
    id: 'vales',
    grupo: 'mes',
    titulo: 'Lançar vales',
    resumo: 'Adiantamentos e compras parceladas, descontados sozinhos na folha.',
    telas: ['vales'],
    passos: [
      {
        rota: '/empresa/:empresa/vales',
        alvo: 'aba-vales',
        titulo: 'Vales',
        texto: 'Vales (adiantamentos) e compras parceladas ficam na aba **Vales**. O desconto entra sozinho na folha.',
      },
      {
        alvo: 'vales-totais',
        titulo: 'Resumo',
        texto: 'Quanto ainda falta descontar de todos os vales, quantos estão em aberto e quanto foi lançado neste mês.',
      },
      {
        alvo: 'vales-filtros',
        titulo: 'Procurar',
        texto: 'Busque pelo funcionário ou pela descrição e escolha ver os vales **Em aberto**, **Quitados** ou **Todos**.',
      },
      {
        alvo: 'vales-tabela',
        titulo: 'A lista',
        texto: 'Cada vale mostra em quantas vezes é descontado, quanto já foi descontado e o saldo. Clique na linha para mudar ou excluir. **Recibo** imprime um recibo em duas vias para o funcionário assinar.',
      },
      {
        alvo: 'vales-novo',
        titulo: 'Lançar um vale',
        texto: 'Para lançar um vale, clique em **+ Lançar vale**.',
      },
      {
        abrir: 'vales-novo',
        gaveta: true,
        alvo: 'vale-funcionario',
        titulo: 'Para quem',
        texto: 'Escolha o funcionário. Logo abaixo, digite o **valor** e a **data** do vale.',
      },
      {
        gaveta: true,
        alvo: 'vale-vezes',
        titulo: 'Em quantas vezes',
        texto: 'Escolha em quantas vezes descontar: **De uma vez**, 2×, 3×… ou digite outro número.',
      },
      {
        gaveta: true,
        alvo: 'vale-inicio',
        titulo: 'A partir de quando',
        texto: 'Escolha o mês da folha em que o desconto começa. Ao lado fica o tipo (**Vale**, **Compra** ou **Outro**). A descrição, embaixo, sai no card e não é obrigatória.',
      },
      {
        gaveta: true,
        alvo: 'vale-resumo',
        titulo: 'Confira antes de salvar',
        texto: 'O sistema mostra como o vale vai ser descontado, mês a mês.',
        seFaltar: 'Esse resumo aparece assim que você digita o valor.',
      },
      {
        gaveta: true,
        alvo: 'vale-salvar',
        titulo: 'Lançar',
        texto: 'Clique em **Lançar vale**. O desconto entra sozinho nas folhas até quitar, e o saldo baixa quando cada folha é fechada. Depois dá para imprimir o recibo.',
      },
    ],
  },

  {
    id: 'ponto',
    grupo: 'mes',
    titulo: 'Relógio de ponto',
    resumo: 'Importar o arquivo do relógio, conferir o espelho e levar para a folha.',
    telas: ['ponto'],
    passos: [
      {
        rota: '/empresa/:empresa/ponto',
        alvo: 'aba-ponto',
        titulo: 'Ponto',
        texto: 'Se a empresa tem relógio de ponto, a aba **Ponto** calcula faltas, sábados, horas extras e atrasos a partir do arquivo do relógio, sem digitar.',
      },
      {
        alvo: 'ponto-importar',
        titulo: 'Importar o arquivo',
        texto: 'No relógio, encaixe o pendrive na porta fiscal e espere gerar o arquivo **AFD** (um .txt). Depois clique em **Importar arquivo do relógio** e escolha o arquivo. Pode importar o arquivo inteiro sempre: o que já foi importado é ignorado.',
      },
      {
        alvo: 'ponto-horario',
        titulo: 'Horário de trabalho',
        texto: 'Escreva a entrada e a saída de cada turno, por exemplo **07:00-11:00 12:10-17:00**, e clique em **Salvar horário**. Diferenças de até 5 minutos em cada batida não contam.',
      },
      {
        abrir: 'ponto-ver-pessoas',
        alvo: 'ponto-pessoas',
        titulo: 'Ligar as pessoas',
        texto: 'Em **Pessoas do relógio**, ligue cada pessoa do relógio ao funcionário da folha (só precisa fazer uma vez). O sistema sugere pelo nome. Quem trabalha em outro horário ganha um **Horário próprio**.',
      },
      {
        abrir: 'ponto-ver-espelho',
        alvo: 'ponto-espelho',
        titulo: 'Espelho da folha',
        texto: 'Para cada funcionário: dias trabalhados, faltas, sábados, horas extras e atrasos no período da folha. Escolha o mês e a folha logo acima.',
        seFaltar: SEM_RELOGIO,
      },
      {
        alvo: 'ponto-periodo',
        titulo: 'Período',
        texto: 'O período segue o dia de fechamento da folha (em Configurações). Se precisar, mude as datas aqui.',
        seFaltar: SEM_RELOGIO,
      },
      {
        alvo: 'ponto-ver-dias',
        lado: 'esquerda',
        titulo: 'Conferir os dias',
        texto: 'A coluna **Para conferir** mostra dias com batida faltando ou sobrando. **Ver dias** mostra as batidas de cada dia e imprime o espelho para o funcionário assinar.',
        seFaltar: SEM_RELOGIO,
      },
      {
        alvo: 'ponto-levar',
        titulo: 'Levar para a folha',
        texto: 'Com tudo conferido, clique em **Levar para a folha**: as faltas, sábados, horas extras e atrasos vão para a folha do mês. Comissões e vales não mudam, e depois ainda dá para mudar qualquer valor à mão.',
        seFaltar: 'O botão aparece quando a folha deste mês está aberta e o relógio já tem dados.',
      },
      {
        alvo: 'ponto-imprimir',
        titulo: 'Imprimir espelhos',
        texto: '**Imprimir espelhos** imprime o ponto de todos da folha, um por página, com espaço para assinatura.',
        seFaltar: SEM_RELOGIO,
      },
    ],
  },

  {
    id: 'regras',
    grupo: 'consultar',
    titulo: 'Regras de pagamento',
    resumo: 'Bonificações, prêmios, descontos, hora extra e campos próprios.',
    telas: ['regras'],
    passos: [
      {
        rota: '/empresa/:empresa/regras',
        alvo: 'aba-regras',
        titulo: 'Regras',
        texto: 'Na aba **Regras** você ensina o sistema a calcular: bonificações, prêmios, descontos, hora extra, faltas e sábados.',
      },
      {
        alvo: 'regras-lista',
        titulo: 'Regras da empresa',
        texto: 'Cada regra diz **quem** recebe, **quando** e **quanto**, e entra sozinha em todas as folhas. A frase embaixo do nome resume a regra.',
      },
      {
        alvo: 'regras-acoes',
        lado: 'esquerda',
        titulo: 'Mudar uma regra',
        texto: '**Editar** muda a regra. **Duplicar** cria uma cópia para fazer uma variação. **Desligar** guarda a regra sem usar (bom para algo temporário). A lixeira apaga.',
        seFaltar: 'Esta empresa ainda não tem regras.',
      },
      {
        alvo: 'regras-ordem',
        lado: 'direita',
        titulo: 'A ordem importa',
        texto: 'As regras são calculadas de cima para baixo: uma regra pode usar o valor das que estão acima dela. Mude a ordem com as setas.',
        seFaltar: 'Esta empresa ainda não tem regras.',
      },
      {
        alvo: 'regras-nova',
        titulo: 'Criar uma regra',
        texto: 'Para criar uma regra, clique em **+ Nova regra**.',
      },
      {
        abrir: 'regras-nova',
        gaveta: true,
        alvo: 'regra-modelo',
        titulo: 'Comece por um modelo',
        texto: 'O jeito mais fácil: escolha um modelo pronto (prêmio assiduidade, vale almoço, hora extra 50%, INSS…) e ajuste o que precisar.',
      },
      {
        gaveta: true,
        alvo: 'regra-nome',
        titulo: 'Nome',
        texto: 'Dê um nome (sai assim no card) e diga se a regra **soma** no pagamento ou **desconta**.',
      },
      {
        gaveta: true,
        alvo: 'regra-quem',
        titulo: 'Passo 1: quem recebe',
        texto: 'Todos os funcionários, só quem estiver marcado no cadastro (cada um pode ter um valor próprio) ou só algumas funções.',
      },
      {
        gaveta: true,
        alvo: 'regra-quando',
        titulo: 'Passo 2: quando',
        texto: 'Sem condição, a regra vale sempre. Com condição, por exemplo **Faltas igual a 0**, ela vale só para quem não faltou.',
      },
      {
        gaveta: true,
        alvo: 'regra-quanto',
        titulo: 'Passo 3: quanto',
        texto: 'Valor fixo, porcentagem, por quantidade, tabela de faixas ou uma fórmula como no Excel. Também dá para pôr um valor mínimo e um máximo.',
      },
      {
        gaveta: true,
        alvo: 'regra-teste',
        titulo: 'Teste antes de salvar',
        texto: 'Escolha um funcionário (ou preencha um exemplo) e veja se ele recebe, quanto e por quê.',
      },
      {
        gaveta: true,
        alvo: 'regra-salvar',
        titulo: 'Salvar',
        texto: 'Clique em **Salvar regra**. Ela vale para as folhas em andamento e as próximas; folhas fechadas não mudam.',
      },
      {
        alvo: 'regras-basico',
        titulo: 'Cálculo básico',
        texto: 'Valor da hora extra, por quantos dias dividir o salário para achar o dia de falta, horas por dia (para os atrasos) e quanto vale o sábado. Depois clique em **Salvar cálculo básico**.',
      },
      {
        alvo: 'regras-campos',
        titulo: 'Campos personalizados',
        texto: 'Crie campos para o que a empresa precisar (peças produzidas, meta batida, número de filhos…) e use nas regras. Os do mês viram uma coluna na folha; os do cadastro aparecem no cadastro do funcionário.',
      },
    ],
  },

  {
    id: 'historico',
    grupo: 'consultar',
    titulo: 'Histórico',
    resumo: 'Consultar e imprimir de novo as folhas dos meses passados.',
    telas: ['historico'],
    passos: [
      {
        rota: '/empresa/:empresa/historico',
        alvo: 'aba-historico',
        titulo: 'Histórico',
        texto: 'O **Histórico** guarda os totais de todas as folhas, mês a mês, para consulta.',
      },
      {
        alvo: 'hist-anos',
        titulo: 'Ano',
        texto: 'Escolha o ano que quer ver.',
        seFaltar: SEM_HISTORICO,
      },
      {
        alvo: 'hist-resumo',
        titulo: 'Resumo do ano',
        texto: 'Total pago no ano, média por mês, quantas folhas foram fechadas e um gráfico com o total de cada mês.',
        seFaltar: SEM_HISTORICO,
      },
      {
        alvo: 'hist-meses',
        titulo: 'Cada mês',
        texto: 'Um quadro por mês com salários, horas extras, faltas, vales… de cada folha. **abrir** leva para a folha, **cards** imprime os cards de novo e **Imprimir o mês inteiro** imprime todas as folhas do mês.',
        seFaltar: SEM_HISTORICO,
      },
    ],
  },

  {
    id: 'configuracoes',
    grupo: 'consultar',
    titulo: 'Configurações da empresa',
    resumo: 'Nome, cor, folhas (grupos), dia de fechamento e logo.',
    telas: ['configuracoes'],
    passos: [
      {
        rota: '/empresa/:empresa/configuracoes',
        alvo: 'aba-configuracoes',
        titulo: 'Configurações',
        texto: 'Em **Configurações** ficam os dados da empresa.',
      },
      {
        alvo: 'config-empresa',
        titulo: 'Nome e cor',
        texto: 'Mude o nome e a cor da empresa e clique em **Salvar nome e cor**. As folhas já fechadas continuam com o nome antigo.',
      },
      {
        alvo: 'config-folhas',
        titulo: 'Folhas (grupos)',
        texto: 'Cada folha é um grupo de funcionários pago junto. Dê um apelido e o dia em que fecha (usado no ponto) e clique em **Salvar folhas**. **+ Nova folha** cria mais um grupo.',
      },
      {
        alvo: 'config-logo',
        titulo: 'Logo',
        texto: 'Escolha o logo da empresa: ele sai no topo dos cards e da lista de conferência. Logo abaixo aparece como fica no card.',
      },
      {
        alvo: 'config-apagar',
        titulo: 'Apagar empresa',
        texto: 'Tira a empresa e tudo o que é dela. O sistema pede para digitar o nome e faz uma cópia de segurança antes. Se a empresa só parou, prefira marcar os funcionários como desligados.',
        seFaltar: 'Só aparece quando há mais de uma empresa no sistema.',
      },
    ],
  },

  {
    id: 'copias',
    grupo: 'consultar',
    titulo: 'Cópias de segurança',
    resumo: 'Onde ficam as cópias dos dados e como guardar em outro lugar.',
    telas: ['copias'],
    passos: [
      {
        rota: '/copias',
        alvo: 'menu-copias',
        lado: 'direita',
        titulo: 'Cópias de segurança',
        texto: 'As cópias de segurança ficam no rodapé do menu da esquerda.',
      },
      {
        alvo: 'copias-acoes',
        titulo: 'Cópia na hora',
        texto: 'O sistema faz uma cópia por dia e sempre que uma folha é fechada. **Fazer cópia agora** faz uma na hora. **Baixar cópia** salva o arquivo no computador que você está usando.',
      },
      {
        alvo: 'copias-principal',
        titulo: 'Pasta principal',
        texto: 'Fica no mesmo computador do sistema e guarda as 60 cópias mais recentes.',
      },
      {
        alvo: 'copias-extra',
        titulo: 'Segunda pasta',
        texto: 'Para mais segurança, escolha uma pasta em outro disco, num HD externo ou numa pasta da nuvem e clique em **Salvar pasta**. Se a cópia falhar lá, aparece um aviso na tela inicial.',
      },
    ],
  },
];

/** Qual tela está aberta, pelo endereço: 'inicio', 'copias' ou a aba da empresa ('folha', 'vales'…). */
export function telaDoEndereco(caminho) {
  if (caminho === '/') return 'inicio';
  if (caminho.startsWith('/copias')) return 'copias';
  const m = /^\/empresa\/[^/]+\/([^/]+)/.exec(caminho);
  return m ? m[1] : null;
}

export const roteirosDaTela = (tela) => ROTEIROS.filter((r) => r.telas.includes(tela));
