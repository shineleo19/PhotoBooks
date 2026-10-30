// main.js
import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. Database Configuration for Target PC
// This ensures the database is saved in AppData so data isn't lost when the app closes
const dbPath = path.join(app.getPath('userData'), 'database.db');

if (!fs.existsSync(dbPath)) {
  const templatePath = app.isPackaged
    ? path.join(process.resourcesPath, 'prisma', 'dev.db')
    : path.join(__dirname, 'prisma', 'dev.db');

  if (fs.existsSync(templatePath)) {
    fs.copyFileSync(templatePath, dbPath);
  }
}

// Override Prisma's database URL before starting the server
process.env.DATABASE_URL = `file:${dbPath}`;

// 2. Start Express Backend
import './server/index.js';

let mainWindow;

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true, // Hides the top File/Edit menu
    webPreferences: {
      nodeIntegration: true,
    },
  });

  // Wait 1.5 seconds for Express to bind to Port 5000, then load the UI
  setTimeout(() => {
    mainWindow.loadURL('http://localhost:5000');
  }, 1500);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});