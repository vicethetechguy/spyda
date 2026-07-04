$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$envPath = Join-Path $projectDir ".env"

Set-Location $projectDir

if (-not (Test-Path $envPath)) {
  Write-Host "OpenAI API key is not set for Spyda yet." -ForegroundColor Yellow
  $apiKey = Read-Host "Paste your OpenAI API key here"
  $groqApiKey = Read-Host "Paste your Groq API key here, or press Enter to skip"

  if ([string]::IsNullOrWhiteSpace($apiKey)) {
    Write-Host "No key entered. Spyda will not start." -ForegroundColor Red
    exit 1
  }

  @"
OPENAI_API_KEY=$apiKey
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_ANALYSIS_MODEL=gpt-5.5
GROQ_API_KEY=$groqApiKey
GROQ_ANALYSIS_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
"@ | Set-Content -LiteralPath $envPath -Encoding UTF8

  Write-Host "Saved local AI keys to .env file." -ForegroundColor Green
} else {
  $envText = Get-Content -LiteralPath $envPath -Raw

  if ($envText -notmatch "(?m)^GROQ_API_KEY=") {
    Write-Host "Groq API key is optional. Add it now to enable Groq in Spyda." -ForegroundColor Yellow
    $groqApiKey = Read-Host "Paste your Groq API key here, or press Enter to skip"

    @"

GROQ_API_KEY=$groqApiKey
GROQ_ANALYSIS_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
"@ | Add-Content -LiteralPath $envPath -Encoding UTF8
  }
}

$listeners = Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue
foreach ($listener in $listeners) {
  Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
}

Write-Host "Starting Spyda..." -ForegroundColor Green
npm run dev
