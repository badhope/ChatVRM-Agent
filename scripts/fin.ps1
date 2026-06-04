# fin.ps1 — PowerShell wrapper around scripts/fin_data_tools.py
# Usage:
#   pwsh scripts/fin.ps1 excel-list --path FILE.xlsx
#   pwsh scripts/fin.ps1 report-build --uploads DIR --out DIR ...
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)][string]$Sub,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Args
)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pyScript  = Join-Path $scriptDir 'fin_data_tools.py'
$python = $null
if (Get-Command python3 -ErrorAction SilentlyContinue) { $python = 'python3' }
elseif (Get-Command py       -ErrorAction SilentlyContinue) { $python = 'py' }
elseif (Get-Command python   -ErrorAction SilentlyContinue) { $python = 'python' }
if (-not $python) { Write-Error "python not found in PATH"; exit 127 }
& $python $pyScript $Sub @Args
exit $LASTEXITCODE
