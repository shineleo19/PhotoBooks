// server/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import pino from 'pino';
import { google } from 'googleapis';
import * as baileys from '@whiskeysockets/baileys';

process.on('uncaughtException', (err) => {
  console.error('Unhandled Exception trapped:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection trapped:', reason);
});

const makeWASocket = baileys.default?.default || baileys.default || baileys.makeWASocket;
const {
  useMultiFileAuthState: getMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = baileys;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isPackaged = process.resourcesPath && !process.resourcesPath.includes('node_modules');

// 1. Database & Persistent Storage Setup
const dataDir =
  process.env.DATA_DIR || (isPackaged ? process.resourcesPath : path.join(__dirname, '../prisma'));
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 2. Permanent PDF Invoice Archive Folder
const archiveDir = process.env.INVOICE_ARCHIVE_DIR || path.join(dataDir, 'invoices_archive');
if (!fs.existsSync(archiveDir)) {
  fs.mkdirSync(archiveDir, { recursive: true });
}

const googleDriveDateFolder = (date = new Date()) => {
  const parsedDate = String(date).match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (parsedDate) {
    return `${parsedDate[1].padStart(2, '0')}-${parsedDate[2].padStart(2, '0')}-${parsedDate[3]}`;
  }

  const currentDate = date instanceof Date ? date : new Date();
  return `${String(currentDate.getDate()).padStart(2, '0')}-${String(
    currentDate.getMonth() + 1
  ).padStart(2, '0')}-${currentDate.getFullYear()}`;
};

const escapeDriveQueryValue = (value) => String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const getOrCreateDriveFolder = async (drive, name, parentId) => {
  const parentQuery = parentId ? `'${escapeDriveQueryValue(parentId)}' in parents` : "'root' in parents";
  const listResponse = await drive.files.list({
    q: `name = '${escapeDriveQueryValue(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and ${parentQuery}`,
    fields: 'files(id, name)',
    spaces: 'drive',
    pageSize: 1,
  });

  if (listResponse.data.files?.[0]) return listResponse.data.files[0].id;

  const createResponse = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    },
    fields: 'id',
  });

  if (!createResponse.data.id) {
    throw new Error(`Google Drive did not return an ID for folder "${name}".`);
  }
  return createResponse.data.id;
};

