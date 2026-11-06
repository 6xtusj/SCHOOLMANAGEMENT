@echo off
setlocal
cd /d "%~dp0"
echo [1/3] Creating Python virtual environment...
if not exist .venv py -m venv .venv
call .venv\Scripts\activate.bat
if not exist .env copy .env.example .env >nul
 echo [2/3] Installing Flask backend requirements...
python -m pip install --upgrade pip
pip install -r requirements.txt
 echo [3/3] Installing original React frontend dependencies...
call npm install
if errorlevel 1 (echo npm install failed. Check your internet connection and Node.js installation.& pause & exit /b 1)
echo Building frontend...
call npm run build
if errorlevel 1 (echo Frontend build failed.& pause & exit /b 1)
echo Setup complete. Run start.bat to launch the system.
pause
