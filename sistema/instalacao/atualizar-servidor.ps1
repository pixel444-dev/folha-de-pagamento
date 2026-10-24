# Atualiza a versao de producao (servidor) com um pacote gerado pelo "Gerar Atualizacao.bat".
# 1. faz uma copia do banco e do codigo atual;  2. troca SO o codigo (sistema\dados nao e tocado);
# 3. roda o instalar-servidor.ps1 da versao nova;  4. se a versao nova nao subir, volta tudo como estava.
# Chamado por "Atualizar Servidor.bat" (precisa ser executado como administrador).

param([string]$Pacote)

$ErrorActionPreference = 'Stop'
$sistema = Split-Path $PSScriptRoot -Parent
$raiz = Split-Path $sistema -Parent
$porta = 3210
$nomeTarefa = 'Folha de Pagamento'
$carimbo = Get-Date -Format 'yyyy-MM-dd-HHmm'
$dados = Join-Path $sistema 'dados'

# Pastas e arquivos de codigo trocados na atualizacao (nunca sistema\dados, node_modules ou dist).
$codigoSistema = @('client', 'server', 'shared', 'instalacao', 'package.json', 'package-lock.json', 'vite.config.js', 'LEIA-ME.md', '.gitignore', 'versao.json')
$codigoRaiz = @('Instalar no Servidor.bat', 'Atualizar Servidor.bat')

function Etapa($texto) { Write-Host "`n  >> $texto" -ForegroundColor Cyan }
function Falhar($texto) { Write-Host "`n  ERRO: $texto`n" -ForegroundColor Red; exit 1 }

function LerVersao($pastaSistema) {
  try { return (Get-Content (Join-Path $pastaSistema 'versao.json') -Raw | ConvertFrom-Json).versao } catch { return 'desconhecida' }
}

function PararSistema {
  if (Get-ScheduledTask -TaskName $nomeTarefa -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName $nomeTarefa }
  Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
}

# Copia o codigo de uma pasta "folha de pagamento" para outra (apaga antes as pastas de codigo do destino,
# para nao sobrar arquivo velho; o que nao existe na origem tambem sai do destino).
function CopiarCodigo($origemRaiz, $destinoRaiz) {
  foreach ($item in $codigoSistema) {
    $de = Join-Path $origemRaiz "sistema\$item"
    $para = Join-Path $destinoRaiz "sistema\$item"
    if (Test-Path $para) { Remove-Item $para -Recurse -Force }
    if (-not (Test-Path $de)) { continue }
    New-Item -ItemType Directory -Force (Split-Path $para -Parent) | Out-Null
    Copy-Item $de $para -Recurse -Force
  }
  foreach ($item in $codigoRaiz) {
    $de = Join-Path $origemRaiz $item
    $para = Join-Path $destinoRaiz $item
    if (-not (Test-Path $de)) { continue }
    # O .bat que esta rodando agora so e trocado se mudou de fato.
    if ((Test-Path $para) -and (Get-FileHash $de).Hash -eq (Get-FileHash $para).Hash) { continue }
    Copy-Item $de $para -Force
  }
}

function RodarInstalador {
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $sistema 'instalacao\instalar-servidor.ps1')
  return ($LASTEXITCODE -eq 0)
}

function VersaoNoAr {
  try { return (Invoke-RestMethod "http://127.0.0.1:$porta/api/info" -TimeoutSec 3).versao } catch { return $null }
}

# ------------------------------------------------------------------ conferencias

if (Test-Path (Join-Path $sistema 'desenvolvimento')) {
  Falhar 'Este e o computador da VERSAO DE TESTES. O "Atualizar Servidor.bat" deve ser executado no servidor.'
}
if (-not (Test-Path (Join-Path $dados 'folha.db'))) {
  Falhar "Banco de dados nao encontrado em $dados. Para a primeira instalacao use o 'Instalar no Servidor.bat'."
}

