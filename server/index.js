// server/index.js
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import pino from 'pino';
import * as baileys from '@whiskeysockets/baileys';
import * as XLSX from 'xlsx';

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
dotenv.config({ path: path.join(__dirname, '../.env') });
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

const googleDriveDateParts = (date = new Date()) => {
  const parsedDate = String(date).match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const currentDate = parsedDate
    ? new Date(Number(parsedDate[3]), Number(parsedDate[2]) - 1, Number(parsedDate[1]))
    : date instanceof Date
      ? date
      : new Date();

  return {
    year: String(currentDate.getFullYear()),
    month: currentDate.toLocaleString('en-US', { month: 'long' }),
    day: googleDriveDateFolder(currentDate),
  };
};

const GOOGLE_SCRIPT_WEBHOOK_URL =
  process.env.GOOGLE_SCRIPT_WEBHOOK_URL ||
  'https://script.google.com/macros/s/AKfycbzTemvT2csrH67aTZwW1jifGhEaJa5Vko8Z_A1WKDbDvcP93AhWaVBAzaHUq9J4-4MWPQ/exec';

const GOOGLE_DRIVE_ROOT_FOLDER = process.env.GOOGLE_DRIVE_ROOT_FOLDER || 'PhotoBooks_POS';

const postFileToGoogleScriptWebhook = async ({
  fileName,
  mimeType,
  buffer,
  dateInput = new Date(),
  overwrite = false,
}) => {
  if (!GOOGLE_SCRIPT_WEBHOOK_URL) {
    console.warn('Google Drive upload skipped: GOOGLE_SCRIPT_WEBHOOK_URL is not configured.');
    return null;
  }

  const { year, month, day } = googleDriveDateParts(dateInput);
  const fileBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  const response = await fetch(GOOGLE_SCRIPT_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      rootFolder: GOOGLE_DRIVE_ROOT_FOLDER,
      year,
      month,
      date: day,
      fileName,
      mimeType,
      base64Data: fileBuffer.toString('base64'),
      overwrite,
    }),
    redirect: 'follow',
  });

  const rawText = await response.text();
  let result;
  try {
    result = JSON.parse(rawText);
  } catch {
    throw new Error(`Unexpected response from Google Drive webhook: ${rawText.slice(0, 200)}`);
  }

  if (!result || !result.success) {
    throw new Error(result?.error || 'Google Drive webhook upload failed.');
  }

  return result; // { success: true, fileId, fileUrl, folderPath }
};

const uploadPdfToGoogleDrive = async (pdfPath, invoiceNo, billDate) => {
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`Local PDF file not found at ${pdfPath}`);
  }

  const safeFileName = `${String(invoiceNo).replace(/[\/\\:]/g, '-')}.pdf`;
  const pdfBuffer = fs.readFileSync(pdfPath);

  const result = await postFileToGoogleScriptWebhook({
    fileName: safeFileName,
    mimeType: 'application/pdf',
    buffer: pdfBuffer,
    dateInput: billDate,
    overwrite: true,
  });

  return result?.fileUrl || result?.fileId || null;
};

const uploadDatabaseBackupToGoogleDrive = async (billDate) => {
  const { day } = googleDriveDateParts(billDate);
  const backupPath = path.join(dataDir, `database-backup-${day}-${Date.now()}.db`);

  try {
    await db.backup(backupPath);
    const dbBuffer = fs.readFileSync(backupPath);

    const result = await postFileToGoogleScriptWebhook({
      fileName: 'database-backup.db',
      mimeType: 'application/x-sqlite3',
      buffer: dbBuffer,
      dateInput: billDate,
      overwrite: true,
    });

    return result?.fileId || result?.fileUrl || null;
  } finally {
    if (fs.existsSync(backupPath)) {
      try {
        fs.unlinkSync(backupPath);
      } catch {}
    }
  }
};

const uploadCustomerBalancesToGoogleDrive = async (snapshotDate = new Date()) => {
  const customers = db
    .prepare(
      `SELECT name, place, phone, totalBilled, totalPaid, balance, lastInvoiceNo, updatedAt
       FROM Customer
       ORDER BY balance DESC, name ASC`
    )
    .all();

  const rows = customers.map((customer) => ({
    'Customer Name': customer.name,
    Place: customer.place || '',
    Phone: customer.phone,
    'Total Billed': Number(customer.totalBilled || 0),
    'Total Paid': Number(customer.totalPaid || 0),
    Balance: Number(customer.balance || 0),
    'Last Invoice No': customer.lastInvoiceNo || '',
    'Updated At': customer.updatedAt || '',
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Customer Balances');

  // Use type: 'buffer' so it converts cleanly to base64 without stream.pipe errors
  const xlsxBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  const result = await postFileToGoogleScriptWebhook({
    fileName: 'customer-balances.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: xlsxBuffer,
    dateInput: snapshotDate,
    overwrite: true,
  });

  return result?.fileUrl || result?.fileId || null;
};

const sendInvoicePdfToWhatsApp = async (invoiceNo) => {
  if (!sock || !isWaConnected) {
    throw new Error('WhatsApp is not connected.');
  }

  const sale = db.prepare('SELECT * FROM Sale WHERE invoiceNo = ?').get(invoiceNo);
  if (!sale) throw new Error(`Invoice ${invoiceNo} was not found.`);

  const cleanPhone = String(sale.customerPhone || '').replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 10) {
    throw new Error('A valid customer WhatsApp number is required.');
  }

  const [waCheck] = await sock.onWhatsApp(cleanPhone);
  if (!waCheck || !waCheck.exists) {
    throw new Error(`The number +${cleanPhone} is not registered on WhatsApp.`);
  }

  const pdfPath = path.join(archiveDir, `${invoiceNo}.pdf`);
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`Archived PDF for invoice ${invoiceNo} was not found.`);
  }

  const displayCustomer = sale.customerPlace
    ? `${sale.customerName} (${sale.customerPlace})`
    : sale.customerName;
  await sock.sendMessage(waCheck.jid, {
    document: fs.readFileSync(pdfPath),
    mimetype: 'application/pdf',
    fileName: `${invoiceNo}.pdf`,
    caption: `Hello *${displayCustomer}*,\n\nAttached is your ${sale.documentType} (*#${invoiceNo}*) for *₹${Number(sale.total).toFixed(2)}* (GST included in item prices).\n\nThank you`,
  });
};

