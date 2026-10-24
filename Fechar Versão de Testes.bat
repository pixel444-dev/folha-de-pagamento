@echo off
title Fechar Folha de Pagamento - VERSAO DE TESTES
rem Desliga a versao de testes que esta rodando em segundo plano neste computador.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sistema\desenvolvimento\versao-testes.ps1" fechar
if errorlevel 1 (pause) else (timeout /t 3 >nul)
