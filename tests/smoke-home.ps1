param(
    [int]$StartupTimeoutSec = 30
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path $PSScriptRoot -Parent
$stdoutPath = Join-Path $repoRoot ".tmp\\smoke-home.stdout.log"
$stderrPath = Join-Path $repoRoot ".tmp\\smoke-home.stderr.log"
$worksPath = Join-Path $repoRoot "works"

New-Item -ItemType Directory -Path (Split-Path $stdoutPath) -Force | Out-Null

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
$listener.Stop()

$psi = [System.Diagnostics.ProcessStartInfo]::new()
$psi.FileName = "node"
$psi.WorkingDirectory = $repoRoot
$psi.Arguments = "server.js"
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.Environment["PORT"] = [string]$port

$process = [System.Diagnostics.Process]::new()
$process.StartInfo = $psi

try {
    [void]$process.Start()
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()

    $homeUri = "http://127.0.0.1:$port/"
    $deadline = (Get-Date).AddSeconds($StartupTimeoutSec)
    $response = $null

    while ((Get-Date) -lt $deadline) {
        if ($process.HasExited) {
            throw "sojmieblo exited before the home page became available."
        }

        try {
            $response = Invoke-WebRequest -Uri $homeUri -TimeoutSec 3
            break
        } catch {
            Start-Sleep -Milliseconds 400
        }
    }

    if ($null -eq $response) {
        throw "Timed out waiting for $homeUri"
    }

    if ($response.StatusCode -ne 200) {
        throw "Smoke endpoint returned unexpected status: $($response.StatusCode)"
    }

    if ($response.Content -notmatch "Sojmieblo|<!DOCTYPE html>|<html") {
        throw "Smoke response did not look like the main HTML page."
    }

    Write-Host "Smoke PASS: GET / -> $($response.StatusCode)"
} finally {
    if ($process -and -not $process.HasExited) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        $null = $process.WaitForExit(5000)
    }

    if ($stdoutTask) {
        $stdoutTask.GetAwaiter().GetResult() | Set-Content -Path $stdoutPath -Encoding UTF8
    }

    if ($stderrTask) {
        $stderrTask.GetAwaiter().GetResult() | Set-Content -Path $stderrPath -Encoding UTF8
    }

    if (Test-Path $worksPath) {
        Remove-Item $worksPath -Recurse -Force -ErrorAction SilentlyContinue
    }
}
