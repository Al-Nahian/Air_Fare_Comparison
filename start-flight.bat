@echo off
setlocal enabledelayedexpansion
title Flight Price Comparison

REM ---------------------------------------------------------------------------
REM  Starts the Flight Price Comparison tool and serves it to the local network.
REM
REM  Double-click to run. First launch installs whatever is missing (npm
REM  packages, Playwright's browser, firewall rule); later launches go straight
REM  to starting the server.
REM
REM  Runs on port 5000 so it can sit alongside the Coupon Dashboard on 8000.
REM  The firewall rule name is deliberately different from that project's --
REM  a shared name would make this script think the port was already open and
REM  skip creating a rule, which fails silently for everyone but this machine.
REM ---------------------------------------------------------------------------

cd /d "%~dp0"

REM server.js reads process.env.PORT, so this sets the app's port as well.
set "PORT=5000"
set "FWRULE=FlightCompare"

echo.
echo  ===========================================================
echo    Flight Price Comparison - starting
echo  ===========================================================
echo.

REM --- 1. Node packages ------------------------------------------------------
where node >nul 2>&1
if !errorlevel! neq 0 (
    echo.
    echo  [ERROR] Node.js is not installed or not on PATH.
    echo          Install it from https://nodejs.org and run this again.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo  [setup] Installing packages ^(first run only^)...
    call npm install
    if not exist "node_modules" (
        echo.
        echo  [ERROR] npm install failed. See the messages above.
        echo.
        pause
        exit /b 1
    )
)

REM --- 2. Playwright browser -------------------------------------------------
REM The scraper drives a real Chromium; without it every comparison fails at
REM run time rather than here, which is a confusing place to find out.
if not exist "%USERPROFILE%\AppData\Local\ms-playwright" (
    echo  [setup] Downloading the browser Playwright needs ^(first run only^)...
    call npx --yes playwright install chromium
)

REM --- 3. Firewall -----------------------------------------------------------
netsh advfirewall firewall show rule name="%FWRULE%" >nul 2>&1
if !errorlevel! neq 0 (
    echo  [setup] Opening port %PORT% for the local network...
    echo          Approve the Windows prompt to let colleagues connect.
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process netsh -Verb RunAs -Wait -ArgumentList 'advfirewall','firewall','add','rule','name=%FWRULE%','dir=in','action=allow','protocol=TCP','localport=%PORT%','profile=private,domain'" >nul 2>&1

    netsh advfirewall firewall show rule name="%FWRULE%" >nul 2>&1
    if !errorlevel! neq 0 (
        echo.
        echo  [WARNING] Firewall rule was not added -- the prompt may have been
        echo            declined. The tool still works on THIS machine, but
        echo            others on the network will not be able to reach it.
        echo            Re-run this file and approve the prompt to fix that.
        echo.
    )
)

REM --- 4. Port already in use? -----------------------------------------------
netstat -ano | findstr /r /c:"LISTENING" | findstr /c:":%PORT% " >nul 2>&1
if !errorlevel! equ 0 (
    echo.
    echo  [ERROR] Port %PORT% is already in use -- this tool may already be
    echo          running. Close the other window, or visit the address below.
    echo.
)

REM --- 5. This machine's LAN address ------------------------------------------
REM Kept on one line: a caret line-continuation inside for /f passes the carets
REM through to PowerShell verbatim and the command fails to parse.
set "LANIP="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$n = (Get-NetIPAddress -AddressFamily IPv4).Where({ $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.InterfaceAlias -notlike '*WSL*' -and $_.InterfaceAlias -notlike '*Loopback*' }); ($n | Sort-Object InterfaceMetric)[0].IPAddress"`) do set "LANIP=%%I"

REM The browser opens the shareable LAN address, not localhost, so the link in
REM the address bar is the one to send round. Falls back to localhost if the
REM address could not be worked out. The fallback text carries no angle
REM brackets: echo treats them as redirection.
if "!LANIP!"=="" (
    set "OPENURL=http://localhost:%PORT%"
    set "SHAREURL=could not detect this PC's IP address"
) else (
    set "OPENURL=http://!LANIP!:%PORT%"
    set "SHAREURL=http://!LANIP!:%PORT%"
)

echo.
echo  ===========================================================
echo    Flight Price Comparison is starting up
echo.
echo      On this computer :  http://localhost:%PORT%
echo      Share with team  :  !SHAREURL!
echo.
echo    Anyone on this network can open that address. There is no
echo    login, so only run this on a network you trust.
echo.
echo    Keep this window open. Press Ctrl+C to stop the server.
echo    After changing server or scraper code, stop and re-run this
echo    file -- a running server keeps serving the old code.
echo  ===========================================================
echo.

REM Open a browser once the server has had a moment to bind. ping is the delay
REM rather than timeout, which aborts when stdin is redirected.
start "" /b cmd /c "ping -n 5 127.0.0.1 >nul & start "" !OPENURL!"

REM call, because npm is a batch script -- without it this file would exit here.
call npm start

echo.
echo  Flight Price Comparison stopped.
pause