const dbPath = process.env.DB_PATH || path.join(dataDir, 'dev.db');
const db = new Database(dbPath);

// Ensure Item, Sale, and Customer tables exist
db.exec(`
  CREATE TABLE IF NOT EXISTS Item (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sku TEXT UNIQUE NOT NULL,
    category TEXT DEFAULT 'General',
    price REAL NOT NULL,
    gstRate REAL DEFAULT 18,
    baseUnit TEXT DEFAULT 'Pieces',
    stock INTEGER NOT NULL,
    minStock INTEGER DEFAULT 5,
    stockTracked INTEGER NOT NULL DEFAULT 1,
    isPackage INTEGER NOT NULL DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ItemMaterial (
    id TEXT PRIMARY KEY,
    finishedItemId TEXT NOT NULL,
    materialItemId TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    FOREIGN KEY (finishedItemId) REFERENCES Item(id) ON DELETE CASCADE,
    FOREIGN KEY (materialItemId) REFERENCES Item(id) ON DELETE RESTRICT
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
    documentType TEXT DEFAULT 'Estimate',
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

  CREATE TABLE IF NOT EXISTS CustomerPayment (
    id TEXT PRIMARY KEY,
    customerId TEXT NOT NULL,
    amount REAL NOT NULL,
    paidAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const itemColumns = db.prepare('PRAGMA table_info(Item)').all();
if (!itemColumns.some((column) => column.name === 'stockTracked')) {
  db.exec('ALTER TABLE Item ADD COLUMN stockTracked INTEGER NOT NULL DEFAULT 1');
}
try { db.exec(`ALTER TABLE Item ADD COLUMN gstRate REAL DEFAULT 18;`); } catch {}
try { db.exec(`ALTER TABLE Item ADD COLUMN isPackage INTEGER NOT NULL DEFAULT 0;`); } catch {}
if (!itemColumns.some((column) => column.name === 'baseUnit')) {
  db.exec("ALTER TABLE Item ADD COLUMN baseUnit TEXT DEFAULT 'Pieces'");
}
db.exec(`
  UPDATE Item
  SET baseUnit = CASE
    WHEN isPackage = 1 THEN 'Package'
    WHEN stockTracked = 0 AND (baseUnit IS NULL OR TRIM(baseUnit) = '' OR baseUnit = 'Pieces') THEN 'Other'
    WHEN baseUnit IS NULL OR TRIM(baseUnit) = '' THEN 'Pieces'
    ELSE baseUnit
  END
`);
try { db.exec(`ALTER TABLE Sale ADD COLUMN customerPlace TEXT DEFAULT '';`); } catch {}
try { db.exec(`ALTER TABLE Sale ADD COLUMN subtotal REAL DEFAULT 0;`); } catch {}
try { db.exec(`ALTER TABLE Sale ADD COLUMN paidAmount REAL DEFAULT 0;`); } catch {}
try { db.exec(`ALTER TABLE Sale ADD COLUMN balanceAmount REAL DEFAULT 0;`); } catch {}
try { db.exec(`ALTER TABLE Sale ADD COLUMN itemsJson TEXT DEFAULT '[]';`); } catch {}
try { db.exec(`ALTER TABLE Sale ADD COLUMN pdfPath TEXT DEFAULT '';`); } catch {}
try { db.exec(`ALTER TABLE Sale ADD COLUMN documentType TEXT DEFAULT 'Estimate';`); } catch {}
try { db.exec(`ALTER TABLE Customer ADD COLUMN place TEXT DEFAULT '';`); } catch {}

db.exec('UPDATE Item SET stock = 0, minStock = 0, stockTracked = 0 WHERE isPackage = 1');

// Remove old hardcoded demo items if they were seeded earlier
try {
  db.exec(`
    DELETE FROM Item
    WHERE sku IN ('PPR-A3G', 'SHT-1236', 'TPE-RED50', 'GUM-SYN05', 'INK-6C01', 'PAD-ACR01');
  `);
} catch {}

const isPieceUnit = (unit) => /^pieces?$/i.test(String(unit || '').trim());
const isStockTrackedItem = (item) =>
  Number(item?.stockTracked) === 1 &&
  isPieceUnit(item?.baseUnit) &&
  Number(item?.isPackage) !== 1;

const getItemsWithMaterials = () => {
  const items = db.prepare(`
    SELECT i.id, i.name, i.sku, i.category, i.price, i.gstRate, i.baseUnit, i.stock, i.minStock,
           i.stockTracked, i.isPackage, i.createdAt, m.materialItemId,
           m.quantity AS materialQuantity, material.name AS materialName
    FROM Item i
    LEFT JOIN ItemMaterial m ON m.finishedItemId = i.id
    LEFT JOIN Item material ON material.id = m.materialItemId
    ORDER BY i.createdAt DESC
  `).all();
  const grouped = new Map();
  for (const row of items) {
    const { materialItemId, materialQuantity, materialName, ...item } = row;
    if (!grouped.has(item.id)) grouped.set(item.id, { ...item, linkedMaterials: [] });
    if (materialItemId) {
      grouped.get(item.id).linkedMaterials.push({
        id: materialItemId,
        name: materialName,
        quantity: materialQuantity,
      });
    }
  }
  return [...grouped.values()].map((item) => ({
    ...item,
    stockTracked: isStockTrackedItem(item) ? 1 : 0,
    linkedMaterial: item.linkedMaterials[0] || null,
  }));
};

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
let isWaConnecting = false;
let isWaUnlinking = false;
let reconnectTimer = null;
const waAuthDir = path.join(dataDir, 'whatsapp_auth_session');

function scheduleWhatsAppReconnect(delayMs = 3000) {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (isWaConnecting) {
      scheduleWhatsAppReconnect(1000);
      return;
    }
    connectToWhatsApp();
  }, delayMs);
}

async function connectToWhatsApp() {
  if (isWaConnecting || (sock && isWaConnected)) return;
  isWaConnecting = true;

  try {
    const { state, saveCreds } = await getMultiFileAuthState(waAuthDir);
    const { version } = await fetchLatestBaileysVersion();

    const nextSock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
    });
    sock = nextSock;

    nextSock.ev.on('creds.update', saveCreds);

    nextSock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        latestWaQr = await QRCode.toDataURL(qr);
        isWaConnected = false;
      }

      if (connection === 'open') {
        if (sock !== nextSock) return;
        isWaConnected = true;
        latestWaQr = null;
        console.log('WhatsApp connected and ready for automatic PDF dispatch!');
      }

      if (connection === 'close') {
        if (sock !== nextSock) return;
        isWaConnected = false;
        sock = null;
        if (isWaUnlinking) return;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.warn(`WhatsApp connection closed (status ${statusCode ?? 'unknown'}).`);

        if (statusCode === DisconnectReason.connectionReplaced) {
          console.error(
            'WhatsApp replaced this linked session. Remove the saved WhatsApp session, restart the app, and scan the QR code to link it again.'
          );
          return;
        }

        if (statusCode === DisconnectReason.loggedOut) {
          try {
            fs.rmSync(waAuthDir, { recursive: true, force: true });
          } catch (err) {
            console.error('Unable to clear logged-out WhatsApp session:', err.message);
          }
        }

        scheduleWhatsAppReconnect(statusCode === DisconnectReason.loggedOut ? 2000 : 3000);
      }
    });
  } catch (err) {
    console.error('WhatsApp init error:', err.message);
    scheduleWhatsAppReconnect();
  } finally {
    isWaConnecting = false;
  }
}
if (process.env.RUN_SCHEDULED_DRIVE_EXPORTS !== '1') {
  connectToWhatsApp();
}

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

// Helper: Draw invoice PDF with item-specific GST rates & Summary Box
function buildInvoicePdfBuffer(bill, qrBuffer) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 30 });
      const signaturePath = isPackaged
        ? path.join(process.resourcesPath, 'public', 'signature.png')
        : path.join(__dirname, '../public/signature.png');
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

      const documentTitle = bill.documentType === 'Sale' ? 'Sale Bill' : 'Estimate Bill';
      doc.font('Helvetica-Bold').fontSize(14).text(documentTitle, 0, 35, { align: 'center' });

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
      doc.fillColor('#000').font('Helvetica-Bold').fontSize(8).text(`${documentTitle} For`, 35, boxY + 4);
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
        .text(`${documentTitle} Details`, 302, boxY + 4);
      doc.rect(297, boxY, 268, 52).stroke();
      doc.font('Helvetica').fontSize(9).text(`${documentTitle} No.: ${bill.invoiceNo}`, 302, boxY + 20);
      doc.text(`Date: ${bill.date}`, 302, boxY + 34);

      // --- TABLE HEADER ---
      // Columns: # | Name of the product | Qty | GST-inclusive price | Final amount
      const thY = 165;
      const isSale = bill.documentType === 'Sale';
      doc.rect(30, thY, 535, 18).fillAndStroke('#6b7280', '#000');

      const cols = [
        { x: 30, w: 22, label: '#' },
        { x: 52, w: 183, label: 'Name of the product' },
        { x: 235, w: 38, label: 'Qty' },
        { x: 273, w: 97, label: bill.documentType === 'Sale' ? 'Price (Incl. GST)' : 'Price' },
        { x: 370, w: 195, label: 'Final Amount' },
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
        const amountPlusGst = unitPrice * qty;
        const gstRate = Number(item.gstRate ?? 18);
        const productAmount = amountPlusGst / (1 + gstRate / 100);
        const gstAmount = amountPlusGst - productAmount;

        if (!item.displayOnly) {
          totalQty += qty;
          sumProductAmount += productAmount;
          sumGstAmount += gstAmount;
          sumAmountPlusGst += amountPlusGst;
        }

        doc.font('Helvetica').text(String(idx + 1), cols[0].x + 4, trY + 5);
        doc
          .font('Helvetica-Bold')
          .text(item.name, cols[1].x + 4, trY + 5, { width: cols[1].w - 8 });
        doc.font('Helvetica').text(String(qty), cols[2].x + 4, trY + 5, {
          width: cols[2].w - 8,
          align: 'center',
        });
        doc.text(`Rs. ${unitPrice.toFixed(2)}`, cols[3].x + 4, trY + 5, {
          width: cols[3].w - 8,
          align: 'right',
        });
        doc.font('Helvetica-Bold').text(item.displayOnly ? 'Included' : `Rs. ${amountPlusGst.toFixed(2)}`, cols[4].x + 4, trY + 5, {
          width: cols[4].w - 8,
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
      doc.text('-', cols[3].x + 4, trY + 5, {
        width: cols[3].w - 8,
        align: 'right',
      });
      doc.text(`Rs. ${sumAmountPlusGst.toFixed(2)}`, cols[4].x + 4, trY + 5, {
        width: cols[4].w - 8,
        align: 'right',
      });

      trY += 18;
      doc.moveTo(30, trY).lineTo(565, trY).stroke();

      // --- BOTTOM SECTION ---
      const bY = trY + 8;
      const totalCgst = sumGstAmount / 2;
      const totalSgst = sumGstAmount / 2;

      // Left column contains GST split-up only for sale bills.
      doc.rect(30, bY, 270, 14).fillAndStroke('#6b7280', '#000');
      doc
        .fillColor('#fff')
        .font('Helvetica-Bold')
        .fontSize(8)
        .text(isSale ? 'GST Details' : 'Estimate Amount In Words', 35, bY + 3);
      doc.rect(30, bY, 270, isSale ? 105 : 36).stroke();
      doc.fillColor('#000').font('Helvetica').fontSize(8.5);
      if (isSale) {
        doc.text(`CGST (9%) = Rs. ${totalCgst.toFixed(2)}`, 35, bY + 20);
        doc.text(`SGST (9%) = Rs. ${totalSgst.toFixed(2)}`, 35, bY + 38);
        doc.font('Helvetica-Bold').text(`GST (18%) = Rs. ${sumGstAmount.toFixed(2)}`, 35, bY + 56);
        doc
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .text('Amount in words:', 35, bY + 77);
        doc
          .font('Helvetica')
          .fontSize(7.3)
          .text(numToWords(sumAmountPlusGst), 35, bY + 88, { width: 245 });
      } else {
        doc.text(numToWords(sumAmountPlusGst), 35, bY + 18, { width: 260 });
      }

      // Right Column: Amounts Box
      // The right box contains amounts, without the GST split-up.
      doc.rect(300, bY, 265, 14).fillAndStroke('#6b7280', '#000');
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8).text('Amounts', 305, bY + 3);
      doc.rect(300, bY, 265, 68).stroke();

      doc.fillColor('#000').font('Helvetica').fontSize(8);
      doc.font('Helvetica-Bold').fontSize(8.5);
      doc.text('Final amount =', 305, bY + 21);
      doc.text(`Rs. ${sumAmountPlusGst.toFixed(2)}`, 460, bY + 21, {
        width: 100,
        align: 'right',
      });
      doc.font('Helvetica').fontSize(8);
      doc.text('Received =', 305, bY + 37);
      doc.text(`Rs. ${Number(bill.paidAmount || 0).toFixed(2)}`, 460, bY + 37, {
        width: 100,
        align: 'right',
      });
      doc.text('Balance =', 305, bY + 52);
      doc.text(`Rs. ${Number(bill.balanceAmount ?? sumAmountPlusGst).toFixed(2)}`, 460, bY + 52, {
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
        .fontSize(6.5)
        .text(
          '1. Prices include applicable GST unless stated otherwise.\n2. Verify product details, quantity, spelling, photographs, and layout before approval/printing.\n3. Confirmed orders are non-refundable once production begins; any balance is payable before delivery.',
          230,
          lowY + 20,
          { width: 155, lineGap: 3 }
        );

      const sigBoxX = 395;
      const sigBoxY = lowY;
      doc.rect(sigBoxX, sigBoxY, 170, 95).stroke();
      doc
        .fillColor('#000')
        .font('Helvetica')
        .fontSize(8)
        .text(`For : ${bill.storeName}`, sigBoxX + 5, sigBoxY + 10, {
          width: 160,
          align: 'center',
        });
      if (fs.existsSync(signaturePath)) {
        doc.image(signaturePath, sigBoxX + 20, sigBoxY + 18, {
          fit: [110, 42],
          align: 'center',
          valign: 'center',
        });
      }
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .text('Authorized Signatory', sigBoxX + 5, sigBoxY + 78, {
          width: 160,
          align: 'center',
        });

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/archives', express.static(archiveDir));

app.get('/api/whatsapp-status', (req, res) => {
  res.json({ connected: isWaConnected, qrDataUrl: latestWaQr });
});

app.post('/api/whatsapp-unlink', async (req, res) => {
  isWaUnlinking = true;
  try {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (sock) {
      try {
        await sock.logout();
      } catch (err) {
        console.warn('WhatsApp logout notification failed:', err.message);
      }
    }
    sock = null;
    isWaConnected = false;
    latestWaQr = null;
    fs.rmSync(waAuthDir, { recursive: true, force: true });
    isWaUnlinking = false;
    scheduleWhatsAppReconnect(500);
    res.json({ success: true });
  } catch (err) {
    isWaUnlinking = false;
    console.error('Unable to unlink WhatsApp:', err);
    res.status(500).json({ error: 'Unable to unlink WhatsApp. Please try again.' });
  }
});

// --- INVENTORY API ---
app.get('/api/items', (req, res) => {
  try {
    res.json(getItemsWithMaterials());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/items', (req, res) => {
  try {
    const {
      name,
      sku,
      category = 'General',
      price,
      gstRate = 18,
      baseUnit,
      stock = 0,
      minStock = 5,
      stockTracked = true,
      isPackage = false,
      materialItemId = null,
      materials = [],
      consumptionQuantity = 1,
    } = req.body;
    const id = randomUUID();
    const packageItem = isPackage === true || isPackage === 1;
    const resolvedBaseUnit = packageItem
      ? 'Package'
      : String(baseUnit || (stockTracked === false || stockTracked === 0 ? 'Other' : 'Pieces')).trim() ||
        'Other';
    const shouldTrackStock =
      !packageItem &&
      isPieceUnit(resolvedBaseUnit) &&
      stockTracked !== false &&
      stockTracked !== 0;
    const materialRows = Array.isArray(materials) && materials.length
      ? materials
      : materialItemId
        ? [{ materialItemId, quantity: consumptionQuantity }]
        : [];
    if (packageItem && materialRows.length === 0) {
      return res.status(400).json({ error: 'A package must contain at least one linked item.' });
    }
    db.prepare(
      `
      INSERT INTO Item (id, name, sku, category, price, gstRate, baseUnit, stock, minStock, stockTracked, isPackage)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      name,
      sku?.trim().toUpperCase() || `SKU-${randomUUID().slice(0, 8).toUpperCase()}`,
      category,
      Number(price) || 0,
      Number(gstRate) || 0,
      resolvedBaseUnit,
      shouldTrackStock ? Math.max(0, Number(stock) || 0) : 0,
      shouldTrackStock ? Math.max(0, Number(minStock) || 0) : 0,
      shouldTrackStock ? 1 : 0,
      packageItem ? 1 : 0
    );
    const addMaterial = db.prepare(
      'INSERT INTO ItemMaterial (id, finishedItemId, materialItemId, quantity) VALUES (?, ?, ?, ?)'
    );
    for (const material of materialRows) {
      if (material.materialItemId && material.materialItemId !== id) {
        const materialItem = db.prepare('SELECT id FROM Item WHERE id = ?').get(material.materialItemId);
        if (!materialItem) throw new Error('A linked inventory item does not exist.');
        addMaterial.run(randomUUID(), id, material.materialItemId, Math.max(0.001, Number(material.quantity) || 1));
      }
    }
    const newItem = getItemsWithMaterials().find((item) => item.id === id);
    res.json(newItem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/items/import', (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const existingAction = ['add', 'ignore', 'overwrite'].includes(req.body.existingAction)
      ? req.body.existingAction
      : 'add';
    if (items.length === 0) {
      return res.status(400).json({ error: 'No inventory items were provided.' });
    }

    const normalizedItems = items.map((item, index) => ({
      source: item,
      index,
      name: String(item.name || '').trim(),
      sku: String(item.sku || `IMPORT-${Date.now()}-${index}`).trim().toUpperCase(),
    }));
    const validItems = normalizedItems.filter((item) => item.name);
    const existingSkus = new Set();
    const skuList = [...new Set(validItems.map((item) => item.sku))];
    for (let offset = 0; offset < skuList.length; offset += 900) {
      const chunk = skuList.slice(offset, offset + 900);
      const placeholders = chunk.map(() => '?').join(', ');
      db.prepare(`SELECT sku FROM Item WHERE sku IN (${placeholders})`).all(...chunk)
        .forEach((item) => existingSkus.add(item.sku));
    }

    let importedNewItems = 0;
    let updatedExistingItems = 0;
    let ignoredItems = normalizedItems.length - validItems.length;
    let failedItems = 0;
    const affectedSkus = new Set();

    const importItems = db.transaction(() => {
      const insert = db.prepare(`
        INSERT INTO Item (id, name, sku, category, price, gstRate, baseUnit, stock, minStock, stockTracked)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const update = db.prepare(`
        UPDATE Item
        SET name = ?, category = ?, price = ?, gstRate = ?, baseUnit = ?, stock = ?, minStock = ?, stockTracked = ?
        WHERE sku = ?
      `);
      const addStock = db.prepare(
        'UPDATE Item SET stock = stock + ? WHERE sku = ?'
      );

      for (const item of validItems) {
        try {
          const data = item.source;
          const category = String(data.category || 'General').trim() || 'General';
          const price = Number(data.price) || 0;
          const gstRate = Number(data.gstRate) || 18;
          const baseUnit =
            String(data.baseUnit || (data.stockTracked === false || data.stockTracked === 0 ? 'Other' : 'Pieces')).trim() ||
            'Other';
          const stockTracked =
            isPieceUnit(baseUnit) && data.stockTracked !== false && data.stockTracked !== 0 ? 1 : 0;
          const stock = stockTracked ? Math.max(0, Number(data.stock) || 0) : 0;
          const minStock = stockTracked ? Math.max(0, Number(data.minStock) || 0) : 0;
          if (existingSkus.has(item.sku)) {
            affectedSkus.add(item.sku);
            if (existingAction === 'ignore') {
              ignoredItems += 1;
            } else if (existingAction === 'add') {
              addStock.run(stock, item.sku);
              updatedExistingItems += 1;
            } else {
              update.run(
                item.name,
                category,
                price,
                gstRate,
                baseUnit,
                stock,
                minStock,
                stockTracked,
                item.sku
              );
              updatedExistingItems += 1;
            }
          } else {
            insert.run(
              randomUUID(),
              item.name,
              item.sku,
              category,
              price,
              gstRate,
              baseUnit,
              stock,
              minStock,
              stockTracked
            );
            existingSkus.add(item.sku);
            affectedSkus.add(item.sku);
            importedNewItems += 1;
          }
        } catch (error) {
          failedItems += 1;
          console.error(`Inventory import row ${item.index + 1} failed:`, error);
        }
      }
    });

    importItems();
    const affectedItems = [];
    for (let offset = 0; offset < [...affectedSkus].length; offset += 900) {
      const chunk = [...affectedSkus].slice(offset, offset + 900);
      const placeholders = chunk.map(() => '?').join(', ');
      affectedItems.push(...db.prepare(`SELECT id FROM Item WHERE sku IN (${placeholders})`).all(...chunk));
    }
    const affectedIds = new Set(affectedItems.map((item) => item.id));
    const importedItems = getItemsWithMaterials().filter((item) => affectedIds.has(item.id));
    res.json({
      success: true,
      items: importedItems,
      importedNewItems,
      updatedExistingItems,
      ignoredItems,
      failedItems,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/items/:id', (req, res) => {
  try {
    const { id } = req.params;
    const currentItem = db.prepare('SELECT * FROM Item WHERE id = ?').get(id);
    if (!currentItem) return res.status(404).json({ error: 'Inventory item not found.' });
    const {
      name, sku, category, price, gstRate, baseUnit, stock, minStock, stockTracked, isPackage,
      materialItemId = null, consumptionQuantity = 1, materials = [],
    } = req.body;
    const relationshipChanged =
      Object.prototype.hasOwnProperty.call(req.body, 'materialItemId') ||
      Object.prototype.hasOwnProperty.call(req.body, 'materials') ||
      Object.prototype.hasOwnProperty.call(req.body, 'isPackage');
    const packageItem =
      isPackage === undefined
        ? currentItem.isPackage === 1
        : isPackage === true || isPackage === 1;
    const resolvedBaseUnit = packageItem
      ? 'Package'
      : baseUnit === undefined
        ? currentItem.baseUnit || (currentItem.stockTracked ? 'Pieces' : 'Other')
        : String(baseUnit).trim() || 'Other';
    const shouldTrackStock =
      !packageItem &&
      isPieceUnit(resolvedBaseUnit) &&
      (stockTracked === undefined
        ? currentItem.stockTracked !== 0
        : stockTracked !== false && stockTracked !== 0);
    const updateItem = db.transaction(() => {
      db.prepare(`
        UPDATE Item SET name = ?, sku = ?, category = ?, price = ?, gstRate = ?,
          baseUnit = ?, stock = ?, minStock = ?, stockTracked = ?, isPackage = ?
        WHERE id = ?
      `).run(
        name ?? currentItem.name,
        sku ?? currentItem.sku,
        category ?? currentItem.category,
        price === undefined ? currentItem.price : Number(price) || 0,
        gstRate === undefined ? currentItem.gstRate : Number(gstRate) || 0,
        resolvedBaseUnit,
        shouldTrackStock ? Math.max(0, stock === undefined ? currentItem.stock : Number(stock) || 0) : 0,
        shouldTrackStock ? Math.max(0, minStock === undefined ? currentItem.minStock : Number(minStock) || 0) : 0,
        shouldTrackStock ? 1 : 0,
        packageItem ? 1 : 0,
        id
      );
      if (!relationshipChanged) return;
      db.prepare('DELETE FROM ItemMaterial WHERE finishedItemId = ?').run(id);
      const materialRows = Array.isArray(materials) && materials.length
        ? materials
        : materialItemId
          ? [{ materialItemId, quantity: consumptionQuantity }]
          : [];
      if (packageItem && materialRows.length === 0) {
          throw new Error('A package must contain at least one linked item.');
      }
      const addMaterial = db.prepare(
        'INSERT INTO ItemMaterial (id, finishedItemId, materialItemId, quantity) VALUES (?, ?, ?, ?)'
      );
      for (const material of materialRows) {
        if (material.materialItemId && material.materialItemId !== id) {
          const materialItem = db.prepare('SELECT id FROM Item WHERE id = ?').get(material.materialItemId);
          if (!materialItem) throw new Error('A linked inventory item does not exist.');
          addMaterial.run(randomUUID(), id, material.materialItemId, Math.max(0.001, Number(material.quantity) || 1));
        }
      }
    });
    updateItem();
    const updatedItem = getItemsWithMaterials().find((item) => item.id === id);
    res.json(updatedItem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/items/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM ItemMaterial WHERE finishedItemId = ? OR materialItemId = ?').run(req.params.id, req.params.id);
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
      if (existing.name.trim().toLowerCase() !== name.trim().toLowerCase()) {
        return res.status(409).json({
          error: 'Customer already exists.',
        });
      }

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

app.post('/api/customers/import', (req, res) => {
  try {
    const { customers = [], action = 'skip' } = req.body;
    if (!Array.isArray(customers)) {
      return res.status(400).json({ error: 'Customer import rows must be an array.' });
    }
    if (!['skip', 'update'].includes(action)) {
      return res.status(400).json({ error: 'Invalid existing customer action.' });
    }

    const normalizePhone = (phone) => {
      let cleanPhone = String(phone || '').replace(/\D/g, '');
      if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;
      return cleanPhone;
    };
    const findExisting = (name, phone) => {
      const cleanPhone = normalizePhone(phone);
      if (cleanPhone) {
        return db.prepare('SELECT * FROM Customer WHERE phone = ?').get(cleanPhone);
      }
      return db
        .prepare('SELECT * FROM Customer WHERE LOWER(name) = LOWER(?)')
        .get(name.trim());
    };

    const summary = {
      importedCustomers: 0,
      updatedCustomers: 0,
      skippedCustomers: 0,
      failedRows: 0,
    };

    const importCustomers = db.transaction(() => {
      for (const row of customers) {
        const name = String(row?.name || '').trim();
        const place = String(row?.place || '').trim();
        const cleanPhone = normalizePhone(row?.phone);

        if (!name) {
          summary.failedRows += 1;
          continue;
        }

        const existing = findExisting(name, cleanPhone);
        if (existing) {
          if (action === 'skip') {
            summary.skippedCustomers += 1;
            continue;
          }

          const targetPhone = cleanPhone || existing.phone;
          const conflictingCustomer = db
            .prepare('SELECT id FROM Customer WHERE phone = ? AND id != ?')
            .get(targetPhone, existing.id);
          if (conflictingCustomer) {
            summary.failedRows += 1;
            continue;
          }

          db.prepare(
            `UPDATE Customer
             SET name = ?, place = ?, phone = ?, updatedAt = CURRENT_TIMESTAMP
             WHERE id = ?`
          ).run(name, place, targetPhone, existing.id);
          summary.updatedCustomers += 1;
          continue;
        }

        const phoneKey = cleanPhone || `NAME:${name.toLowerCase()}`;
        const phoneConflict = db.prepare('SELECT id FROM Customer WHERE phone = ?').get(phoneKey);
        if (phoneConflict) {
          summary.failedRows += 1;
          continue;
        }

        db.prepare(
          `INSERT INTO Customer
           (id, name, place, phone, totalBilled, totalPaid, balance, lastInvoiceNo)
           VALUES (?, ?, ?, ?, 0, 0, 0, '')`
        ).run(randomUUID(), name, place, phoneKey);
        summary.importedCustomers += 1;
      }
    });

    importCustomers();
    const allCustomers = db
      .prepare('SELECT * FROM Customer ORDER BY balance DESC, updatedAt DESC')
      .all();
    res.json({ success: true, ...summary, customers: allCustomers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/customers/:id/place', (req, res) => {
  try {
    const customer = db.prepare('SELECT id FROM Customer WHERE id = ?').get(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });

    const place = String(req.body?.place || '').trim();
    db.prepare(
      'UPDATE Customer SET place = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(place, req.params.id);

    const updated = db.prepare('SELECT * FROM Customer WHERE id = ?').get(req.params.id);
    res.json({ success: true, customer: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- PAY CUSTOMER PENDING AMOUNT ---
app.post('/api/pay-customer-balance', async (req, res) => {
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

      db.prepare(
        `INSERT INTO CustomerPayment (id, customerId, amount) VALUES (?, ?, ?)`
      ).run(randomUUID(), customer.id, appliedPayment);
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

app.get('/api/customers/:id/ledger', (req, res) => {
  try {
    const customer = db.prepare('SELECT * FROM Customer WHERE id = ?').get(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });

    const billed = db
      .prepare(
        `SELECT invoiceNo, total AS amount, createdAt AS occurredAt
         FROM Sale
         WHERE customerPhone = ? OR LOWER(customerName) = LOWER(?)
         ORDER BY createdAt DESC`
      )
      .all(customer.phone, customer.name)
      .map((entry) => ({
        id: `sale-${entry.invoiceNo}`,
        type: 'billed',
        reference: entry.invoiceNo,
        amount: -Math.abs(Number(entry.amount || 0)),
        occurredAt: entry.occurredAt,
      }));

    const received = db
      .prepare(
        `SELECT id, amount, paidAt AS occurredAt
         FROM CustomerPayment
         WHERE customerId = ?
         ORDER BY paidAt DESC`
      )
      .all(customer.id)
      .map((entry) => ({
        id: entry.id,
        type: 'received',
        reference: 'Payment received',
        amount: Math.abs(Number(entry.amount || 0)),
        occurredAt: entry.occurredAt,
      }));

    res.json([...billed, ...received].sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    ));
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

app.get('/api/next-invoice-number', (req, res) => {
  try {
    const now = new Date();
    const dateKey = `${String(now.getDate()).padStart(2, '0')}${String(
      now.getMonth() + 1
    ).padStart(2, '0')}${now.getFullYear()}`;
    const prefix = `${dateKey}/`;
    const existing = db
      .prepare('SELECT invoiceNo FROM Sale WHERE invoiceNo LIKE ?')
      .all(`${prefix}%`);
    const highestSequence = existing.reduce((highest, sale) => {
      const match = String(sale.invoiceNo).match(new RegExp(`^${prefix}(\\d+)$`));
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0);

    res.json({
      invoiceNo: `${prefix}${String(highestSequence + 1).padStart(3, '0')}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function expandBillItems(items) {
  const expanded = [];
  const recipeByItem = new Map();
  const getRecipe = (itemId) => {
    if (!recipeByItem.has(itemId)) {
      recipeByItem.set(
        itemId,
        db
          .prepare(
          `SELECT m.materialItemId, m.quantity, i.name, i.price, i.gstRate, i.isPackage
             FROM ItemMaterial m
             JOIN Item i ON i.id = m.materialItemId
             WHERE m.finishedItemId = ?`
          )
          .all(itemId)
      );
    }
    return recipeByItem.get(itemId);
  };

  const appendChildren = (parent, quantity, packageName, ancestors, packageItemId) => {
    if (parent?.isPackage !== true && Number(parent?.isPackage) !== 1) return;
    if (ancestors.has(parent.id)) {
      throw new Error(`Circular package relationship detected at "${parent.name}".`);
    }
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(parent.id);
    for (const material of getRecipe(parent.id)) {
      const child = {
        id: material.materialItemId,
        name: `${material.name} (${packageName})`,
        price: Number(material.price) || 0,
        gstRate: Number(material.gstRate ?? 18),
        isPackage: material.isPackage,
        qty: quantity * Number(material.quantity),
        displayOnly: true,
        packageName,
        packageItemId,
      };
      expanded.push(child);
      appendChildren(
        { id: material.materialItemId, name: material.name, isPackage: material.isPackage },
        child.qty,
        packageName,
        nextAncestors,
        packageItemId
      );
    }
  };

  for (const rawItem of items.filter((item) => !item.displayOnly)) {
    const item = { ...rawItem, qty: Math.max(1, Number(rawItem.qty) || 1) };
    expanded.push(item);
    if (item.id && (item.isPackage === true || Number(item.isPackage) === 1)) {
      const dbItem = db.prepare('SELECT id, name, isPackage FROM Item WHERE id = ?').get(item.id);
      if (dbItem) appendChildren(dbItem, item.qty, dbItem.name, new Set(), dbItem.id);
    }
  }
  return expanded;
}

function getStockRequirements(items) {
  const requirements = new Map();
  const recipeCache = new Map();
  const stockItemCache = new Map();
  const getRecipe = (itemId) => {
    if (!recipeCache.has(itemId)) {
      recipeCache.set(
        itemId,
        db.prepare('SELECT materialItemId, quantity FROM ItemMaterial WHERE finishedItemId = ?').all(itemId)
      );
    }
    return recipeCache.get(itemId);
  };
  const getStockItem = (itemId) => {
    if (!stockItemCache.has(itemId)) {
      stockItemCache.set(
        itemId,
        db.prepare('SELECT stockTracked, baseUnit, isPackage FROM Item WHERE id = ?').get(itemId)
      );
    }
    return stockItemCache.get(itemId);
  };
  const addRequirement = (itemId, quantity, path = []) => {
    if (path.includes(itemId)) {
      throw new Error('Circular package relationship detected. Fix the linked items before billing.');
    }
    const recipe = getRecipe(itemId);
    if (recipe.length === 0) {
      const stockItem = getStockItem(itemId);
      if (!stockItem) {
        throw new Error('A linked inventory item no longer exists.');
      }
      if (isStockTrackedItem(stockItem)) {
        requirements.set(itemId, (requirements.get(itemId) || 0) + quantity);
      }
      return;
    }
    for (const material of recipe) {
      addRequirement(material.materialItemId, quantity * Number(material.quantity), [...path, itemId]);
    }
  };
  for (const item of items.filter((entry) => !entry.displayOnly)) {
    if (item.id) addRequirement(item.id, Math.max(1, Number(item.qty) || 1));
  }
  return requirements;
}

// --- COMPLETE BILL (GST INCLUDED IN ITEM PRICES) ---
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
      storeGstin = '33ABEFP8960D1Z7',
      storeAddress = '10/1.11/1 Parasakthi building upstairs Madrai road, Tirunelveli junction Tirunelveli',
      storePhone = '8754540404',
      upiId = 'photobooks@icici',
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Cannot complete an empty bill.' });
    }

    // Item prices include GST. Extract each item's selected GST rate without increasing the bill total.
    const billItems = items.filter((item) => !item.displayOnly);
    const calcGrandTotal = billItems.reduce(
      (sum, i) => sum + (Number(i.price) || 0) * (Number(i.qty) || 1),
      0
    );
    const calcSubtotal = billItems.reduce((sum, item) => {
      const lineTotal = (Number(item.price) || 0) * (Number(item.qty) || 1);
      return sum + lineTotal / (1 + (Number(item.gstRate ?? 18) / 100));
    }, 0);
    const calcTotalGst = calcGrandTotal - calcSubtotal;
    const calcCgst = calcTotalGst / 2;
    const calcSgst = calcTotalGst / 2;

    // 1. Resolve linked requirements and validate all consumed stock before side effects.
    let stockRequirements;
    let savedItems;
    try {
      stockRequirements = getStockRequirements(billItems);
      savedItems = expandBillItems(billItems);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    for (const [itemId, required] of stockRequirements) {
      const material = db.prepare(
        'SELECT id, name, stock, stockTracked, baseUnit, isPackage FROM Item WHERE id = ?'
      ).get(itemId);
      if (!material) {
        return res.status(400).json({ error: 'A linked inventory item no longer exists.' });
      }
      if (isStockTrackedItem(material) && material.stock < required) {
          return res.status(400).json({
            error: `Insufficient stock for "${material.name}". Required: ${required}, Available: ${material.stock}.`,
          });
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
        documentType: req.body.documentType === 'Sale' ? 'Sale' : 'Estimate',
        date: date || new Date().toLocaleDateString('en-IN'),
        customerName,
        customerPlace,
        customerPhone: cleanPhone || 'N/A',
        items: savedItems,
        subtotal: calcSubtotal,
        cgst: calcCgst,
        sgst: calcSgst,
        total: calcGrandTotal,
        paidAmount: 0,
        balanceAmount: calcGrandTotal,
        storeName,
        storeGstin,
        storeAddress,
        storePhone,
        upiId,
      },
      qrBuffer
    );

    // 4. Save PDF to Archive Folder
    const pdfFileName = `${invoiceNo}.pdf`;
    const fullPdfPath = path.join(archiveDir, pdfFileName);
    // Invoice numbers contain a date/sequence slash, so create the date folder first.
    fs.mkdirSync(path.dirname(fullPdfPath), { recursive: true });
    fs.writeFileSync(fullPdfPath, pdfBuffer);
    const publicPdfUrl = `/archives/${pdfFileName}`;

    // 5. Commit Sale & Update Customer
    const existing = db.prepare('SELECT * FROM Sale WHERE invoiceNo = ?').get(invoiceNo);
    let savedSale = existing;
    let billingCompleted = Boolean(existing);

    if (!existing) {
      const saleId = randomUUID();
      const executeCheckout = db.transaction(() => {
        db.prepare(
          `
          INSERT INTO Sale (id, invoiceNo, customerName, customerPlace, customerPhone, subtotal, total, paidAmount, balanceAmount, cgst, sgst, itemsJson, pdfPath, documentType, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 1)
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
          JSON.stringify(savedItems),
          publicPdfUrl,
          req.body.documentType === 'Sale' ? 'Sale' : 'Estimate'
        );

        for (const [itemId, required] of stockRequirements) {
          const deduction = db.prepare(
            `UPDATE Item
             SET stock = stock - ?
             WHERE id = ? AND stockTracked = 1
               AND LOWER(TRIM(baseUnit)) IN ('piece', 'pieces')
               AND isPackage = 0 AND stock >= ?`
          ).run(required, itemId, required);
          if (deduction.changes === 0) {
            const unavailable = db
              .prepare('SELECT name, stock, stockTracked, baseUnit, isPackage FROM Item WHERE id = ?')
              .get(itemId);
            if (!unavailable) {
              throw new Error('A linked inventory item no longer exists.');
            }
            if (isStockTrackedItem(unavailable)) {
              throw new Error(
                `Insufficient stock for "${unavailable.name}". Required: ${required}, Available: ${unavailable.stock}.`
              );
            }
          }
        }

        syncCustomerRecord(customerName, customerPlace, cleanPhone || 'N/A', invoiceNo);
      });

      executeCheckout();
      savedSale = db.prepare('SELECT * FROM Sale WHERE id = ?').get(saleId);
      billingCompleted = Boolean(savedSale);
    }

    if (!billingCompleted) {
      throw new Error(`Bill ${invoiceNo} was not committed; Google Drive upload was skipped.`);
    }

    const allCustomers = db
      .prepare('SELECT * FROM Customer ORDER BY balance DESC, updatedAt DESC')
      .all();

    const updatedItems = getItemsWithMaterials();
    res.json({
      success: true,
      sale: savedSale,
      customers: allCustomers,
      items: updatedItems,
      deductedMaterialIds: [...stockRequirements.keys()],
      pdfUrl: publicPdfUrl,
      googleDrivePending: true,
      whatsappPending: Boolean(sendWhatsApp),
      message: sendWhatsApp
        ? `${req.body.documentType === 'Sale' ? 'Sale bill' : 'Estimate'} #${invoiceNo} saved and will be sent to WhatsApp after printing, and added to ${customerName}'s pending balance!`
        : `${req.body.documentType === 'Sale' ? 'Sale bill' : 'Estimate'} #${invoiceNo} confirmed and added to ${customerName}'s pending balance!`,
    });

    setImmediate(async () => {
      try {
        const driveUrl = await uploadPdfToGoogleDrive(fullPdfPath, invoiceNo, date);
        if (driveUrl) {
          console.log(`PDF uploaded for ${invoiceNo}: ${driveUrl}`);
        } else {
          console.warn(`Google Drive PDF upload skipped for ${invoiceNo}.`);
        }
      } catch (driveError) {
        console.error(`Google Drive upload failed for ${invoiceNo}:`, driveError);
      }
    });
  } catch (err) {
    console.error('Complete bill error:', err);
    res.status(500).json({
      error: `Process failed: ${err.message}. Nothing was deducted or saved to the database.`,
    });
  }
});

app.post('/api/send-invoice-whatsapp', async (req, res) => {
  try {
    const invoiceNo = String(req.body?.invoiceNo || '').trim();
    if (!invoiceNo) return res.status(400).json({ error: 'Invoice number is required.' });
    await sendInvoicePdfToWhatsApp(invoiceNo);
    res.json({ success: true });
  } catch (err) {
    console.error(`WhatsApp invoice dispatch failed:`, err);
    res.status(500).json({ error: err.message });
  }
});

app.use((err, req, res, _next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'The uploaded data is too large. Split the spreadsheet into smaller files and try again.',
    });
  }
  console.error('Unhandled API error:', err);
  return res.status(500).json({ error: 'Unexpected server error.' });
});

