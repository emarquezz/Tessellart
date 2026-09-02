@echo off
rem SPDX-License-Identifier: GPL-3.0-only
cd /d "%~dp0"
echo tessellart
echo Opening http://localhost:8006
start "" "http://localhost:8006"
echo The local server keeps running until you press Control-C.
py -m http.server 8006
