@echo off
REM Run both backend and client dev servers (word-to-wordpress)
cd /d "%~dp0"

echo ========================================
echo word-to-wordpress - Starting both servers
echo ========================================
echo.
echo Backend:  nodemon + ts-node (src/server.ts)
echo Client:   Vite dev server (PORT=3006)
echo.
echo Press Ctrl+C to stop both.
echo ========================================
echo.

npm run dev

pause
