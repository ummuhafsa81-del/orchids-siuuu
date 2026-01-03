@echo off
echo ========================================
echo  Nova Agent - Building EXE
echo ========================================
echo.

:: Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed!
    echo Please install Python from https://python.org
    pause
    exit /b 1
)

:: Install required packages
echo Installing dependencies...
pip install pyinstaller pyperclip >nul 2>&1

:: Build the EXE
echo Building nova-agent.exe...
pyinstaller --onefile --windowed --name "NovaAgent" --icon=NONE nova-agent.py

echo.
echo ========================================
echo  BUILD COMPLETE!
echo  Your EXE is at: dist\NovaAgent.exe
echo ========================================
pause
