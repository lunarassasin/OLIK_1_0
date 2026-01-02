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

    if (!txId) return res.status(400).json({ error: "Transaction ID is required" });

    try {
        const [rows] = await db.execute('SELECT * FROM transactions WHERE txId = ?', [txId]);
        if (rows.length === 0) return res.status(404).json({ error: "Transaction record not found" });

        const data = rows[0];
        // CHANGE: Standard Letter size (612 x 792)
        const doc = new PDFDocument({ size: 'LETTER', margin: 20 }); 
        const fileName = `receipt_${data.txId}.pdf`;
        const filePath = path.join(publicDir, fileName);
        const stream = fs.createWriteStream(filePath);

        doc.pipe(stream);

        const logoPath = path.join(__dirname, 'assets', 'logo.png');
        const stampPath = path.join(__dirname, 'assets', 'cbe_stamp.png');

        // --- HEADER (Adjusted widths for 612px page) ---
        doc.rect(20, 20, 572, 70).fill('#81007f'); // 612 - 40 = 572
        if (fs.existsSync(logoPath)) {
            doc.image(logoPath, 40, 30, { width: 50 });
        }
        doc.fillColor('white').font('Helvetica-Bold').fontSize(18).text('Commercial Bank of Ethiopia', 60, 35, { align: 'center', width: 512 });
        doc.fontSize(14).font('Helvetica').text('VAT Invoice / Customer Receipt', 60, 60, { align: 'center', width: 512 });

        // --- INFO GRIDS ---
        doc.fillColor('#333333').font('Helvetica-Bold').fontSize(10).text('Company Address & Info', 30, 110);
        doc.text('Customer Information', 320, 110);

        const leftGrid = [
            ['Country:', 'Ethiopia'], ['City:', 'Addis Ababa'], 
            ['Address:', 'Ras Desta Damtew St, 01'], ['Postal code:', '255'],
            ['SWIFT Code:', 'CBETETAA'], ['Email:', 'info@cbe.com.et'],
            ['TIN:', '0000000868'], ['VAT Receipt No:', data.txId]
        ];
        leftGrid.forEach((row, i) => {
            doc.fillColor('#333').font('Helvetica').fontSize(9).text(row[0], 30, 130 + (i * 15));
            doc.fillColor('#000').font('Helvetica-Bold').text(row[1], 110, 130 + (i * 15));
        });

        const rightGrid = [
            ['Customer Name:', data.sender], ['Region:', '-'],
            ['City:', 'YEKAWOREDA.6'], ['Sub City:', '-'],
            ['Branch:', 'BISHOFTU MENANERIA'], ['VAT Reg Date:', '20024026']
        ];
        rightGrid.forEach((row, i) => {
            doc.fillColor('#333').font('Helvetica').fontSize(9).text(row[0], 320, 130 + (i * 15));
            doc.fillColor('#000').font('Helvetica-Bold').text(row[1], 440, 130 + (i * 15));
        });

        // --- PAYMENT BOX ---
        const boxY = 270;
        doc.rect(20, boxY, 572, 360).lineWidth(1).stroke('#81007f');
        doc.fillColor('#81007f').font('Helvetica-Bold').fontSize(14).text('Payment / Transaction Information', 20, boxY + 15, { align: 'center', width: 572 });
        doc.moveTo(20, boxY + 35).lineTo(592, boxY + 35).lineWidth(1).stroke('#81007f');

        // --- STAMP (Centered in the box) ---
        if (fs.existsSync(stampPath)) {
            doc.save().opacity(0.7).rotate(-10, { origin: [300, 450] })
               .image(stampPath, 220, 400, { width: 150 })
               .restore();
        }

        // --- CALCULATIONS ---
        const amtNum = parseFloat(data.amt) || 0;
        const commission = 3.00;
        const vatAmount = commission * 0.15;
        const total = amtNum + commission + vatAmount;

        const tableData = [
            ['Payer', data.sender],
            ['Receiver', data.receiver],
            ['Account', `1****${data.account}`],
            ['Payment Date', data.tx_date.toLocaleString()],
            ['Reference No.', data.txId],
            ['Transferred Amount', `${amtNum.toLocaleString()} ETB`],
            ['Service Charge', `${commission.toFixed(2)} ETB`],
            ['15% VAT', `${vatAmount.toFixed(2)} ETB`],
            ['Total Debited', `${total.toLocaleString()} ETB`]
        ];

        tableData.forEach((row, i) => {
            const y = (boxY + 50) + (i * 30);
            doc.fillColor('#333').font('Helvetica').fontSize(11).text(row[0], 40, y);
            doc.fillColor('#000').font('Helvetica-Bold').fontSize(11).text(row[1], 300, y, { align: 'right', width: 270 });
            doc.moveTo(30, y + 18).lineTo(582, y + 18).lineWidth(0.5).stroke('#CCCCCC');
        });

        // --- AMOUNT IN WORDS ---
        const cents = Math.round((total % 1) * 100);
        const centsText = cents > 0 ? ` & ${toWords(cents).toUpperCase()} CENTS` : " ONLY";
        const wordsY = 650;
        doc.rect(150, wordsY, 400, 40).lineWidth(1).stroke('#81007f');
        doc.fillColor('#333').font('Helvetica').fontSize(10).text('Amount in Words:', 30, wordsY + 15);
        doc.fillColor('#000').font('Helvetica-Bold').fontSize(9).text(`ETB ${toWords(Math.floor(total)).toUpperCase()}${centsText}`, 155, wordsY + 15, { align: 'center', width: 390 });

        // --- FOOTER ---
        doc.roundedRect(100, 710, 412, 50, 5).lineWidth(1).stroke('#81007f');
        doc.fillColor('#81007f').font('Helvetica-Bold').fontSize(12).text('The Bank you can always rely on.', 100, 720, { align: 'center', width: 412 });
        doc.fillColor('#333').font('Helvetica').fontSize(8).text('© 2026 Commercial Bank of Ethiopia', 100, 740, { align: 'center', width: 412 });

        doc.end();

        stream.on('finish', () => {
            const protocol = req.headers['x-forwarded-proto'] || 'http';
            res.json({ success: true, url: `${protocol}://${req.headers.host}/public/${fileName}` });
        });

    } catch (err) {
        console.error(err);
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