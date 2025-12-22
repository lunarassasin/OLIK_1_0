import mysql from 'mysql2';
import dotenv from 'dotenv';

dotenv.config();

// Create the connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0 
});

// Convert pool.query to use async/await syntax
export const db = pool.promise();

/**
 * Function to test the database connection
 */
export const getConnection = async () => {
  return db.getConnection();
};

