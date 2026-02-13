@echo off
set "MSVC_DIR=C:\Program Files\Microsoft Visual Studio\18\Professional\VC\Tools\MSVC\14.50.35717"
set "SDK_DIR=C:\Program Files\Microsoft Visual Studio\18\Professional\SDK\ScopeCppSDK\vc15\SDK"
set "VC_INC_DIR=C:\Program Files\Microsoft Visual Studio\18\Professional\SDK\ScopeCppSDK\vc15\VC\include"
set "RC_DIR=C:\Program Files\Microsoft Visual Studio\18\Professional\SDK\ScopeCppSDK\vc15\SDK\bin"

set "PATH=%MSVC_DIR%\bin\Hostx64\x64;%RC_DIR%;%USERPROFILE%\.cargo\bin;%PATH%"
set "LIB=%SDK_DIR%\lib;%MSVC_DIR%\lib\onecore\x64"
set "INCLUDE=%VC_INC_DIR%;%SDK_DIR%\include\ucrt;%SDK_DIR%\include\um;%SDK_DIR%\include\shared"

cd /d "%~dp0"
npm run tauri -- %*
