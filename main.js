// main.js
import { app, BrowserWindow, dialog, session } from 'electron';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isScheduledDriveExport = process.argv.includes('--scheduled-drive-exports');
if (isScheduledDriveExport) {
  process.env.RUN_SCHEDULED_DRIVE_EXPORTS = '1';
}

if (app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), 'BusinessOS POS Clean'));
}
const configDir = app.isPackaged ? path.dirname(process.execPath) : __dirname;
dotenv.config({ path: path.join(configDir, '.env') });

// 1. Database Configuration for Target PC
const dataDir = app.getPath('userData');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const dbPath = path.join(dataDir, 'database.db');

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
process.env.DB_PATH = dbPath;
process.env.DATA_DIR = dataDir;
process.env.APP_CONFIG_DIR = configDir;

const schedulerLogPath = path.join(dataDir, 'scheduled-drive-exports.log');
const logSchedulerEvent = (message) => {
  try {
    fs.appendFileSync(schedulerLogPath, `${new Date().toISOString()} ${message}\n`);
  } catch (error) {
    console.error('Unable to write the scheduled export log:', error);
  }
};

const quotePowerShellString = (value) => `'${String(value).replace(/'/g, "''")}'`;
const registerDailyDriveExportTask = async () => {
  const taskName = 'BusinessOS POS Daily Drive Exports';
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$action = New-ScheduledTaskAction -Execute ${quotePowerShellString(process.execPath)} -Argument '--scheduled-drive-exports' -WorkingDirectory ${quotePowerShellString(configDir)}`,
    "$trigger = New-ScheduledTaskTrigger -Daily -At ([datetime]::Today.AddHours(18))",
    "$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew",
    "$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited",
    `Register-ScheduledTask -TaskName ${quotePowerShellString(taskName)} -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null`,
  ].join('\n');
  const encodedScript = Buffer.from(script, 'utf16le').toString('base64');

  await new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedScript],
      { windowsHide: true },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }
        resolve();
      }
    );
  });
};

let dailyTaskRegistrationError = null;
if (app.isPackaged && process.platform === 'win32' && !isScheduledDriveExport) {
  try {
    await registerDailyDriveExportTask();
    process.env.EXTERNAL_DAILY_EXPORT_SCHEDULER = '1';
    logSchedulerEvent('Registered daily Drive export task for 6:00 PM.');
  } catch (error) {
    process.env.EXTERNAL_DAILY_EXPORT_SCHEDULER = '0';
    dailyTaskRegistrationError = error;
    logSchedulerEvent(`Unable to register the 6 PM task: ${error.message}`);
  }
}

// 2. Start Express Backend (or run scheduled export)
await import('./server/index.js');

if (isScheduledDriveExport) {
  if (process.exitCode && process.exitCode !== 0) {
    logSchedulerEvent(
      `Scheduled 6:00 PM Google Drive export finished with errors (exitCode=${process.exitCode}).`
    );
  } else {
    logSchedulerEvent('Completed scheduled 6:00 PM Google Drive export successfully.');
  }
  app.whenReady().then(() => app.quit());
} else {
  let mainWindow;

  app.whenReady().then(async () => {
    // Always clear Chromium HTTP cache so UI updates show up immediately
    await session.defaultSession.clearCache();

    mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      autoHideMenuBar: true,
      icon: path.join(__dirname, 'build', 'icon.ico'),
      webPreferences: {
        nodeIntegration: true,
        plugins: true,
      },
    });

    // Wait 1.5 seconds for Express to bind to Port 5000, then load the UI
    setTimeout(() => {
      mainWindow.loadURL('http://localhost:5000');
    }, 1500);

    if (dailyTaskRegistrationError) {
      mainWindow.webContents.once('did-finish-load', () => {
        dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: 'Daily Drive exports could not be scheduled',
          message: 'The 6 PM customer balance and database uploads will only run while the app is open.',
          detail: `${dailyTaskRegistrationError.message}\n\nSee ${schedulerLogPath} for details.`,
        });
      });
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}