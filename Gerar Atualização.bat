@echo off
title Gerar atualizacao para o servidor
rem Use no computador de TESTES: cria atualizacoes\atualizacao-AAAA-MM-DD-HHMM.zip (so codigo, sem banco).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sistema\desenvolvimento\gerar-atualizacao.ps1"
pause
