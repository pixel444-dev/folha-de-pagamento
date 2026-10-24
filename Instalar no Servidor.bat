@echo off
title Instalar Folha de Pagamento no Servidor

net session >nul 2>nul
if errorlevel 1 goto sem_admin

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sistema\instalacao\instalar-servidor.ps1"
pause
exit /b

:sem_admin
echo.
echo   Este instalador precisa de permissao de administrador.
echo   Clique com o botao direito neste arquivo e escolha "Executar como administrador".
echo.
pause
exit /b 1
