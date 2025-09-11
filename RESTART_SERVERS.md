# How to Restart the Servers

If you're getting "port already in use" errors, follow these steps:

## Windows (PowerShell)

### Option 1: Kill All Node Processes
```powershell
Get-Process node | Stop-Process -Force
```

### Option 2: Kill Specific Port
```powershell
# Find process using port 3006 (React)
netstat -ano | findstr :3006
# Note the PID (last column)
taskkill /PID <PID> /F

# Find process using port 3007 (Backend)
netstat -ano | findstr :3007
# Note the PID (last column)
taskkill /PID <PID> /F
```

### Option 3: Use Different Ports
Edit the following files:
- Backend port: `src/server.ts` (change `3007` to another port)
- Frontend port: `package.json` (change `3006` in client:dev script)
- Update API URL: `client/src/config/wordpress.config.ts`

## After Killing Processes

Run the application again:
```bash
npm run dev
```

Or run servers separately:
```bash
# Terminal 1
npm run server:dev

# Terminal 2
cd client && npm start
``` 