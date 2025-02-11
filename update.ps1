Push-Location $PSScriptRoot

git fetch upstream
git merge upstream/main
if ($? -eq $false) {
    Write-Host "Error: Unable to merge upstream/main" -ForegroundColor Red
    exit 1
}

Push-Location apps\desktop
npm run dist:win

taskkill.exe /F /IM "Bitwarden.exe" 
Start-Process ".\dist\Bitwarden Setup*.exe"

Pop-Location
Pop-Location
