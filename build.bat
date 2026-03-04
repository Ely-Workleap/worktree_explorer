@echo off
setlocal enabledelayedexpansion
title Worktree Explorer

:: ─── MSVC Environment ───────────────────────────────────────────────
set "MSVC_DIR=C:\Program Files\Microsoft Visual Studio\18\Professional\VC\Tools\MSVC\14.50.35717"
set "SDK_DIR=C:\Program Files\Microsoft Visual Studio\18\Professional\SDK\ScopeCppSDK\vc15\SDK"
set "VC_INC_DIR=C:\Program Files\Microsoft Visual Studio\18\Professional\SDK\ScopeCppSDK\vc15\VC\include"
set "RC_DIR=C:\Program Files\Microsoft Visual Studio\18\Professional\SDK\ScopeCppSDK\vc15\SDK\bin"

set "PATH=%MSVC_DIR%\bin\Hostx64\x64;%RC_DIR%;%USERPROFILE%\.cargo\bin;%PATH%"
set "LIB=%SDK_DIR%\lib;%MSVC_DIR%\lib\onecore\x64"
set "INCLUDE=%VC_INC_DIR%;%SDK_DIR%\include\ucrt;%SDK_DIR%\include\um;%SDK_DIR%\include\shared"

cd /d "%~dp0"

:: ─── Verify toolchain ───────────────────────────────────────────────
where cl.exe >nul 2>&1 || (
    echo [ERROR] cl.exe not found. Check MSVC_DIR path in build.bat
    exit /b 1
)
where cargo >nul 2>&1 || (
    echo [ERROR] cargo not found. Install Rust from https://rustup.rs
    exit /b 1
)
where node >nul 2>&1 || (
    echo [ERROR] node not found. Install Node.js
    exit /b 1
)

:: ─── Parse command ──────────────────────────────────────────────────
if "%~1"=="" goto :help
if /i "%~1"=="dev"    goto :dev
if /i "%~1"=="build"  goto :build
if /i "%~1"=="check"  goto :check
if /i "%~1"=="tsc"    goto :tsc
if /i "%~1"=="clean"  goto :clean
if /i "%~1"=="help"   goto :help
if /i "%~1"=="-h"     goto :help
if /i "%~1"=="--help" goto :help

echo [ERROR] Unknown command: %~1
goto :help

:: ─── Commands ───────────────────────────────────────────────────────
:dev
echo [dev] Starting Tauri dev server...
npm run tauri -- dev
exit /b %ERRORLEVEL%

:build
echo [build] Building release + NSIS installer...
npm run tauri -- build
if %ERRORLEVEL% neq 0 (
    echo [build] FAILED
    exit /b %ERRORLEVEL%
)
echo.
echo [build] Done! Installer at:
for %%f in (src-tauri\target\release\bundle\nsis\*.exe) do echo   %%f
exit /b 0

:check
echo [check] Running cargo check...
cd /d "%~dp0src-tauri"
cargo check 2>&1
set EC=%ERRORLEVEL%
cd /d "%~dp0"
if %EC% equ 0 (
    echo [check] OK
) else (
    echo [check] FAILED
)
exit /b %EC%

:tsc
echo [tsc] Running TypeScript check...
npx tsc --noEmit
if %ERRORLEVEL% equ 0 (
    echo [tsc] OK
) else (
    echo [tsc] FAILED
)
exit /b %ERRORLEVEL%

:clean
echo [clean] Removing build artifacts...
if exist src-tauri\target rmdir /s /q src-tauri\target
if exist dist rmdir /s /q dist
echo [clean] Done
exit /b 0

:help
echo.
echo  Worktree Explorer Build Tool
echo  ────────────────────────────
echo.
echo  Usage: build.bat ^<command^>
echo.
echo  Commands:
echo    dev      Start Tauri dev server with hot reload
echo    build    Build release binary + NSIS installer
echo    check    Run cargo check (Rust only)
echo    tsc      Run TypeScript type check
echo    clean    Remove build artifacts (target/ + dist/)
echo    help     Show this help
echo.
exit /b 0
