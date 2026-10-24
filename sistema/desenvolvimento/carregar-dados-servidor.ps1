# Coloca na versao de testes uma copia do banco baixada do servidor
# (no sistema do servidor: Copias de seguranca > Baixar copia).
# Pega o arquivo folha-de-pagamento-*.db mais recente da pasta Downloads.
# O banco de testes atual e guardado antes em dados\backups\testes-antes-de-carregar-...
# Chamado por "Carregar Dados do Servidor.bat" no computador de testes.

$ErrorActionPreference = 'Stop'
$sistema = Split-Path $PSScriptRoot -Parent
$dados = Join-Path $sistema 'dados'

function Falhar($texto) { Write-Host "`n  ERRO: $texto`n" -ForegroundColor Red; exit 1 }

$downloads = (New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path
if (-not $downloads) { $downloads = Join-Path $env:USERPROFILE 'Downloads' }
$arquivo = Get-ChildItem $downloads -Filter 'folha-de-pagamento-*.db' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime | Select-Object -Last 1
if (-not $arquivo) {
  Falhar "Nenhuma copia encontrada em $downloads. No sistema do SERVIDOR, va em 'Copias de seguranca' > 'Baixar copia' e rode este arquivo de novo."
}

$cabecalho = New-Object byte[] 16
$leitor = [IO.File]::OpenRead($arquivo.FullName)
try { [void]$leitor.Read($cabecalho, 0, 16) } finally { $leitor.Close() }
if ([Text.Encoding]::ASCII.GetString($cabecalho, 0, 15) -ne 'SQLite format 3') { Falhar "$($arquivo.Name) nao e uma copia valida do banco." }

Write-Host "`n  Copia encontrada: $($arquivo.Name)  (baixada em $($arquivo.LastWriteTime.ToString('dd/MM/yyyy HH:mm')))"
Write-Host '  Os dados atuais da VERSAO DE TESTES serao substituidos por esta copia do servidor.' -ForegroundColor Yellow
Write-Host '  (O banco do servidor nao e alterado.)'
$resposta = Read-Host '  Continuar? (S/N)'
if ($resposta -notmatch '^[sS]') { Write-Host '  Cancelado.'; exit 0 }

# O banco nao pode ser trocado com o sistema ligado.
& (Join-Path $PSScriptRoot 'versao-testes.ps1') fechar
if ($LASTEXITCODE -ne 0) { Falhar 'Nao foi possivel desligar a versao de testes.' }

$guarda = Join-Path $dados ("backups\testes-antes-de-carregar-" + (Get-Date -Format 'yyyy-MM-dd-HHmm'))
New-Item -ItemType Directory -Force $guarda | Out-Null
Get-ChildItem $dados -File -Filter 'folha.db*' | Move-Item -Destination $guarda -Force
Copy-Item $arquivo.FullName (Join-Path $dados 'folha.db')

Write-Host "`n  Pronto! A versao de testes agora tem os dados do servidor de $($arquivo.LastWriteTime.ToString('dd/MM/yyyy'))." -ForegroundColor Green
Write-Host '  Abra com "Abrir Versao de Testes.bat" e use a mesma senha do servidor.'
Write-Host "  O banco de testes anterior ficou guardado em: $guarda`n"
