'use strict';

const crypto = require('node:crypto');

function generateKey() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashKey(key) {
  const value = String(key || '');
  if (!value) throw new Error('Device Key vacía');

  const salt = crypto.randomBytes(16);
  const digest = crypto.scryptSync(value, salt, 32);

  return [
    'scrypt',
    salt.toString('base64url'),
    digest.toString('base64url'),
  ].join('$');
}

function verifyKey(key, encoded) {
  try {
    const value = String(key || '');
    const parts = String(encoded || '').split('$');

    if (!value || parts.length !== 3 || parts[0] !== 'scrypt') {
      return false;
    }

    const salt = Buffer.from(parts[1], 'base64url');
    const expected = Buffer.from(parts[2], 'base64url');
    const actual = crypto.scryptSync(value, salt, expected.length);

    return (
      actual.length === expected.length &&
      crypto.timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}

module.exports = {
  generateKey,
  hashKey,
  verifyKey,
};