const uploadPdfToGoogleDrive = async (pdfPath, invoiceNo, billDate) => {
  const credentialsFile = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  if (!credentialsFile) {
    console.warn(
      'Google Drive upload skipped: set GOOGLE_SERVICE_ACCOUNT_FILE to enable automatic uploads.'
    );
    return null;
  }

  const credentialsPath = path.isAbsolute(credentialsFile)
    ? credentialsFile
    : path.resolve(process.cwd(), credentialsFile);
  if (!fs.existsSync(credentialsPath)) {
    throw new Error(`Google service-account file was not found: ${credentialsPath}`);
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  const drive = google.drive({ version: 'v3', auth });
  const parentId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID || '';
  if (!parentId) {
    throw new Error(
      'GOOGLE_DRIVE_PARENT_FOLDER_ID is required so uploads target the intended main Drive folder.'
    );
  }
  const parentFolderId = parentId;
  const dateFolderId = await getOrCreateDriveFolder(
    drive,
    googleDriveDateFolder(billDate),
    parentFolderId
  );
  const uploadResponse = await drive.files.create({
    requestBody: {
      name: `${invoiceNo}.pdf`,
      parents: [dateFolderId],
    },
    media: {
      mimeType: 'application/pdf',
      body: fs.createReadStream(pdfPath),
    },
    fields: 'id, webViewLink',
  });

  return uploadResponse.data.webViewLink || uploadResponse.data.id || null;
};

const dbPath = path.join(dataDir, 'dev.db');
const db = new Database(dbPath);

// Ensure Item, Sale, and Customer tables exist
db.exec(`
  CREATE TABLE IF NOT EXISTS Item (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sku TEXT UNIQUE NOT NULL,
    category TEXT DEFAULT 'General',
    price REAL NOT NULL,
    stock INTEGER NOT NULL,
    minStock INTEGER DEFAULT 5,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS Sale (
    id TEXT PRIMARY KEY,
    invoiceNo TEXT UNIQUE NOT NULL,
    customerName TEXT DEFAULT 'Walk-in',
    customerPlace TEXT DEFAULT '',
    customerPhone TEXT NOT NULL,
    subtotal REAL DEFAULT 0,
    total REAL NOT NULL,
    paidAmount REAL DEFAULT 0,
    balanceAmount REAL DEFAULT 0,
    cgst REAL NOT NULL,
    sgst REAL NOT NULL,
    itemsJson TEXT DEFAULT '[]',
    pdfPath TEXT DEFAULT '',
    synced BOOLEAN DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS Customer (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    place TEXT DEFAULT '',
    phone TEXT UNIQUE NOT NULL,
    totalBilled REAL DEFAULT 0,
    totalPaid REAL DEFAULT 0,
    balance REAL DEFAULT 0,
    lastInvoiceNo TEXT DEFAULT '',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

try { db.exec(`ALTER TABLE Sale ADD COLUMN customerPlace TEXT DEFAULT '';`); } catch {}
try { db.exec(`ALTER TABLE Sale ADD COLUMN subtotal REAL DEFAULT 0;`); } catch {}
try { db.exec(`ALTER TABLE Sale ADD COLUMN paidAmount REAL DEFAULT 0;`); } catch {}
try { db.exec(`ALTER TABLE Sale ADD COLUMN balanceAmount REAL DEFAULT 0;`); } catch {}
try { db.exec(`ALTER TABLE Sale ADD COLUMN itemsJson TEXT DEFAULT '[]';`); } catch {}
try { db.exec(`ALTER TABLE Sale ADD COLUMN pdfPath TEXT DEFAULT '';`); } catch {}
try { db.exec(`ALTER TABLE Customer ADD COLUMN place TEXT DEFAULT '';`); } catch {}

// Remove old hardcoded demo items if they were seeded earlier
try {
  db.exec(`
    DELETE FROM Item
    WHERE sku IN ('PPR-A3G', 'SHT-1236', 'TPE-RED50', 'GUM-SYN05', 'INK-6C01', 'PAD-ACR01');
  `);
} catch {}

// Helper to recalculate & sync a customer's totals from the Sale table
function syncCustomerRecord(customerName, customerPlace = '', customerPhone = '', lastInvoiceNo = '') {
  let cleanPhone = String(customerPhone || '').replace(/\D/g, '');
  if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;
  if (!cleanPhone) cleanPhone = 'N/A';

  const lookupKey =
    cleanPhone !== 'N/A' ? cleanPhone : `NAME:${customerName.trim().toLowerCase()}`;

  const totals = db
    .prepare(
      `
    SELECT
      COALESCE(SUM(total), 0) as totalBilled,
      COALESCE(SUM(paidAmount), 0) as totalPaid,
      COALESCE(SUM(balanceAmount), 0) as balance
    FROM Sale
    WHERE customerPhone = ? OR (customerPhone = 'N/A' AND LOWER(customerName) = LOWER(?))
  `
    )
    .get(cleanPhone, customerName.trim());

  const existing = db.prepare(`SELECT * FROM Customer WHERE phone = ?`).get(lookupKey);

  if (existing) {
    db.prepare(
      `
      UPDATE Customer
      SET name = ?,
          place = CASE WHEN ? != '' THEN ? ELSE place END,
          totalBilled = ?,
          totalPaid = ?,
          balance = ?,
          lastInvoiceNo = CASE WHEN ? != '' THEN ? ELSE lastInvoiceNo END,
          updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `
    ).run(
      customerName.trim() || existing.name,
      customerPlace.trim(),
      customerPlace.trim(),
      totals.totalBilled,
      totals.totalPaid,
      totals.balance,
      lastInvoiceNo,
      lastInvoiceNo,
      existing.id
    );
  } else {
    db.prepare(
      `
      INSERT INTO Customer (id, name, place, phone, totalBilled, totalPaid, balance, lastInvoiceNo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      randomUUID(),
      customerName.trim() || 'Walk-in Customer',
      customerPlace.trim(),
      lookupKey,
      totals.totalBilled,
      totals.totalPaid,
      totals.balance,
      lastInvoiceNo
    );
  }
}

// --- WHATSAPP AUTOMATION ENGINE (BAILEYS) ---
let sock = null;
let isWaConnected = false;
let latestWaQr = null;
const waAuthDir = path.join(dataDir, 'whatsapp_auth_session');

async function connectToWhatsApp() {
  try {
    const { state, saveCreds } = await getMultiFileAuthState(waAuthDir);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        latestWaQr = await QRCode.toDataURL(qr);
        isWaConnected = false;
      }

      if (connection === 'open') {
        isWaConnected = true;
        latestWaQr = null;
        console.log('WhatsApp connected and ready for automatic PDF dispatch!');
      }

      if (connection === 'close') {
        isWaConnected = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) {
          setTimeout(connectToWhatsApp, 3000);
        } else {
          fs.rmSync(waAuthDir, { recursive: true, force: true });
          setTimeout(connectToWhatsApp, 2000);
        }
      }
    });
  } catch (err) {
    console.error('WhatsApp init error:', err.message);
  }
}
connectToWhatsApp();

