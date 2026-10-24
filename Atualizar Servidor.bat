@echo off
title Atualizar Folha de Pagamento no Servidor
rem Use no SERVIDOR (versao de producao). Deixe o arquivo atualizacao-*.zip nesta pasta
rem (o mais recente e usado) e execute como administrador.

net session >nul 2>nul
if errorlevel 1 goto sem_admin

rem Tudo numa linha so: este .bat pode ser substituido durante a atualizacao.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sistema\instalacao\atualizar-servidor.ps1" "%~1" & pause & exit /b

:sem_admin
echo.
echo   Este atualizador precisa de permissao de administrador.
echo   Clique com o botao direito neste arquivo e escolha "Executar como administrador".
echo.
pause
exit /b 1
