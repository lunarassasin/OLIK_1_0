const express = require('express');
const PDFDocument = require('pdfkit');
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./config/db.js'); 
const fs = require('fs');
const path = require('path');
const { toWords } = require('number-to-words');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir);
}

// Serve public files (PDFs) statically
app.use('/public', express.static(publicDir));

// --- 1. SAVE TRANSACTION (Table: transactions) ---
app.post('/save_transaction', async (req, res) => {
    const { sender, receiver, last4, amt, fullTimestamp, tid } = req.body;

    const sql = `INSERT INTO transactions (sender, receiver, account, amt, tx_date, txId) 
                 VALUES (?, ?, ?, ?, ?, ?)`;

    try {
        const [result] = await db.execute(sql, [sender, receiver, last4, amt, fullTimestamp, tid]);
        
        res.status(201).json({
            status: "success",
            message: "Transaction logged",
            affectedRows: result.affectedRows
        });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: "Transaction ID already exists" });
        }
        console.error("Database Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// --- 2. GET TRANSACTION DETAIL (Table: transactions) ---
app.get('/transactions/detail/:txId', async (req, res) => {
    const { txId } = req.params;

    const sql = `SELECT * FROM transactions WHERE txId = ?`;

    try {
        const [rows] = await db.execute(sql, [txId]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Transaction not found." });
        }

        res.status(200).json({
            status: "success",
            data: rows[0]
        });
    } catch (err) {
        console.error("Fetch Error:", err);
        res.status(500).json({ error: "Could not retrieve transaction" });
    }
});

// --- 3. GENERATE PDF (Table: transactions) ---
app.post('/generate-pdf', async (req, res) => {
    const { txId } = req.body;

    if (!txId) {
        return res.status(400).json({ error: "Transaction ID is required" });
    }

    try {
        const [rows] = await db.execute('SELECT * FROM transactions WHERE txId = ?', [txId]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: "Transaction record not found in database" });
        }

        const data = rows[0];
        const doc = new PDFDocument({ size: [612, 792], margin: 0 });
        const fileName = `receipt_${data.txId}.pdf`;
        const filePath = path.join(publicDir, fileName);
        const stream = fs.createWriteStream(filePath);

        doc.pipe(stream);

        const logoPath = path.join(__dirname, 'assets', 'logo.png');
        const stampPath = path.join(__dirname, 'assets', 'cbe_stamp.png');

        // HEADER
        doc.rect(20, 20, 760, 90).fill('#81007f');
        if (fs.existsSync(logoPath)) {
            doc.image(logoPath, 80, 30, { width: 70 });
        }
        doc.fillColor('white').font('Helvetica').fontSize(28).text('Commercial Bank of Ethiopia', 100, 30, { align: 'center', width: 660 });
        doc.fontSize(23).font('Helvetica').text('VAT Invoice / Customer Receipt', 100, 65, { align: 'center', width: 660 });

        // INFO GRIDS
        doc.fillColor('#333333').font('Helvetica').fontSize(14).text('Company Address & Other Information', 30, 140);
        doc.text('Customer Information', 430, 140);

        const leftGrid = [
            ['Country:', 'Ethiopia'], ['City:', 'Addis Ababa'], 
            ['Address:', 'Ras Desta Damtew St, 01, Kirkos'], ['Postal code:', '255'],
            ['SWIFT Code:', 'CBETETAA'], ['Email:', 'info@cbe.com.et'],
            ['Tel:', '251-551-42-04'], ['Fax:', '251-551-43-24'],
            ['Tin:', '0000000868'], ['VAT Receipt No:', data.txId],
            ['VAT Registration No:', '011140'], ['VAT Registration Date', '01/01/2003']
        ];
        leftGrid.forEach((row, i) => {
            doc.fillColor('#333').font('Helvetica').fontSize(11).text(row[0], 30, 165 + (i * 20));
            doc.fillColor('#000').font('Helvetica').text(row[1], 150, 165 + (i * 20));
        });

        const rightGrid = [
            ['Customer Name:', data.sender], ['Region:', '-'],
            ['City:', 'YEKAWOREDA.6'],
            ['Sub City:', '-'], ['Wereda/Kebele:', '-'],
            ['VAT Registration No:', '-'], ['VAT Registration Date', '20024026'],
            ['TIN ( TAX ID):', '-'], ['Branch:', 'BISHOFTU MENANERIA BR']
        ];
        rightGrid.forEach((row, i) => {
            doc.fillColor('#333').font('Helvetica').fontSize(11).text(row[0], 430, 165 + (i * 20));
            doc.fillColor('#000').font('Helvetica').text(row[1], 570, 165 + (i * 20));
        });

        // PAYMENT BOX
        doc.rect(20, 410, 760, 495).lineWidth(1.5).stroke('#81007f');
        doc.fillColor('#81007f').font('Helvetica').fontSize(22).text('Payment / Transaction Information', 20, 430, { align: 'center', width: 760 });
        doc.moveTo(20, 455).lineTo(780, 455).lineWidth(1.5).stroke('#000');

        // STAMP
        if (fs.existsSync(stampPath)) {
            doc.save();
            doc.opacity(1);
            doc.rotate(-10, { origin: [400, 660] });
            doc.image(stampPath, 300, 560, { width: 200 });
            doc.restore();
        }

        // CALCULATIONS
        const amtNum = parseFloat(data.amt) || 0;
        const commission = 3.00;
        const vatAmount = commission * 0.15;
        const total = amtNum + commission + vatAmount;

        const tableData = [
            ['Payer', data.sender],
            ['Account', '1****9034'],
            ['Receiver', data.receiver],
            ['Account', `1****${data.account}`],
            ['Payment Date & Time', data.tx_date.toLocaleString()],
            ['Reference No. (VAT Invoice No)', data.txId],
            ['Reason / Type of service', 'SGS done via Mobile'],
            ['Transferred Amount', `${amtNum.toLocaleString(undefined, {minimumFractionDigits: 2})} ETB`],
            ['Commission or Service Charge', `${commission.toFixed(2)} ETB`],
            ['15% VAT on Commission', `${vatAmount.toFixed(2)} ETB`],
            ['Total amount debited', `${total.toLocaleString(undefined, {minimumFractionDigits: 2})} ETB`]
        ];

        tableData.forEach((row, i) => {
            const y = 475 + (i * 40);
            doc.fillColor('#333').font('Helvetica').fontSize(15).text(row[0], 60, y);
            doc.fillColor('#000').font('Helvetica').fontSize(15).text(row[1], 400, y, { align: 'right', width: 360 });
            doc.moveTo(20, y + 18).lineTo(780, y + 18).lineWidth(1.5).stroke('#333');
        });

        // WORDS
        const cents = Math.round((total % 1) * 100);
        const centsText = cents > 0 ? ` & ${toWords(cents).toUpperCase()} CENTS` : " ONLY";
        doc.rect(180, 930, 440, 60).lineWidth(1.5).stroke('#81007f');
        doc.fillColor('#333').font('Helvetica').fontSize(14).text('Amount in Word', 60, 955);
        doc.fillColor('#000').font('Helvetica').fontSize(11).text(`ETB ${toWords(Math.floor(total)).toUpperCase()}${centsText}`, 180, 955, { align: 'center', width: 440 });

        // FOOTER
        doc.roundedRect(100, 1040, 600, 70, 10).lineWidth(1.5).stroke('#81007f');
        doc.fillColor('#81007f').font('Helvetica').fontSize(18).text('The Bank you can always rely on.', 100, 1060, { align: 'center', width: 600 });
        doc.fillColor('#333').font('Helvetica').fontSize(12).text('© 2025 Commercial Bank of Ethiopia. All rights reserved.', 100, 1085, { align: 'center', width: 600 });

        doc.end();

        stream.on('finish', () => {
            const protocol = req.headers['x-forwarded-proto'] || 'http';
            const host = req.headers.host;
            res.json({ 
                success: true,
                url: `${protocol}://${host}/public/${fileName}` 
            });
        });

    } catch (err) {
        console.error("Critical PDF Error:", err);
        res.status(500).json({ error: "Failed to generate PDF" });
    }
});

// --- 4. GET RECEIPT LINK (Table: transactions) ---
app.get('/get-receipt-link/:txId', async (req, res) => {
    const { txId } = req.params;
    try {
        const [rows] = await db.execute('SELECT txId FROM transactions WHERE txId = ?', [txId]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: "Transaction not found." });

        const fileName = `receipt_${txId}.pdf`;
        const filePath = path.join(publicDir, fileName);

        if (fs.existsSync(filePath)) {
            const protocol = req.headers['x-forwarded-proto'] || 'http';
            const host = req.headers.host;
            res.status(200).json({ success: true, url: `${protocol}://${host}/public/${fileName}` });
        } else {
            res.status(404).json({ success: false, message: "PDF not yet generated." });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});