// Convert Number to Indian Rupees Words
function numToWords(price) {
  const sglDigit = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const dblDigit = [
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const tensPlace = [
    '',
    'Ten',
    'Twenty',
    'Thirty',
    'Forty',
    'Fifty',
    'Sixty',
    'Seventy',
    'Eighty',
    'Ninety',
  ];
  const handleTens = (d, n) =>
    d !== 0 ? (d === 1 ? dblDigit[n] : tensPlace[d] + (n !== 0 ? ' ' + sglDigit[n] : '')) : n !== 0 ? sglDigit[n] : '';

  let num = Math.round(Number(price) || 0);
  if (num === 0) return 'Zero Rupees only';
  let word = '';
  if (Math.floor(num / 10000000) > 0) {
    word +=
      handleTens(Math.floor(num / 100000000), Math.floor((num % 100000000) / 10000000)) + ' Crore ';
    num %= 10000000;
  }
  if (Math.floor(num / 100000) > 0) {
    word += handleTens(Math.floor(num / 1000000), Math.floor((num % 1000000) / 100000)) + ' Lakh ';
    num %= 100000;
  }
  if (Math.floor(num / 1000) > 0) {
    word += handleTens(Math.floor(num / 10000), Math.floor((num % 10000) / 1000)) + ' Thousand ';
    num %= 1000;
  }
  if (Math.floor(num / 100) > 0) {
    word += sglDigit[Math.floor(num / 100)] + ' Hundred ';
    num %= 100;
  }
  if (num > 0) {
    word += handleTens(Math.floor(num / 10), num % 10);
  }
  return word.trim() + ' Rupees only';
}

// Helper: Draw Estimate PDF with Automatic 18% GST Columns & Summary Box
function buildInvoicePdfBuffer(bill, qrBuffer) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 30 });
      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // --- HEADER ---
      const possibleLogos = [
        path.join(__dirname, 'logo.png'),
        path.join(__dirname, 'logo.jpg'),
        path.join(__dirname, '../public/logo.png'),
        path.join(__dirname, '../public/logo.jpg'),
      ];
      let logoRendered = false;
      for (const p of possibleLogos) {
        if (fs.existsSync(p)) {
          try {
            doc.image(p, 30, 28, { width: 65 });
            logoRendered = true;
            break;
          } catch (err) {
            console.warn('Skipping incompatible logo file:', p, err.message);
          }
        }
      }
      if (!logoRendered) {
        doc.font('Helvetica-Bold').fontSize(14).text(bill.storeName, 30, 35);
      }

      doc.font('Helvetica-Bold').fontSize(14).text('Estimate', 0, 35, { align: 'center' });

      doc
        .font('Helvetica-Bold')
        .fontSize(13)
        .text(bill.storeName, 300, 30, { align: 'right', width: 265 });
      doc
        .font('Helvetica')
        .fontSize(8)
        .text(bill.storeAddress, 300, 48, { align: 'right', width: 265 });
      doc.text(`Phone no.: ${bill.storePhone}`, 300, 70, { align: 'right', width: 265 });
      doc.text(`GSTIN: ${bill.storeGstin}, State: 33-Tamil Nadu`, 300, 82, {
        align: 'right',
        width: 265,
      });

      // --- INFO BOXES ---
      const boxY = 105;
      doc.lineWidth(0.5);

      const displayCustomerTitle = bill.customerPlace
        ? `${bill.customerName} (${bill.customerPlace})`
        : bill.customerName;

      doc.rect(30, boxY, 267, 14).fillAndStroke('#e5e7eb', '#000');
      doc.fillColor('#000').font('Helvetica-Bold').fontSize(8).text('Estimate For', 35, boxY + 4);
      doc.rect(30, boxY, 267, 52).stroke();
      doc.font('Helvetica-Bold').fontSize(9).text(displayCustomerTitle, 35, boxY + 20);
      if (bill.customerPhone && bill.customerPhone !== 'N/A') {
        doc.font('Helvetica').fontSize(8).text(`+${bill.customerPhone}`, 35, boxY + 34);
      }

      doc.rect(297, boxY, 268, 14).fillAndStroke('#e5e7eb', '#000');
      doc
        .fillColor('#000')
        .font('Helvetica-Bold')
        .fontSize(8)
        .text('Estimate Details', 302, boxY + 4);
      doc.rect(297, boxY, 268, 52).stroke();
      doc.font('Helvetica').fontSize(9).text(`Estimate No.: ${bill.invoiceNo}`, 302, boxY + 20);
      doc.text(`Date: ${bill.date}`, 302, boxY + 34);

      // --- TABLE HEADER ---
      // Columns: # | Name of the product | Qty | Amount of the product | GST (18%) | Amount + GST
      const thY = 165;
      doc.rect(30, thY, 535, 18).fillAndStroke('#6b7280', '#000');

      const cols = [
        { x: 30, w: 22, label: '#' },
        { x: 52, w: 183, label: 'Name of the product' },
        { x: 235, w: 38, label: 'Qty' },
        { x: 273, w: 97, label: 'Amount of product' },
        { x: 370, w: 85, label: 'GST (18%)' },
        { x: 455, w: 110, label: 'Amount + GST' },
      ];

      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5);
      cols.forEach((col) => {
        doc.text(col.label, col.x + 4, thY + 5, {
          width: col.w - 8,
          align: col.label === 'Qty' ? 'center' : col.x >= 273 ? 'right' : 'left',
        });
      });

      // --- TABLE ROWS ---
      let trY = thY + 18;
      let totalQty = 0;
      let sumProductAmount = 0;
      let sumGstAmount = 0;
      let sumAmountPlusGst = 0;

      doc.fillColor('#000').fontSize(8.5);

      bill.items.forEach((item, idx) => {
        const qty = Number(item.qty) || 1;
        const unitPrice = Number(item.price) || 0;
        const productAmount = unitPrice * qty;
        const gst18 = productAmount * 0.18;
        const amountPlusGst = productAmount + gst18;

        totalQty += qty;
        sumProductAmount += productAmount;
        sumGstAmount += gst18;
        sumAmountPlusGst += amountPlusGst;

        doc.font('Helvetica').text(String(idx + 1), cols[0].x + 4, trY + 5);
        doc
          .font('Helvetica-Bold')
          .text(item.name, cols[1].x + 4, trY + 5, { width: cols[1].w - 8 });
        doc.font('Helvetica').text(String(qty), cols[2].x + 4, trY + 5, {
          width: cols[2].w - 8,
          align: 'center',
        });
        doc.text(`Rs. ${productAmount.toFixed(2)}`, cols[3].x + 4, trY + 5, {
          width: cols[3].w - 8,
          align: 'right',
        });
        doc.text(`Rs. ${gst18.toFixed(2)}`, cols[4].x + 4, trY + 5, {
          width: cols[4].w - 8,
          align: 'right',
        });
        doc.font('Helvetica-Bold').text(`Rs. ${amountPlusGst.toFixed(2)}`, cols[5].x + 4, trY + 5, {
          width: cols[5].w - 8,
          align: 'right',
        });

        trY += 18;
        doc.moveTo(30, trY).lineTo(565, trY).strokeColor('#d1d5db').stroke();
      });

      const minTableHeight = 110;
      if (trY - thY < minTableHeight) {
        trY = thY + minTableHeight;
      }

      doc.strokeColor('#000');
      cols.forEach((col) => {
        doc.moveTo(col.x, thY).lineTo(col.x, trY + 18).stroke();
      });
      doc.moveTo(565, thY).lineTo(565, trY + 18).stroke();

      // Total Row
      doc.moveTo(30, trY).lineTo(565, trY).stroke();
      doc.font('Helvetica-Bold').fontSize(8.5).text('Total', cols[1].x + 4, trY + 5);
      doc.text(String(totalQty), cols[2].x + 4, trY + 5, {
        width: cols[2].w - 8,
        align: 'center',
      });
      doc.text(`Rs. ${sumProductAmount.toFixed(2)}`, cols[3].x + 4, trY + 5, {
        width: cols[3].w - 8,
        align: 'right',
      });
      doc.text(`Rs. ${sumGstAmount.toFixed(2)}`, cols[4].x + 4, trY + 5, {
        width: cols[4].w - 8,
        align: 'right',
      });
      doc.text(`Rs. ${sumAmountPlusGst.toFixed(2)}`, cols[5].x + 4, trY + 5, {
        width: cols[5].w - 8,
        align: 'right',
      });

      trY += 18;
      doc.moveTo(30, trY).lineTo(565, trY).stroke();

      // --- BOTTOM SECTION ---
      const bY = trY + 8;
      const totalCgst = sumGstAmount / 2;
      const totalSgst = sumGstAmount / 2;

      // Left Column: Estimate Amount In Words
      doc.rect(30, bY, 270, 14).fillAndStroke('#6b7280', '#000');
      doc
        .fillColor('#fff')
        .font('Helvetica-Bold')
        .fontSize(8)
        .text('Estimate Amount In Words', 35, bY + 3);
      doc.rect(30, bY, 270, 36).stroke();
      doc
        .fillColor('#000')
        .font('Helvetica')
        .fontSize(8.5)
        .text(numToWords(sumAmountPlusGst), 35, bY + 18, { width: 260 });

      // Right Column: Amounts Box
      // Exact 4 rows requested:
      // 1. Total amount of the items
      // 2. Total CGST of the bill (9%)
      // 3. Total SGST of the bill (9%)
      // 4. Total amount + GST
      doc.rect(300, bY, 265, 14).fillAndStroke('#6b7280', '#000');
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8).text('Amounts', 305, bY + 3);
      doc.rect(300, bY, 265, 78).stroke();

      doc.fillColor('#000').font('Helvetica').fontSize(8);
      doc.text('Total amount of the items =', 305, bY + 18);
      doc.text(`Rs. ${sumProductAmount.toFixed(2)}`, 460, bY + 18, {
        width: 100,
        align: 'right',
      });
      doc.moveTo(300, bY + 30).lineTo(565, bY + 30).stroke();

      doc.text('Total CGST of the bill (9%) =', 305, bY + 34);
      doc.text(`Rs. ${totalCgst.toFixed(2)}`, 460, bY + 34, {
        width: 100,
        align: 'right',
      });
      doc.moveTo(300, bY + 46).lineTo(565, bY + 46).stroke();

      doc.text('Total SGST of the bill (9%) =', 305, bY + 50);
      doc.text(`Rs. ${totalSgst.toFixed(2)}`, 460, bY + 50, {
        width: 100,
        align: 'right',
      });
      doc.moveTo(300, bY + 62).lineTo(565, bY + 62).stroke();

      doc.font('Helvetica-Bold').fontSize(8.5);
      doc.text('Total amount + GST =', 305, bY + 65);
      doc.text(`Rs. ${sumAmountPlusGst.toFixed(2)}`, 460, bY + 65, {
        width: 100,
        align: 'right',
      });

      // Lower Bottom Row: Bank Details | Terms | Signature
      const lowY = bY + 86;

      doc.rect(30, lowY, 195, 14).fillAndStroke('#6b7280', '#000');
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8).text('Bank Details', 35, lowY + 3);
      doc.rect(30, lowY, 195, 95).stroke();

      if (qrBuffer) {
        doc.image(qrBuffer, 35, lowY + 20, { width: 60 });
        doc.fillColor('#000').font('Helvetica-Bold').fontSize(6).text('UPI SCAN TO PAY', 37, lowY + 82);
      }

      doc.fillColor('#000').font('Helvetica').fontSize(7);
      doc.text('Name : ICICI BANK LIMITED,', 100, lowY + 22);
      doc.text('TIRUNELVELI JUNCTION', 100, lowY + 31);
      doc.text('Account No. : 613505500805', 100, lowY + 42);
      doc.text('IFSC code : ICIC0006135', 100, lowY + 53);
      doc.text(`Account holder's name : ${bill.storeName}`, 100, lowY + 64, { width: 120 });

      doc.rect(225, lowY, 170, 14).fillAndStroke('#6b7280', '#000');
      doc
        .fillColor('#fff')
        .font('Helvetica-Bold')
        .fontSize(8)
        .text('Terms and Conditions', 230, lowY + 3);
      doc.rect(225, lowY, 170, 95).stroke();
      doc
        .fillColor('#000')
        .font('Helvetica')
        .fontSize(8)
        .text('Thanks for doing business with us!', 230, lowY + 25);

      doc.rect(395, lowY, 170, 95).stroke();
      doc
        .fillColor('#000')
        .font('Helvetica')
        .fontSize(8)
        .text(`For : ${bill.storeName}`, 400, lowY + 10, { width: 160, align: 'center' });
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .text('Authorized Signatory', 400, lowY + 78, { width: 160, align: 'center' });

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

