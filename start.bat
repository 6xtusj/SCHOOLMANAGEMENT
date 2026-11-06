@echo off
setlocal
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (echo Run setup.bat first.& pause & exit /b 1)
call .venv\Scripts\activate.bat
if not exist dist\index.html (echo Frontend build missing. Run setup.bat first.& pause & exit /b 1)
echo Starting School Management System...
echo Open http://127.0.0.1:5000
echo If Flask reports "Address already in use", close the older School Management System window first.
python app.py
pause
