# PowerShell wrapper for word_process.py
#
# Usage:
#   pwsh scripts/word.ps1 <op> [args...]
#
# Examples:
#   pwsh scripts/word.ps1 create --output out.docx --title "Hi" --content "Hello"
#   pwsh scripts/word.ps1 read ./out.docx
#   pwsh scripts/word.ps1 info ./out.docx
#   pwsh scripts/word.ps1 search ./out.docx --query "Hello"
#   pwsh scripts/word.ps1 replace ./out.docx --find "old" --replace-with "new"
#   pwsh scripts/word.ps1 append ./out.docx --heading "New" --text "more text"
#   pwsh scripts/word.ps1 to-text ./out.docx --output out.txt
#
# Exits with the python script's exit code. Output is the raw JSON payload.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Op,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pyScript  = Join-Path $scriptDir 'word_process.py'

if (-not (Test-Path $pyScript)) {
    Write-Error "Python script not found: $pyScript"
    exit 2
}

# On Windows, prefer `py`; on Linux/macOS use `python3`.
$python = (Get-Command python3 -ErrorAction SilentlyContinue) `
    ? 'python3' `
    : (Get-Command py -ErrorAction SilentlyContinue) `
        ? 'py' `
        : $null

if (-not $python) {
    Write-Error "Neither python3 nor py is on PATH. Install Python 3 first."
    exit 3
}

& $python $pyScript $Op @Args
exit $LASTEXITCODE
