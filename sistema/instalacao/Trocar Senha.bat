@echo off
title Trocar senha da Folha de Pagamento
cd /d "%~dp0.."
node server\definir-senha.js
pause
