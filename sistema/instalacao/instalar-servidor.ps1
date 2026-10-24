# Instala a Folha de Pagamento como servico no servidor da empresa:
# instala dependencias, gera as telas, define a senha, libera a porta no firewall
# (so para a rede local e o Tailscale) e cria a tarefa que inicia o sistema junto com o Windows.
# Chamado por "Instalar no Servidor.bat" (precisa ser executado como administrador).

$ErrorActionPreference = 'Stop'
$sistema = Split-Path $PSScriptRoot -Parent
$porta = 3210
$nomeTarefa = 'Folha de Pagamento'
Set-Location $sistema

function Etapa($texto) { Write-Host "`n  >> $texto" -ForegroundColor Cyan }
function Falhar($texto) { Write-Host "`n  ERRO: $texto`n" -ForegroundColor Red; exit 1 }

if (Test-Path (Join-Path $sistema 'desenvolvimento')) {
  Falhar 'Este e o computador da VERSAO DE TESTES. Gere o pacote com "Gerar Atualizacao.bat" e instale no servidor.'
}

if ($sistema -like "$env:SystemDrive\Users\*") {
  Write-Host "`n  Atencao: a pasta esta dentro de C:\Users ($sistema)." -ForegroundColor Yellow
  Write-Host '  No servidor o recomendado e algo como C:\FolhaPagamento. Continuando mesmo assim...' -ForegroundColor Yellow
}

Etapa 'Conferindo o Node.js'
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) { Falhar 'O Node.js nao esta instalado. Baixe a versao LTS em https://nodejs.org , instale e rode este instalador de novo.' }
$node = $nodeCmd.Source
$versao = [version](& $node -p 'process.versions.node')
if ($versao -lt [version]'22.13.0') { Falhar "O Node.js deste servidor e a versao $versao. Instale a versao LTS mais nova em https://nodejs.org" }
Write-Host "     Node.js $versao em $node"

Etapa 'Parando o sistema, se ja estiver rodando'
if (Get-ScheduledTask -TaskName $nomeTarefa -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName $nomeTarefa }
Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

Etapa 'Instalando os componentes (precisa de internet, pode levar alguns minutos)'
& npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Falhar 'Nao foi possivel instalar os componentes. Verifique a internet e tente de novo.' }

Etapa 'Preparando as telas'
& npm run build --silent
if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $sistema 'dist\index.html'))) { Falhar 'Nao foi possivel preparar as telas.' }

Etapa 'Senha de acesso'
& $node (Join-Path $sistema 'server\definir-senha.js') --se-faltar
if ($LASTEXITCODE -ne 0) { Falhar 'A senha nao foi definida.' }

Etapa 'Liberando a porta no firewall (somente rede local e Tailscale)'
Get-NetFirewallRule -DisplayName $nomeTarefa -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $nomeTarefa -Direction Inbound -Action Allow -Protocol TCP -LocalPort $porta `
  -RemoteAddress LocalSubnet, '100.64.0.0/10' -Profile Any | Out-Null

Etapa 'Criando a tarefa que inicia o sistema junto com o Windows'
$log = Join-Path $sistema 'dados\servidor.log'
$script = Join-Path $sistema 'server\index.js'
$acao = New-ScheduledTaskAction -Execute 'cmd.exe' -WorkingDirectory $sistema `
  -Argument "/c `"`"$node`" `"$script`" --rede >> `"$log`" 2>&1`""
$gatilho = New-ScheduledTaskTrigger -AtStartup
$usuario = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$ajustes = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $nomeTarefa -Action $acao -Trigger $gatilho -Principal $usuario -Settings $ajustes -Force | Out-Null
Start-ScheduledTask -TaskName $nomeTarefa

Etapa 'Conferindo se o sistema subiu'
$ok = $false
for ($i = 0; $i -lt 15 -and -not $ok; $i++) {
  Start-Sleep -Seconds 1
  try { Invoke-RestMethod "http://127.0.0.1:$porta/api/sessao" -TimeoutSec 2 | Out-Null; $ok = $true } catch {}
}
if (-not $ok) { Falhar "O sistema nao respondeu. Veja o arquivo $log" }

$enderecos = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  ForEach-Object { "     http://$($_.IPAddress):$porta   ($($_.InterfaceAlias))" }

Write-Host "`n  Pronto! O sistema esta rodando e vai iniciar sozinho sempre que o servidor ligar." -ForegroundColor Green
Write-Host "`n  Nos outros computadores, abra o navegador em um destes enderecos:"
$enderecos | ForEach-Object { Write-Host $_ }
Write-Host "`n  (O endereco que comeca com 100. e o do Tailscale, para quem esta fora da empresa.)`n"
