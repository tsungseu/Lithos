@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "%~dp0runtime\python.exe" (
  echo 缺少内置运行时。请先完整解压便携包，不要在压缩包内直接启动。
  pause
  exit /b 1
)
"%~dp0runtime\python.exe" "%~dp0launcher.py"
if errorlevel 1 pause
