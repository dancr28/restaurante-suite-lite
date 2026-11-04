const mysql = require('mysql2/promise');
const config = require('./env');
module.exports = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 8,
  queueLimit: 100,
  connectTimeout: 5000,
  charset: 'utf8mb4',
});
