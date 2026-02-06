@echo off
echo Starting Word to WordPress servers...
echo.
echo Starting backend server on port 3007...
start cmd /k "cd /d %cd% && npm run server:dev"
timeout /t 3 > nul
echo.
echo Starting frontend server on port 3006...
start cmd /k "cd /d %cd%\client && npm start"
echo.
echo Servers are starting in separate windows.
echo Backend: http://localhost:3007
echo Frontend: http://localhost:3006
echo.
echo If you see errors, make sure to run 'npm install' first.
pause







