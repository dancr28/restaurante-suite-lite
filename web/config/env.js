'use strict';
require('dotenv').config();
function integer(name, fallback, min = 1, max = 65535) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error('Configuración inválida: ' + name);
  return value;
}
const config = {
  port: integer('PORT', 3085),
  host: process.env.HOST || '127.0.0.1',
  nodeEnv: process.env.NODE_ENV || 'development',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: integer('DB_PORT', 3306),
    user: process.env.DB_USER || 'ops_lab',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'restaurante_lab',
  },
  printer: {
    enabled: process.env.PRINTER_ENABLED === 'true',
    ip: process.env.PRINTER_IP || '',
    port: integer('PRINTER_PORT', 9100),
  },
  whatsapp: {
    enabled: process.env.WHATSAPP_ENABLED === 'true',
    url: process.env.WHATSAPP_URL || '',
    recipient: process.env.WHATSAPP_RECIPIENT || '',
  },
  botToken: process.env.BOT_SHARED_TOKEN || '',
  botUrl: process.env.BOT_URL || 'http://127.0.0.1:3086',
  deviceToken: process.env.DEVICE_TOKEN || '',
  pinSecret: process.env.PIN_SECRET || '',
  secureCookies: process.env.COOKIE_SECURE === 'true',
};
if (config.pinSecret.length < 32)
  throw new Error('PIN_SECRET requiere al menos 32 caracteres. Ejecuta npm run setup.');
process.env.TZ = process.env.TZ || 'America/Mexico_City';
module.exports = config;
