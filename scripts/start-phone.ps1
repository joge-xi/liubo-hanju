param(
  [int]$Port = 4173
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

# On this machine Windows Firewall allows the DSH Python runtime inbound,
# while node.exe is explicitly blocked on the Public profile.
$dshPython = Join-Path $env:USERPROFILE '.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'

if (Test-Path -LiteralPath $dshPython) {
  Write-Host 'Starting with the firewall-approved Python runtime...' -ForegroundColor DarkYellow
  & $dshPython (Join-Path $PSScriptRoot 'serve_lan.py') --port $Port
  exit $LASTEXITCODE
}

$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
  Write-Host 'DSH Python not found; falling back to Node.js.' -ForegroundColor DarkYellow
  Write-Host 'If the phone cannot connect, allow Node.js inbound in Windows Firewall.' -ForegroundColor DarkYellow
  & $node.Source (Join-Path $PSScriptRoot 'serve.mjs') --port $Port --host 0.0.0.0
  exit $LASTEXITCODE
}

Write-Error 'No usable Python or Node.js was found.'
exit 1
