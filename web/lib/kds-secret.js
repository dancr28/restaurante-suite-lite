const {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} = require('node:crypto');

function getKey() {
  const secret = process.env.KDS_MASTER_KEY;

  if (!secret || secret.length < 32) {
    throw new Error('KDS_MASTER_KEY no está configurada');
  }

  return createHash('sha256').update(secret).digest();
}

function encrypt(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Clave KDS inválida');
  }

  const iv = randomBytes(12);

  const cipher = createCipheriv(
    'aes-256-gcm',
    getKey(),
    iv,
  );

  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

function decrypt(value) {
  const parts = String(value || '').split('.');

  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Clave KDS almacenada inválida');
  }

  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  const encrypted = Buffer.from(parts[3], 'base64url');

  const decipher = createDecipheriv(
    'aes-256-gcm',
    getKey(),
    iv,
  );

  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString('utf8');
}

module.exports = {
  encrypt,
  decrypt,
};