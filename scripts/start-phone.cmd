@echo off
chcp 65001 >nul
title Liubo Hanju - Phone Access
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-phone.ps1"
if errorlevel 1 (
  echo.
  echo Start failed. Check the error above.
  pause
)