app.use(express.static(path.join(__dirname, '../dist')));
app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, '../dist/index.html')));

const logDailyExport = (message) => {
  const entry = `${new Date().toISOString()} ${message}\n`;
  console.log(message);
  try {
    fs.appendFileSync(path.join(dataDir, 'scheduled-drive-exports.log'), entry);
  } catch (error) {
    console.error('Unable to write the scheduled export log:', error);
  }
};

const runDailyGoogleDriveExports = async (snapshotDate = new Date()) => {
  let succeeded = true;
  try {
    const balanceFileId = await uploadCustomerBalancesToGoogleDrive(snapshotDate);
    if (balanceFileId) {
      logDailyExport('6 PM customer balance snapshot uploaded to Google Drive.');
    } else {
      succeeded = false;
      logDailyExport('6 PM customer balance snapshot was not uploaded.');
    }
  } catch (balanceError) {
    succeeded = false;
    logDailyExport(`6 PM Google Drive customer balance export failed: ${balanceError.message}`);
  }

  try {
    const backupId = await uploadDatabaseBackupToGoogleDrive(snapshotDate);
    if (backupId) {
      logDailyExport('6 PM database backup uploaded to Google Drive.');
    } else {
      succeeded = false;
      logDailyExport('6 PM database backup was not uploaded.');
    }
  } catch (backupError) {
    succeeded = false;
    logDailyExport(`6 PM Google Drive database backup failed: ${backupError.message}`);
  }
  return succeeded;
};

const scheduleDailyGoogleDriveExports = () => {
  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setHours(18, 0, 0, 0);
  if (nextRun <= now) nextRun.setDate(nextRun.getDate() + 1);

  setTimeout(async () => {
    await runDailyGoogleDriveExports(new Date());
    scheduleDailyGoogleDriveExports();
  }, nextRun.getTime() - now.getTime());
};

if (process.env.RUN_SCHEDULED_DRIVE_EXPORTS === '1') {
  try {
    const succeeded = await runDailyGoogleDriveExports(new Date());
    if (!succeeded) process.exitCode = 1;
  } catch (error) {
    logDailyExport(`6 PM Google Drive export failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    db.close();
  }
} else {
  const PORT = Number(process.env.PORT) || 5000;
  const server = app.listen(PORT, () => console.log('Backend running on port ' + PORT));
  if (process.env.EXTERNAL_DAILY_EXPORT_SCHEDULER !== '1') {
    scheduleDailyGoogleDriveExports();
  }
  server.on('error', (err) => console.error('Server error:', err));
}