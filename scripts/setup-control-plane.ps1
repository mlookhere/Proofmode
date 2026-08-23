$ErrorActionPreference = "Stop"

$repo = "mlookhere/Proofmode"
$controlTitle = "[CONTROL] ProofMode current repository state"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI (gh) is required."
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git is required."
}

gh auth status

git rev-parse --is-inside-work-tree | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Run this script from inside the ProofMode Git checkout."
}

$labels = @(
    @{ Name = "type:bug"; Color = "d73a4a"; Description = "Defect or regression" },
    @{ Name = "type:feature"; Color = "0e8a16"; Description = "New phase/module behavior" },
    @{ Name = "type:maintenance"; Color = "6f42c1"; Description = "Maintenance or repository control" },
    @{ Name = "type:release"; Color = "5319e7"; Description = "Release control Issue" },
    @{ Name = "state:ready"; Color = "bfdadc"; Description = "Ready to start" },
    @{ Name = "state:active"; Color = "fbca04"; Description = "Implementation active" },
    @{ Name = "state:blocked"; Color = "b60205"; Description = "Blocked" },
    @{ Name = "state:review"; Color = "1d76db"; Description = "Pull request review" },
    @{ Name = "state:release-ready"; Color = "0e8a16"; Description = "Integrated in dev and waiting for release" },
    @{ Name = "state:shipped"; Color = "8250df"; Description = "Released to main" },
    @{ Name = "risk:database"; Color = "b60205"; Description = "Database or migration risk" },
    @{ Name = "risk:security"; Color = "b60205"; Description = "Security or authorization risk" },
    @{ Name = "risk:deployment"; Color = "d93f0b"; Description = "Deployment or infrastructure risk" },
    @{ Name = "risk:dependencies"; Color = "d93f0b"; Description = "Dependency manifest or lockfile risk" },
    @{ Name = "risk:ci"; Color = "d93f0b"; Description = "CI or workflow-policy risk" },
    @{ Name = "risk:large-change"; Color = "d93f0b"; Description = "Change exceeds normal review-size budget" }
)

foreach ($label in $labels) {
    gh label create $label.Name --repo $repo --color $label.Color --description $label.Description 2>$null
    if ($LASTEXITCODE -ne 0) {
        gh label edit $label.Name --repo $repo --color $label.Color --description $label.Description | Out-Null
    }
}

$control = gh issue list --repo $repo --state open --limit 100 --json number,title | ConvertFrom-Json | Where-Object { $_.title -eq $controlTitle } | Select-Object -First 1
if ($control) {
    $issueId = gh issue view $control.number --repo $repo --json id --jq .id
    if ($issueId) {
        gh api graphql -f query='mutation($issue:ID!){pinIssue(input:{issueId:$issue}){issue{number}}}' -F issue=$issueId 2>$null | Out-Null
    }
}

git config core.hooksPath .githooks
if ($LASTEXITCODE -ne 0) {
    throw "Could not configure the ProofMode Git hooks path."
}

Write-Host "ProofMode control plane metadata configured."
Write-Host "Control Issue: #$($control.number)"
Write-Host "Local direct-push guard: enabled for dev and main"
Write-Host "Server-side branch policy audit: provided by GitHub Actions"
Write-Host "Native GitHub branch protection: unavailable for this private repository on the current plan; soft enforcement is active instead."
