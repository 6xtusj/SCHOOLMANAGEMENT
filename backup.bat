@echo off
setlocal
cd /d "%~dp0"
python backup_school.py
if errorlevel 1 (echo Backup failed.& pause & exit /b 1)
echo Backup completed. Store a copy on a separate device or secure cloud location.
pause
