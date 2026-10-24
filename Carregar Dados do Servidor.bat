@echo off
title Carregar dados do servidor na versao de testes
rem Use no computador de TESTES: troca o banco de testes por uma copia baixada do servidor.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sistema\desenvolvimento\carregar-dados-servidor.ps1"
pause
