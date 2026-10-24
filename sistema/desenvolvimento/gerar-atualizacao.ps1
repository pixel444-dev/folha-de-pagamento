# Gera o pacote de atualizacao para o servidor (versao de producao).
# Roda os testes, confere se as telas compilam e cria atualizacoes\atualizacao-AAAA-MM-DD-HHMM.zip
# somente com o codigo: o banco de dados (sistema\dados) NUNCA entra no pacote.
# Chamado por "Gerar Atualizacao.bat" no computador de testes.

$ErrorActionPreference = 'Stop'
$sistema = Split-Path $PSScriptRoot -Parent
$raiz = Split-Path $sistema -Parent
Set-Location $sistema

function Etapa($texto) { Write-Host "`n  >> $texto" -ForegroundColor Cyan }
function Falhar($texto) { Write-Host "`n  ERRO: $texto`n" -ForegroundColor Red; exit 1 }

# O que vai para o servidor (caminhos relativos a pasta "folha de pagamento").
$itens = @(
  'Instalar no Servidor.bat',
  'Atualizar Servidor.bat',
  'sistema\client',
  'sistema\server',
  'sistema\shared',
  'sistema\instalacao',
  'sistema\package.json',
  'sistema\package-lock.json',
  'sistema\vite.config.js',
  'sistema\LEIA-ME.md',
  'sistema\.gitignore'
)

if (-not (Test-Path (Join-Path $sistema 'node_modules'))) {
  Etapa 'Instalando os componentes (so na primeira vez)'
  & npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Falhar 'Nao foi possivel instalar os componentes.' }
}

Etapa 'Rodando os testes'
& npm test
if ($LASTEXITCODE -ne 0) { Falhar 'Algum teste falhou. Corrija antes de gerar a atualizacao.' }

Etapa 'Conferindo se as telas compilam'
& npm run build --silent
if ($LASTEXITCODE -ne 0) { Falhar 'As telas nao compilaram. Corrija antes de gerar a atualizacao.' }

Etapa 'Montando o pacote'
$agora = Get-Date
$versao = $agora.ToString('yyyy-MM-dd HH:mm')
$carimbo = $agora.ToString('yyyy-MM-dd-HHmm')
$montagem = Join-Path $env:TEMP "folha-pacote-$carimbo"
if (Test-Path $montagem) { Remove-Item $montagem -Recurse -Force }
foreach ($item in $itens) {
  $origem = Join-Path $raiz $item
  if (-not (Test-Path $origem)) { Falhar "Arquivo nao encontrado: $item" }
  $destino = Join-Path $montagem $item
  New-Item -ItemType Directory -Force (Split-Path $destino -Parent) | Out-Null
  Copy-Item $origem $destino -Recurse -Force
}
# Por garantia: nada de banco de dados dentro do pacote.
Get-ChildItem $montagem -Recurse -File -Include *.db, *.db-wal, *.db-shm | Remove-Item -Force
[IO.File]::WriteAllText((Join-Path $montagem 'sistema\versao.json'), "{ `"versao`": `"$versao`" }")

$pastaPacotes = Join-Path $raiz 'atualizacoes'
New-Item -ItemType Directory -Force $pastaPacotes | Out-Null
$zip = Join-Path $pastaPacotes "atualizacao-$carimbo.zip"
Compress-Archive -Path (Join-Path $montagem '*') -DestinationPath $zip -Force
Remove-Item $montagem -Recurse -Force

# Guarda so os 10 pacotes mais recentes.
Get-ChildItem $pastaPacotes -Filter 'atualizacao-*.zip' | Sort-Object Name | Select-Object -SkipLast 10 | Remove-Item -Force

Write-Host "`n  Pacote gerado: versao $versao" -ForegroundColor Green
Write-Host "  $zip"
Write-Host "`n  Para atualizar o servidor:"
Write-Host "    1. Leve este arquivo .zip para o servidor (pendrive ou area de trabalho remota)"
Write-Host "       e coloque na pasta do sistema (ex.: C:\FolhaPagamento)."
Write-Host "    2. No servidor, clique com o botao direito em 'Atualizar Servidor.bat'"
Write-Host "       e escolha 'Executar como administrador'.`n"
Start-Process explorer.exe "/select,`"$zip`""
