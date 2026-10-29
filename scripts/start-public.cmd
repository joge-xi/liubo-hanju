@echo off
chcp 65001 >nul
title Liubo Hanju - Public Link
node "%~dp0start-public.mjs" %*
if errorlevel 1 (
  echo.
  echo Start failed. Check the error above.
  pause
)
