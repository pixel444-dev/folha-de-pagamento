<p align="center">
  <img src=".github/capa.svg" alt="Folha de Pagamento: folha do mês, vales, relógio de ponto e cards de pagamento com Pix" width="100%">
</p>

<p align="center">
  <img alt="Windows" src="https://img.shields.io/badge/Windows-10%20%7C%2011-1d2621?style=flat-square&logo=windows&logoColor=d9d5ca">
  <img alt="Node.js 22.13+" src="https://img.shields.io/badge/Node.js-22.13%2B-2c6a3a?style=flat-square&logo=nodedotjs&logoColor=e6f2e8">
  <img alt="Dados locais" src="https://img.shields.io/badge/dados-ficam%20na%20empresa-845400?style=flat-square">
</p>

<p align="center">
  Sistema para fazer a folha de pagamento de uma ou mais empresas, <b>de qualquer ramo</b>.<br>
  Roda no computador ou no servidor da própria empresa e abre no navegador.
</p>

---

## O que o sistema faz

| Função | O que faz |
|---|---|
| 🧾 **Folha do mês** | Abre a folha com todos os funcionários ativos: salário, bonificações e parcelas de vales já calculados. Uma empresa pode ter várias folhas no mês (1ª, 2ª, 3ª…). |
| 💸 **Vales** | Lança vales, inclusive parcelados, que são descontados sozinhos nas folhas seguintes. |
| ⏰ **Relógio de ponto** | Lê o arquivo AFD do relógio e calcula faltas, sábados, horas extras e atrasos, sem digitar. Imprime o espelho de ponto. |
| 🧮 **Regras de pagamento** | A própria empresa monta bonificações, prêmios e descontos, com modelos prontos e sem precisar programar. |
| 📱 **Cards com Pix** | Imprime os cards de pagamento em folha A4, cada um com o QR Code do Pix do funcionário, e a lista de conferência dos Pix pagos. |
| 📚 **Histórico** | Guarda as folhas de todos os meses para consultar e reimprimir. |
| 🛟 **Cópias de segurança** | Cópia automática todo dia e ao fechar cada folha, com opção de uma segunda pasta em outro disco. |
| 🧭 **Guia passo a passo** | Botão **Ajuda** com balões que mostram onde fica cada coisa e o que fazer. |

## Como começar

1. Instale o [Node.js](https://nodejs.org) (versão LTS).
2. Nesta página, clique em **Code → Download ZIP** e extraia numa pasta.
3. Dê dois cliques em **`Abrir Versão de Testes.bat`**. O navegador abre sozinho em `http://localhost:3210`.

Numa instalação nova o sistema começa vazio, com uma empresa genérica ("Minha Empresa") para renomear e configurar.

> [!TIP]
> O passo a passo completo (instalar no servidor da empresa, acesso de outros computadores com senha, atualizações e cópias de segurança) está no **[LEIA-ME](sistema/LEIA-ME.md)**.

## Seus dados ficam com você

> [!IMPORTANT]
> **Este repositório tem só o código.** Nenhum dado de empresa, funcionário, folha ou ponto vem para cá. Tudo fica guardado apenas no computador ou servidor onde o sistema está instalado.
