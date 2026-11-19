param([switch]$Restart)
$ErrorActionPreference='Stop'
$exchangeFolder=$PSScriptRoot
$checkoutFolder=Split-Path -Parent $exchangeFolder
$listeners=Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue
if($listeners){
 if(-not $Restart){Write-Output 'Exchange is already running: http://127.0.0.1:5000/';exit 0}
 foreach($taskPid in ($listeners.OwningProcess | Select-Object -Unique)){
  $taskProcess=Get-CimInstance Win32_Process -Filter ('ProcessId='+$taskPid)
  if($taskProcess.Name -ne 'node.exe' -or $taskProcess.CommandLine -notmatch 'exchange[/\\]demo\.mjs'){throw 'Port 5000 belongs to a different application. Refusing to stop it.'}
  Stop-Process -Id $taskPid
 }
}
$runtimePath='C:/Users/bkahn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
if(-not(Test-Path -LiteralPath $runtimePath)){$runtimePath=(Get-Command node -ErrorAction Stop).Source}
$logFolder=Join-Path $exchangeFolder '.data'
New-Item -ItemType Directory -Path $logFolder -Force | Out-Null
$processInfo=Start-Process -FilePath $runtimePath -ArgumentList '--env-file-if-exists=exchange/.env exchange/demo.mjs' -WorkingDirectory $checkoutFolder -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logFolder 'server.log') -RedirectStandardError (Join-Path $logFolder 'server-error.log') -PassThru
Write-Output ('Exchange started, PID '+$processInfo.Id+': http://127.0.0.1:5000/')
