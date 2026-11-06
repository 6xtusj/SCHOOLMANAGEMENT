@echo off
setlocal
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (echo Run setup.bat first.& pause & exit /b 1)
if not exist dist\index.html (echo Frontend build missing. Run setup.bat first.& pause & exit /b 1)
set "SCHOOL_DB_PATH=%~dp0school_demo.db"
set "HOST=127.0.0.1"
call .venv\Scripts\activate.bat
echo Preparing the isolated demo database...
python seed_demo_data.py
if errorlevel 1 (echo Demo data setup failed.& pause & exit /b 1)
echo Starting the demo School Management System...
echo Open http://127.0.0.1:5000
echo Demo database: %SCHOOL_DB_PATH%
python app.py
pause
