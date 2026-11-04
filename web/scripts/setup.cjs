const fs = require('node:fs'),
  { randomBytes } = require('node:crypto');
if (fs.existsSync('.env')) {
  console.error('.env ya existe. No se modificó.');
  process.exitCode = 1;
} else {
  const secret = () => randomBytes(32).toString('hex');
  const pin = String(require('node:crypto').randomInt(1000, 10000));
  fs.writeFileSync(
    '.env',
    [
      'COMPOSE_PROJECT_NAME=restaurante_ops_lab',
      'PORT=3085',
      'HOST=127.0.0.1',
      'NODE_ENV=production',
      'TZ=America/Mexico_City',
      'DB_HOST=127.0.0.1',
      'DB_PORT=3306',
      'DB_NAME=restaurante_lab',
      'DB_USER=ops_lab',
      'DB_PASSWORD=' + secret(),
      'MARIADB_ROOT_PASSWORD=' + secret(),
      'PIN_SECRET=' + secret(),
      'ADMIN_PIN=' + pin,
      'BOT_SHARED_TOKEN=' + secret(),
      'BOT_URL=http://127.0.0.1:3086',
      'PRINTER_ENABLED=false',
      'PRINTER_IP=',
      'PRINTER_PORT=9100',
      'WHATSAPP_ENABLED=false',
      'WHATSAPP_URL=',
      'WHATSAPP_RECIPIENT=',
      'DEVICE_TOKEN=' + secret(),
      'COOKIE_SECURE=false',
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  console.log('.env creado. Tu PIN de administrador está en ADMIN_PIN. No compartas este archivo.');
}
