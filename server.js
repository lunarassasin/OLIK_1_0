const express = require('express');
const PDFDocument = require('pdfkit');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { toWords } = require('number-to-words');

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.post('/generate-pdf', (req, res) => {
    const data = req.body; // Expects sender, receiver, amt, date, txId
    const doc = new PDFDocument({ size: [800, 1200], margin: 0 });
    const fileName = `receipt_${data.txId}.pdf`;
    const filePath = path.join(__dirname, 'public', fileName);

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // --- Assets ---
    const logoPath = path.join(__dirname, 'assets', 'logo.png');
    const stampPath = path.join(__dirname, 'assets', 'cbe_stamp.png');

    // --- 1. HEADER ---
    doc.rect(20, 20, 760, 90).fill('#81007f');
    if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 30, { width: 70 });
    }
    doc.fillColor('white').font('Helvetica-Bold').fontSize(28).text('Commercial Bank of Ethiopia', 100, 45, { align: 'center', width: 660 });
    doc.fontSize(18).font('Helvetica').text('VAT Invoice / Customer Receipt', 100, 75, { align: 'center', width: 660 });

    // --- 2. ADDRESS & CUSTOMER INFO ---
    doc.fillColor('#333333').font('Helvetica-Bold').fontSize(14).text('Company Address & Other Information', 30, 140);
    doc.text('Customer Information', 430, 140);

    doc.fontSize(12).font('Helvetica');
    // Left Grid
    const leftGrid = [
        ['Country:', 'Ethiopia'], ['City:', 'Addis Ababa'], 
        ['SWIFT Code:', 'CBETETAA'], ['Tin:', '0000000868'],
        ['VAT Receipt No:', data.txId]
    ];
    leftGrid.forEach((row, i) => {
        doc.fillColor('#333').text(row[0], 30, 165 + (i * 20));
        doc.fillColor('#000').text(row[1], 170, 165 + (i * 20));
    });

    // Right Grid
    const rightGrid = [
        ['Customer Name:', data.sender], ['City:', 'Addis Ababa'],
        ['Branch:', 'BISHOFTU MENANERIA BR']
    ];
    rightGrid.forEach((row, i) => {
        doc.fillColor('#333').text(row[0], 430, 165 + (i * 20));
        doc.fillColor('#000').text(row[1], 570, 165 + (i * 20));
    });

    // --- 3. PAYMENT INFORMATION BOX ---
    doc.rect(20, 410, 760, 505).lineWidth(1.5).stroke('#81007f');
    doc.fillColor('#81007f').font('Helvetica-Bold').fontSize(22).text('Payment / Transaction Information', 20, 435, { align: 'center', width: 760 });
    doc.moveTo(20, 455).lineTo(780, 455).lineWidth(1.5).stroke('#000');

    // --- 4. STAMP (Behind Text) ---
    if (fs.existsSync(stampPath)) {
        doc.save();
        doc.opacity(0.8);
        doc.rotate(-10, { origin: [380, 660] });
        doc.image(stampPath, 280, 580, { width: 200 });
        doc.restore();
    }

    // --- 5. TABLE DATA ---
    const amtNum = parseFloat(data.amt.replace(/,/g, ''));
    const commission = 3.00;
    const vat = 0.45;
    const total = amtNum + commission + vat;

    const tableData = [
        ['Payer', data.sender],
        ['Receiver', data.receiver],
        ['Payment Date & Time', data.date],
        ['Reference No.', data.txId],
        ['Transferred Amount', `${data.amt} ETB`],
        ['Commission', `${commission.toFixed(2)} ETB`],
        ['Total Debited', `${total.toLocaleString()} ETB`]
    ];

    tableData.forEach((row, i) => {
        const y = 485 + (i * 40);
        doc.fillColor('#333').font('Helvetica').fontSize(14).text(row[0], 40, y);
        doc.fillColor('#000').font('Helvetica-Bold').text(row[1], 760, y, { align: 'right' });
        doc.moveTo(40, y + 15).lineTo(760, y + 15).lineWidth(1).stroke('#000');
    });

    // --- 6. AMOUNT IN WORDS & QR MOCK ---
    doc.rect(180, 930, 440, 60).lineWidth(1.5).stroke('#81007f');
    doc.fillColor('#333').fontSize(14).text('Amount in Word', 60, 960);
    doc.fillColor('#000').text(`ETB ${toWords(total).toUpperCase()} CENTS`, 400, 960, { align: 'center', width: 440 });

    // Mock QR Code Box
    doc.rect(650, 920, 80, 80).lineWidth(1).stroke('#000');
    doc.fillColor('black').rect(675, 945, 30, 30).fill();

    // --- 7. FOOTER ---
    doc.rect(100, 1040, 600, 70).radius(10).lineWidth(1.5).stroke('#81007f');
    doc.fillColor('#81007f').font('Helvetica-Bold').fontSize(18).text('The Bank you can always rely on.', 100, 1060, { align: 'center', width: 600 });
    doc.fillColor('#333').font('Helvetica').fontSize(12).text('© 2025 Commercial Bank of Ethiopia. All rights reserved.', 100, 1085, { align: 'center', width: 600 });

    doc.end();

    stream.on('finish', () => {
        res.json({ url: `192.168.176.66:3000/public/${fileName}` });
    });
});

app.use('/public', express.static('public'));
app.listen(3000, () => console.log('Server running on port 3000'));