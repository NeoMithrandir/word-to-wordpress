# Troubleshooting Network Errors

## Problem: "Network Error" when uploading documents

This error occurs when the backend server is not running or cannot be reached.

## Quick Fix

### Option 1: Use the Batch Script (Windows)
```bash
# Double-click or run in terminal:
start-servers.bat
```
This will open two new command windows for the backend and frontend servers.

### Option 2: Manual Start

1. **Open TWO terminal windows**

2. **Terminal 1 - Start Backend Server:**
```bash
cd C:\GitHub\word-to-wordpress
npm run server:dev
```
Wait for: `Server running on port 3007`

3. **Terminal 2 - Start Frontend Server:**
```bash
cd C:\GitHub\word-to-wordpress
npm run client:dev
```
Wait for: `Compiled successfully!`

4. **Open browser to:** http://localhost:3006

## Common Issues and Solutions

### 1. Dependencies Not Installed
```bash
# Install all dependencies
npm run install:all
```

### 2. Port Already in Use
If you see "EADDRINUSE" error:
```powershell
# Kill all Node processes
taskkill /F /IM node.exe

# Or kill specific port (PowerShell as Admin)
netstat -ano | findstr :3007
taskkill /F /PID <PID_NUMBER>
```

### 3. TypeScript Compilation Errors
```bash
# Clear and rebuild
rm -rf dist
npm run server:build
```

### 4. Frontend Not Loading
- Check that backend is running on port 3007
- Check that frontend is running on port 3006
- Clear browser cache (Ctrl+Shift+Delete)
- Try incognito/private browsing mode

### 5. CORS Errors
The backend should have CORS enabled. If you still see CORS errors:
1. Check that you're accessing via http://localhost:3006 (not 127.0.0.1)
2. Ensure no browser extensions are blocking requests

## Verify Servers Are Running

### Check Backend:
```bash
curl http://localhost:3007/api/health
# Should return: {"status":"ok","message":"Word to WordPress API is running"}
```

### Check Frontend:
Open http://localhost:3006 in your browser

### Check Ports:
```powershell
netstat -an | findstr "3006 3007"
```

## Development Server Commands

### Start Both Servers (Recommended):
```bash
npm run dev
```

### Start Individually:
```bash
# Backend only
npm run server:dev

# Frontend only
npm run client:dev
```

### Production Build:
```bash
npm run build
npm start
```

## Still Having Issues?

1. **Check Node Version:**
   ```bash
   node --version  # Should be 14.x or higher
   npm --version   # Should be 6.x or higher
   ```

2. **Clean Install:**
   ```bash
   # Remove node_modules and reinstall
   rm -rf node_modules client/node_modules
   npm run install:all
   ```

3. **Check Firewall:**
   - Windows Defender may block Node.js
   - Allow Node.js through firewall
   - Temporarily disable firewall to test

4. **Check Antivirus:**
   - Some antivirus software blocks local servers
   - Add exception for Node.js and the project folder

## Server Logs Location

- Backend logs: Console output in terminal running `npm run server:dev`
- Frontend logs: Browser Developer Console (F12)
- Check for any error messages in red

## Emergency Fallback

If servers won't start at all, you can still:
1. Use the "Save as HTML" feature (once servers are running)
2. The HTML files are saved in the `saved-posts` folder
3. These can be opened directly in a browser without any server