Etapa 'Procurando o pacote de atualizacao'
if (-not $Pacote) {
  $candidato = @($raiz, (Join-Path $raiz 'atualizacoes')) | Where-Object { Test-Path $_ } |
    ForEach-Object { Get-ChildItem $_ -Filter 'atualizacao-*.zip' } | Sort-Object Name | Select-Object -Last 1
  if (-not $candidato) { Falhar "Nenhum arquivo atualizacao-*.zip encontrado em $raiz. Copie o pacote para esta pasta." }
  $Pacote = $candidato.FullName
}
if (-not (Test-Path $Pacote)) { Falhar "Pacote nao encontrado: $Pacote" }

$temporario = Join-Path $env:TEMP "folha-atualizacao-$carimbo"
if (Test-Path $temporario) { Remove-Item $temporario -Recurse -Force }
Expand-Archive $Pacote -DestinationPath $temporario -Force
if (-not (Test-Path (Join-Path $temporario 'sistema\server\index.js')) -or -not (Test-Path (Join-Path $temporario 'sistema\package.json'))) {
  Remove-Item $temporario -Recurse -Force
  Falhar 'Este arquivo nao e um pacote de atualizacao valido da Folha de Pagamento.'
}

$versaoAtual = LerVersao $sistema
$versaoNova = LerVersao (Join-Path $temporario 'sistema')
Write-Host "     Pacote:        $Pacote"
Write-Host "     Versao atual:  $versaoAtual"
Write-Host "     Versao nova:   $versaoNova"
Write-Host "`n  O sistema vai ficar fora do ar por alguns minutos durante a atualizacao." -ForegroundColor Yellow
$resposta = Read-Host '  Continuar? (S/N)'
if ($resposta -notmatch '^[sS]') { Remove-Item $temporario -Recurse -Force; Write-Host '  Cancelado.'; exit 0 }

# ------------------------------------------------------------------ copias de seguranca

Etapa 'Parando o sistema'
PararSistema

Etapa 'Copiando o banco de dados (antes de qualquer mudanca)'
$copiaBanco = Join-Path $dados "backups\antes-da-atualizacao-$carimbo"
New-Item -ItemType Directory -Force $copiaBanco | Out-Null
Get-ChildItem $dados -File -Filter 'folha.db*' | Copy-Item -Destination $copiaBanco -Force
Write-Host "     $copiaBanco"

Etapa 'Guardando a versao atual do sistema'
$anterior = Join-Path $raiz 'versao-anterior'
if (Test-Path $anterior) { Remove-Item $anterior -Recurse -Force }
New-Item -ItemType Directory -Force $anterior | Out-Null
CopiarCodigo $raiz $anterior
Write-Host "     $anterior"

# ------------------------------------------------------------------ atualizacao

Etapa "Instalando a versao $versaoNova"
CopiarCodigo $temporario $raiz
$ok = RodarInstalador
if ($ok -and (VersaoNoAr) -ne $versaoNova) { $ok = $false }
Remove-Item $temporario -Recurse -Force -ErrorAction SilentlyContinue

if ($ok) {
  Write-Host "`n  ATUALIZADO: o servidor esta rodando a versao $versaoNova." -ForegroundColor Green
  Write-Host '  Peca para quem estiver com o sistema aberto apertar F5 no navegador.'
  Write-Host "  Copia do banco de antes da atualizacao: $copiaBanco`n"
  exit 0
}

# ------------------------------------------------------------------ deu errado: volta tudo

Write-Host "`n  A versao nova nao funcionou. Voltando para a versao $versaoAtual..." -ForegroundColor Red
PararSistema
CopiarCodigo $anterior $raiz
Get-ChildItem $dados -File -Filter 'folha.db*' | Remove-Item -Force
Get-ChildItem $copiaBanco -File | Copy-Item -Destination $dados -Force
if (RodarInstalador) {
  Write-Host "`n  O sistema voltou para a versao $versaoAtual e esta funcionando. Nada foi perdido." -ForegroundColor Yellow
  Write-Host "  Veja o arquivo $dados\servidor.log para entender o que deu errado na versao nova.`n"
} else {
  Write-Host "`n  ATENCAO: nao foi possivel religar a versao anterior automaticamente." -ForegroundColor Red
  Write-Host "  O banco de antes da atualizacao esta guardado em: $copiaBanco"
  Write-Host "  O codigo da versao anterior esta em: $anterior`n"
}
exit 1