const app = express();
app.use(cors());
app.use(express.json());
app.use('/archives', express.static(archiveDir));

app.get('/api/whatsapp-status', (req, res) => {
  res.json({ connected: isWaConnected, qrDataUrl: latestWaQr });
});

// --- INVENTORY API ---
app.get('/api/items', (req, res) => {
  try {
    const items = db.prepare('SELECT * FROM Item ORDER BY createdAt DESC').all();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/items', (req, res) => {
  try {
    const { name, sku, category = 'General', price, stock = 0, minStock = 5 } = req.body;
    const id = randomUUID();
    db.prepare(
      `
      INSERT INTO Item (id, name, sku, category, price, stock, minStock)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      name,
      sku || `SKU-${Date.now().toString().slice(-5)}`,
      category,
      Number(price) || 0,
      Number(stock) || 0,
      Number(minStock) || 5
    );
    const newItem = db.prepare('SELECT * FROM Item WHERE id = ?').get(id);
    res.json(newItem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/items/:id', (req, res) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    const updates = [];
    const values = [];
    for (const [key, val] of Object.entries(fields)) {
      updates.push(`${key} = ?`);
      values.push(val);
    }
    values.push(id);

    if (updates.length > 0) {
      db.prepare(`UPDATE Item SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    const updatedItem = db.prepare('SELECT * FROM Item WHERE id = ?').get(id);
    res.json(updatedItem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/items/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM Item WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- CUSTOMERS TABLE API ---
app.get('/api/customers', (req, res) => {
  try {
    const customers = db
      .prepare('SELECT * FROM Customer ORDER BY balance DESC, updatedAt DESC')
      .all();
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/customers', (req, res) => {
  try {
    const { name, place = '', phone = '' } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Customer name is required.' });
    }

    let cleanPhone = String(phone || '').replace(/\D/g, '');
    if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;
    const lookupKey =
      cleanPhone.length >= 10 ? cleanPhone : `NAME:${name.trim().toLowerCase()}`;

    const existing = db.prepare('SELECT * FROM Customer WHERE phone = ?').get(lookupKey);
    if (existing) {
      db.prepare(
        `UPDATE Customer SET name = ?, place = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(name.trim(), place.trim(), existing.id);
      const updated = db.prepare('SELECT * FROM Customer WHERE id = ?').get(existing.id);
      const allCustomers = db
        .prepare('SELECT * FROM Customer ORDER BY balance DESC, updatedAt DESC')
        .all();
      return res.json({ success: true, customer: updated, customers: allCustomers });
    }

    const id = randomUUID();
    db.prepare(
      `INSERT INTO Customer (id, name, place, phone, totalBilled, totalPaid, balance)
       VALUES (?, ?, ?, ?, 0, 0, 0)`
    ).run(id, name.trim(), place.trim(), lookupKey);

    const created = db.prepare('SELECT * FROM Customer WHERE id = ?').get(id);
    const allCustomers = db
      .prepare('SELECT * FROM Customer ORDER BY balance DESC, updatedAt DESC')
      .all();
    res.json({ success: true, customer: created, customers: allCustomers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- PAY CUSTOMER PENDING AMOUNT ---
app.post('/api/pay-customer-balance', (req, res) => {
  try {
    const { customerId, amountPaid } = req.body;
    const payment = Number(amountPaid);

    if (!customerId || isNaN(payment) || payment <= 0) {
      return res
        .status(400)
        .json({ error: 'Please enter a valid payment amount greater than 0.' });
    }

    const customer = db.prepare('SELECT * FROM Customer WHERE id = ?').get(customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    const currentBalance = Number(customer.balance || 0);
    if (currentBalance <= 0) {
      return res.status(400).json({ error: 'This customer has no pending balance.' });
    }

    const appliedPayment = Math.min(currentBalance, payment);

    const executeCustomerPayment = db.transaction(() => {
      let remainingToApply = appliedPayment;
      const unpaidSales = db
        .prepare(
          `SELECT * FROM Sale
           WHERE (customerPhone = ? OR LOWER(customerName) = LOWER(?))
             AND balanceAmount > 0
           ORDER BY createdAt ASC`
        )
        .all(customer.phone, customer.name);

      for (const sale of unpaidSales) {
        if (remainingToApply <= 0) break;
        const saleBal = Number(sale.balanceAmount || 0);
        const deduct = Math.min(saleBal, remainingToApply);
        const nextPaid = Number(sale.paidAmount || 0) + deduct;
        const nextBal = Math.max(0, Number((saleBal - deduct).toFixed(2)));

        db.prepare(`UPDATE Sale SET paidAmount = ?, balanceAmount = ? WHERE id = ?`).run(
          nextPaid,
          nextBal,
          sale.id
        );
        remainingToApply = Number((remainingToApply - deduct).toFixed(2));
      }

      const newTotalPaid = Number((Number(customer.totalPaid || 0) + appliedPayment).toFixed(2));
      const newBalance = Math.max(0, Number((currentBalance - appliedPayment).toFixed(2)));

      db.prepare(
        `UPDATE Customer
         SET totalPaid = ?, balance = ?, updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(newTotalPaid, newBalance, customer.id);
    });

    executeCustomerPayment();

    const allCustomers = db
      .prepare('SELECT * FROM Customer ORDER BY balance DESC, updatedAt DESC')
      .all();
    const allSales = db
      .prepare('SELECT * FROM Sale ORDER BY createdAt DESC')
      .all()
      .map((s) => ({
        ...s,
        grandTotal: s.total,
        paidAmount: s.paidAmount ?? 0,
        balanceAmount: s.balanceAmount ?? s.total,
        date: new Date(s.createdAt).toLocaleString('en-IN'),
        items: JSON.parse(s.itemsJson || '[]'),
      }));

    const updatedCustomer = db.prepare('SELECT * FROM Customer WHERE id = ?').get(customerId);

    res.json({
      success: true,
      customers: allCustomers,
      sales: allSales,
      message: `Received ₹${appliedPayment.toFixed(2)} from ${updatedCustomer.name}${
        updatedCustomer.place ? ` (${updatedCustomer.place})` : ''
      }. Remaining pending amount: ₹${Number(updatedCustomer.balance).toFixed(2)}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- SALES & BILLING API ---
app.get('/api/sales', (req, res) => {
  try {
    const sales = db.prepare('SELECT * FROM Sale ORDER BY createdAt DESC').all();
    res.json(
      sales.map((s) => {
        let parsedItems = [];
        try {
          parsedItems = JSON.parse(s.itemsJson || '[]');
        } catch {}
        return {
          ...s,
          grandTotal: s.total,
          paidAmount: s.paidAmount ?? 0,
          balanceAmount: s.balanceAmount ?? s.total,
          date: new Date(s.createdAt).toLocaleString('en-IN'),
          items: parsedItems,
        };
      })
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- COMPLETE BILL (AUTOMATIC 18% GST) ---
app.post('/api/complete-bill', async (req, res) => {
  try {
    const {
      invoiceNo,
      date,
      customerName = 'Walk-in Customer',
      customerPlace = '',
      customerPhone = '',
      items = [],
      sendWhatsApp = true,
      storeName = 'PHOTO BOOKS',
      storeGstin = '33ABEPB960D1Z7',
      storeAddress = '10/1.11/1 Parasakthi building upstairs Madrai road, Tirunelveli junction Tirunelveli',
      storePhone = '8754540404',
      upiId = 'photobooks@icici',
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Cannot complete an empty bill.' });
    }

    // Automatically calculate 18% GST from base item prices
    const calcSubtotal = items.reduce(
      (sum, i) => sum + (Number(i.price) || 0) * (Number(i.qty) || 1),
      0
    );
    const calcTotalGst = calcSubtotal * 0.18;
    const calcCgst = calcTotalGst / 2;
    const calcSgst = calcTotalGst / 2;
    const calcGrandTotal = calcSubtotal + calcTotalGst;

    // 1. Validate Stock Availability
    for (const item of items) {
      if (item.id) {
        const dbItem = db.prepare('SELECT stock, name FROM Item WHERE id = ?').get(item.id);
        if (dbItem && dbItem.stock < item.qty) {
          return res.status(400).json({
            error: `Insufficient stock for "${dbItem.name}". Available: ${dbItem.stock}, Requested: ${item.qty}`,
          });
        }
      }
    }

    // 2. Validate WhatsApp if enabled
    let cleanPhone = String(customerPhone || '').replace(/\D/g, '');
    if (sendWhatsApp) {
      if (!cleanPhone || cleanPhone.length < 10) {
        return res.status(400).json({
          error: 'Please enter a valid 10-digit WhatsApp number, or uncheck WhatsApp sending.',
        });
      }
      if (!sock || !isWaConnected) {
        return res.status(503).json({
          error:
            'WhatsApp is not linked! Please link your studio WhatsApp QR first. Bill was NOT marked as completed.',
        });
      }
    }

    if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;

    // 3. Generate UPI QR Code & PDF
    const upiUri = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(storeName)}&am=${calcGrandTotal.toFixed(2)}&cu=INR`;
    const qrBuffer = await QRCode.toBuffer(upiUri, { width: 300, margin: 1 });

    const pdfBuffer = await buildInvoicePdfBuffer(
      {
        invoiceNo,
        date: date || new Date().toLocaleDateString('en-IN'),
        customerName,
        customerPlace,
        customerPhone: cleanPhone || 'N/A',
        items,
        subtotal: calcSubtotal,
        cgst: calcCgst,
        sgst: calcSgst,
        total: calcGrandTotal,
        storeName,
        storeGstin,
        storeAddress,
        storePhone,
        upiId,
      },
      qrBuffer
    );

    // 4. Send via WhatsApp FIRST
    if (sendWhatsApp) {
      const [waCheck] = await sock.onWhatsApp(cleanPhone);
      if (!waCheck || !waCheck.exists) {
        return res.status(400).json({
          error: `The number +${cleanPhone} is not registered on WhatsApp. Bill was NOT saved.`,
        });
      }

      const displayCustomer = customerPlace
        ? `${customerName} (${customerPlace})`
        : customerName;

      await sock.sendMessage(waCheck.jid, {
        document: pdfBuffer,
        mimetype: 'application/pdf',
        fileName: `${invoiceNo}.pdf`,
        caption: `Hello *${displayCustomer}*,\n\nAttached is your Estimate (*#${invoiceNo}*) for *₹${calcGrandTotal.toFixed(2)}* (Items: ₹${calcSubtotal.toFixed(2)} + 18% GST: ₹${calcTotalGst.toFixed(2)}) from *${storeName}*.\n\nThank you for doing business with us! 🙏`,
      });
    }

    // 5. Save PDF to Archive Folder
    const pdfFileName = `${invoiceNo}.pdf`;
    const fullPdfPath = path.join(archiveDir, pdfFileName);
    fs.writeFileSync(fullPdfPath, pdfBuffer);
    const publicPdfUrl = `/archives/${pdfFileName}`;
    let googleDriveUrl = null;
    try {
      googleDriveUrl = await uploadPdfToGoogleDrive(fullPdfPath, invoiceNo, date);
      if (googleDriveUrl) {
        console.log(`PDF uploaded to Google Drive: ${googleDriveUrl}`);
      }
    } catch (driveError) {
      console.error(`Google Drive upload failed for ${invoiceNo}:`, driveError);
    }

    // 6. Commit Sale & Update Customer
    const existing = db.prepare('SELECT * FROM Sale WHERE invoiceNo = ?').get(invoiceNo);
    let savedSale = existing;

    if (!existing) {
      const saleId = randomUUID();
      const executeCheckout = db.transaction(() => {
        db.prepare(
          `
          INSERT INTO Sale (id, invoiceNo, customerName, customerPlace, customerPhone, subtotal, total, paidAmount, balanceAmount, cgst, sgst, itemsJson, pdfPath, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 1)
        `
        ).run(
          saleId,
          invoiceNo,
          customerName,
          customerPlace,
          cleanPhone || 'N/A',
          calcSubtotal,
          calcGrandTotal,
          calcGrandTotal,
          calcCgst,
          calcSgst,
          JSON.stringify(items),
          publicPdfUrl
        );

        for (const product of items) {
          if (product.id) {
            db.prepare(`UPDATE Item SET stock = MAX(0, stock - ?) WHERE id = ?`).run(
              product.qty,
              product.id
            );
          }
        }

        syncCustomerRecord(customerName, customerPlace, cleanPhone || 'N/A', invoiceNo);
      });

      executeCheckout();
      savedSale = db.prepare('SELECT * FROM Sale WHERE id = ?').get(saleId);
    }

    const allCustomers = db
      .prepare('SELECT * FROM Customer ORDER BY balance DESC, updatedAt DESC')
      .all();

    res.json({
      success: true,
      sale: savedSale,
      customers: allCustomers,
      pdfUrl: publicPdfUrl,
      googleDriveUrl,
      message: sendWhatsApp
        ? `Estimate #${invoiceNo} confirmed, sent to WhatsApp, and added to ${customerName}'s pending balance!`
        : `Estimate #${invoiceNo} confirmed and added to ${customerName}'s pending balance!`,
    });
  } catch (err) {
    console.error('Complete bill error:', err);
    res.status(500).json({
      error: `Process failed: ${err.message}. Nothing was deducted or saved to the database.`,
    });
  }
});

app.use(express.static(path.join(__dirname, '../dist')));
app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, '../dist/index.html')));

const PORT = 5000;
const server = app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
server.on('error', (err) => console.error('Server error:', err));