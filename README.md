# Folha de Pagamento

Sistema para fazer a folha de pagamento de uma ou mais empresas (de qualquer ramo): folha do mês, vales, relógio de ponto (arquivo AFD), regras de bonificação montadas pela própria empresa, cards de pagamento com QR Code do Pix e histórico de todos os meses.

Roda no Windows com [Node.js](https://nodejs.org) (versão 22.13 ou mais nova). Os dados ficam só no computador ou servidor onde o sistema está instalado.

**Este repositório tem só o código.** Nenhum dado de empresa, funcionário, folha ou ponto vai para cá. Numa instalação nova o sistema começa vazio, com uma empresa genérica ("Minha Empresa") para renomear e configurar.

## Como começar

1. Instale o Node.js (versão LTS).
2. Clique em **Code → Download ZIP** e extraia numa pasta.
3. Dê dois cliques em **`Abrir Versão de Testes.bat`**.

O passo a passo completo (instalar no servidor da empresa, acesso de outros computadores, atualizações, cópias de segurança) está em [sistema/LEIA-ME.md](sistema/LEIA-ME.md).
