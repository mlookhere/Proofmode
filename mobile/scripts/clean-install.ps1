$ErrorActionPreference = "Stop"

Write-Host "Cleaning ProofMode mobile dependencies..." -ForegroundColor Cyan
if (Test-Path node_modules) { Remove-Item node_modules -Recurse -Force }

Write-Host "Verifying npm cache..." -ForegroundColor Cyan
npm cache verify

Write-Host "Installing the locked dependency graph..." -ForegroundColor Cyan
npm ci

Write-Host "Running Expo Doctor..." -ForegroundColor Cyan
npx expo-doctor@latest

Write-Host "Running TypeScript..." -ForegroundColor Cyan
npm run typecheck

Write-Host "Dependency refresh complete." -ForegroundColor Green
Write-Host "Start with: npm run start:clear" -ForegroundColor Green
