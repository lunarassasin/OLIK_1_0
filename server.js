const express = require('express');
const PDFDocument = require('pdfkit');
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./config/db.js'); 
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
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

    if (!txId) return res.status(400).json({ error: "Transaction ID is required" });

    try {
        const [rows] = await db.execute('SELECT * FROM transactions WHERE txId = ?', [txId]);
        if (rows.length === 0) return res.status(404).json({ error: "Transaction record not found" });

        const data = rows[0];
        // LETTER SIZE: 612 x 792 points
        const doc = new PDFDocument({ size: 'LETTER', margin: 30 }); 
        const fileName = `receipt_${data.txId}.pdf`;
        const filePath = path.join(publicDir, fileName);
        const stream = fs.createWriteStream(filePath);

        doc.pipe(stream);

        const logoPath = path.join(__dirname, 'assets', 'logo.png');
        const stampPath = path.join(__dirname, 'assets', 'cbe_stamp.png');

        // 1. HEADER (Purple Banner)
        doc.rect(30, 30, 552, 50).fill('#81007f');
        if (fs.existsSync(logoPath)) {
            doc.image(logoPath, 45, 38, { width: 35 });
        }
        doc.fillColor('white').font('Helvetica-Bold').fontSize(14).text('Commercial Bank of Ethiopia', 80, 40);
        doc.font('Helvetica').fontSize(9).text('VAT Invoice / Customer Receipt', 80, 58);

        // 2. INFO GRIDS (Left & Right)
        const topY = 100;
        doc.fillColor('#000').font('Helvetica-Bold').fontSize(9).text('Company Address & Other Information', 30, topY);
        doc.text('Customer Information', 320, topY);

        const leftGrid = [
            ['Country:', 'Ethiopia'], ['City:', 'Addis Ababa'], 
            ['Address:', 'Ras Desta Damtew St, 01, Kirkos'], ['Postal code:', '255'],
            ['SWIFT Code:', 'CBETETAA'], ['Email:', 'info@cbe.com.et'],
            ['Tel:', '251-551-42-04'], ['Fax:', '251-551-43-24'],
            ['Tin:', '0000000868'], ['VAT Receipt No:', data.txId],
            ['VAT Registration No:', '011140'], ['VAT Registration Date', '01/01/2003']
        ];
        
        const rightGrid = [
            ['Customer Name:', data.sender.toUpperCase()], ['Region:', '-'],
            ['City:', 'YEKAWOREDA.6'], ['Sub City:', '-'], 
            ['Wereda/Kebele:', '-'], ['VAT Registration No:', '-'], 
            ['VAT Registration Date', '20024026'], ['TIN ( TAX ID):', '-'], 
            ['Branch:', 'BISHOFTU MENANERIA BR']
        ];

        leftGrid.forEach((row, i) => {
            const y = (topY + 18) + (i * 11);
            doc.fillColor('#555').font('Helvetica').fontSize(7.5).text(row[0], 30, y);
            doc.fillColor('#000').font('Helvetica-Bold').text(row[1], 110, y);
        });

        rightGrid.forEach((row, i) => {
            const y = (topY + 18) + (i * 11);
            doc.fillColor('#555').font('Helvetica').fontSize(7.5).text(row[0], 320, y);
            doc.fillColor('#000').font('Helvetica-Bold').text(row[1], 420, y);
        });

        // 3. PAYMENT BOX
        const boxY = 245;
        doc.rect(30, boxY, 552, 280).lineWidth(0.5).stroke('#81007f');
        doc.fillColor('#81007f').font('Helvetica-Bold').fontSize(11).text('Payment / Transaction Information', 30, boxY + 10, { align: 'center', width: 552 });
        doc.moveTo(30, boxY + 25).lineTo(582, boxY + 25).lineWidth(0.5).stroke('#81007f');

        // STAMP
        if (fs.existsSync(stampPath)) {
            doc.save().opacity(0.7).rotate(-5, { origin: [300, 380] })
               .image(stampPath, 240, 340, { width: 110 }).restore();
        }

        // CALCULATIONS
        const amtNum = parseFloat(data.amt) || 0;
        const commission = 3.00;
        const vatAmount = commission * 0.15;
        const total = amtNum + commission + vatAmount;

        const table = [
            ['Payer', data.sender.toUpperCase()],
            ['Account', '1****9034'],
            ['Receiver', data.receiver.toUpperCase()],
            ['Account', `1****${data.account}`],
            ['Payment Date & Time', data.tx_date.toLocaleString()],
            ['Reference No.', data.txId],
            ['Reason / Type of service', 'SGS done via Mobile'],
            ['Transferred Amount', `${amtNum.toLocaleString(undefined, {minimumFractionDigits: 2})} ETB`],
            ['Commission or Service Charge', `${commission.toFixed(2)} ETB`],
            ['15% VAT on Commission', `${vatAmount.toFixed(2)} ETB`],
            ['Total amount debited', `${total.toLocaleString(undefined, {minimumFractionDigits: 2})} ETB`]
        ];

        table.forEach((row, i) => {
            const rowY = (boxY + 35) + (i * 22);
            doc.fillColor('#444').font('Helvetica').fontSize(9).text(row[0], 45, rowY);
            doc.fillColor('#000').font('Helvetica-Bold').text(row[1], 300, rowY, { align: 'right', width: 265 });
            if (i < table.length - 1) {
                doc.moveTo(40, rowY + 16).lineTo(570, rowY + 16).lineWidth(0.1).stroke('#CCCCCC');
            }
        });

        // 4. WORDS & QR CODE
        const footerY = 545;
        doc.fillColor('#444').font('Helvetica').fontSize(8.5).text('Amount in Word', 45, footerY + 12);
        doc.rect(130, footerY, 280, 35).lineWidth(0.5).stroke('#81007f');
        
        const cents = Math.round((total % 1) * 100);
        const centsText = cents > 0 ? ` & ${toWords(cents).toUpperCase()} CENTS` : " ONLY";
        const words = `ETB ${toWords(Math.floor(total)).toUpperCase()}${centsText}`;
        doc.fillColor('#000').font('Helvetica-Bold').fontSize(7.5).text(words, 135, footerY + 12, { align: 'center', width: 270 });

        // Generate QR Code dynamically
        const qrDataURL = await QRCode.toDataURL(data.txId);
        doc.image(qrDataURL, 435, footerY - 5, { width: 55 });

        // 5. FOOTER
        doc.rect(100, 620, 412, 40).lineWidth(0.5).stroke('#81007f');
        doc.fillColor('#81007f').font('Helvetica-Bold').fontSize(10).text('The Bank you can always rely on.', 100, 630, { align: 'center', width: 412 });
        doc.fillColor('#555').font('Helvetica').fontSize(7.5).text('© 2026 Commercial Bank of Ethiopia. All rights reserved.', 100, 645, { align: 'center', width: 412 });

        doc.end();

        stream.on('finish', () => {
            const protocol = req.headers['x-forwarded-proto'] || 'http';
            res.json({ success: true, url: `${protocol}://${req.headers.host}/public/${fileName}` });
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