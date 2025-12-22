const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    // Add these to ensure it stays connected to Render/External DBs
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// THIS IS THE FIX: It converts the callback pool into a Promise pool
module.exports = pool.promise();