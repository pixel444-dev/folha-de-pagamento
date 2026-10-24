@echo off
title Folha de Pagamento - VERSAO DE TESTES
rem Liga a versao de testes em segundo plano (sem janela preta) e abre o navegador.
rem Se ja estiver ligada, reinicia com o codigo mais novo. Para desligar: "Fechar Versao de Testes.bat".
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sistema\desenvolvimento\versao-testes.ps1" abrir
if errorlevel 1 pause
