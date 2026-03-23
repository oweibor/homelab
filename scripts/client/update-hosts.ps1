<#
.SYNOPSIS
    Automatically adds oweibo domains to the Windows hosts file.
    Usage: .\update-hosts.ps1 -ServerIp "192.168.1.100"
#>

param (
    [Parameter(Mandatory=$true)]
    [string]$ServerIp
)

$HostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
$Domains = @(
    "openclaw.oweibo.local",
    "kilo.oweibo.local"
)

# Check for Administrator privileges
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Please run this script as an Administrator!"
    exit 1
}

$NewEntries = "`n# --- Oweibo Domains Start ---`n"
$AddedCount = 0

foreach ($Domain in $Domains) {
    if (Select-String -Path $HostsPath -Pattern "$Domain" -Quiet) {
        Write-Host "Skipping $Domain (already exists)" -ForegroundColor Yellow
    } else {
        $NewEntries += "$ServerIp $Domain`n"
        Write-Host "Adding $Domain -> $ServerIp" -ForegroundColor Green
        $AddedCount++
    }
}

$NewEntries += "# --- Oweibo Domains End ---"

if ($AddedCount -gt 0) {
    Add-Content -Path $HostsPath -Value $NewEntries -Encoding ASCII
    Write-Host "`nSuccessfully added $AddedCount domains to $HostsPath" -ForegroundColor Cyan
} else {
    Write-Host "`nAll domains already present in $HostsPath" -ForegroundColor DarkCyan
}

Write-Host "You can now access your services at https://traefik.oweibo.local etc." -ForegroundColor White
