# Liga ou desliga a versao de testes neste computador, sem deixar janela preta aberta.
#   abrir:  instala na primeira vez, prepara as telas, desliga a versao que estiver rodando
#           (assim sempre abre o codigo mais novo), liga o sistema escondido e abre o navegador.
#   fechar: desliga a versao de testes.
# O que o sistema escreveria na janela fica em dados\testes.log.
# Chamado por "Abrir Versao de Testes.bat", "Fechar Versao de Testes.bat" e carregar-dados-servidor.ps1.
param([ValidateSet('abrir', 'fechar')] [string]$Acao = 'abrir')

$ErrorActionPreference = 'Stop'
$sistema = Split-Path $PSScriptRoot -Parent
$porta = 3210
$url = "http://localhost:$porta"
$log = Join-Path $sistema 'dados\testes.log'
Set-Location $sistema

function Falhar($texto) { Write-Host "`n  ERRO: $texto`n" -ForegroundColor Red; exit 1 }

# Desliga o sistema que estiver na porta (so se for o Node). Devolve $true se havia um rodando.
function DesligarTestes {
  $ids = Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
  if (-not $ids) { return $false }
  foreach ($id in $ids) {
    $processo = Get-Process -Id $id -ErrorAction SilentlyContinue
    if (-not $processo) { continue }
    if ($processo.ProcessName -ne 'node') { Falhar "A porta $porta esta sendo usada por outro programa ($($processo.ProcessName))." }
    Stop-Process -Id $id -Force
  }
  for ($i = 0; $i -lt 20 -and (Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue); $i++) {
    Start-Sleep -Milliseconds 250
  }
  return $true
}

if ($Acao -eq 'fechar') {
  if (DesligarTestes) { Write-Host "`n  A versao de testes foi desligada.`n" -ForegroundColor Green }
  else { Write-Host "`n  A versao de testes ja estava desligada.`n" }
  exit 0
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) { Falhar 'O Node.js nao esta instalado neste computador. Baixe a versao LTS em https://nodejs.org , instale e abra este arquivo de novo.' }
$node = $nodeCmd.Source

if (-not (Test-Path (Join-Path $sistema 'node_modules'))) {
  Write-Host "`n  Instalando o sistema - so acontece na primeira vez, aguarde...`n"
  & npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Falhar 'Nao foi possivel instalar o sistema. Verifique a conexao com a internet e tente de novo.' }
}

Write-Host '  Preparando as telas...'
& npm run build --silent | Out-Null
if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $sistema 'dist\index.html'))) { Falhar 'Nao foi possivel preparar as telas.' }

Write-Host '  Ligando o sistema...'
DesligarTestes | Out-Null
New-Item -ItemType Directory -Force (Split-Path $log -Parent) | Out-Null
Start-Process cmd.exe -WorkingDirectory $sistema -WindowStyle Hidden `
  -ArgumentList "/c `"`"$node`" server\index.js > `"$log`" 2>&1`""

$ok = $false
for ($i = 0; $i -lt 40 -and -not $ok; $i++) {
  Start-Sleep -Milliseconds 500
  # 127.0.0.1 e nao localhost: no PowerShell o localhost tenta o IPv6 primeiro e demora.
  try { Invoke-WebRequest "http://127.0.0.1:$porta/api/sessao" -UseBasicParsing -TimeoutSec 2 | Out-Null; $ok = $true }
  catch { if ($_.Exception.Response) { $ok = $true } }
}
if (-not $ok) {
  Write-Host "`n  Ultimas linhas de $log :"
  if (Test-Path $log) { Get-Content $log -Tail 15 | ForEach-Object { Write-Host "    $_" } }
  Falhar 'O sistema nao ligou.'
}

Start-Process $url
Write-Host "`n  Pronto! A versao de testes esta aberta no navegador ($url)." -ForegroundColor Green
Write-Host '  Pode fechar o navegador quando quiser: o sistema continua ligado em segundo plano.'
Write-Host '  Para desligar: "Fechar Versao de Testes.bat".'
