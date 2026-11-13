/**
 * SnapPhrase v1.7.0 — Cryptography Engine
 * AES-256-CBC + PBKDF2-SHA256 (100,000 rounds) + HMAC-SHA256 + Base64
 * 100% byte-compatible with bausteine.ini formats (SPENC2:, STENC2:, QTENC2:, TSENC2:, QTENC:, TSENC:)
 */

const crypto = require('crypto');

const PBKDF2_ITERATIONS = 100000;

class AES256 {
  /**
   * Encrypts plaintext using AES-256-CBC, PBKDF2 (100k rounds), and HMAC-SHA256 integrity check.
   * Format: Base64( Salt[16] | HMAC[32] | IV[16] | Ciphertext[n] )
   */
  static encrypt(plaintext, password) {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(16);

    // Derive 64 bytes: 32 for AES-256, 32 for HMAC-SHA256
    const derivedKey = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 64, 'sha256');
    const aesKey = derivedKey.subarray(0, 32);
    const hmacKey = derivedKey.subarray(32, 64);

    const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    // HMAC covers: Salt[16] + IV[16] + Ciphertext[n]
    const hmac = crypto.createHmac('sha256', hmacKey)
      .update(Buffer.concat([salt, iv, ciphertext]))
      .digest();

    // Result: Salt[16] + HMAC[32] + IV[16] + Ciphertext
    const combined = Buffer.concat([salt, hmac, iv, ciphertext]);
    return combined.toString('base64');
  }

  /**
   * Decrypts ciphertext with password.
   * Supports version 2 (PBKDF2 + HMAC) and legacy version 1 (SHA-256 key).
   */
  static decrypt(base64Text, password, version = 2) {
    const combined = Buffer.from(base64Text, 'base64');

    if (version === 2) {
      if (combined.length < 80) {
        throw new Error('Ungültige Chiffretext-Länge');
      }

      const salt = combined.subarray(0, 16);
      const expectedHmac = combined.subarray(16, 48);
      const iv = combined.subarray(48, 64);
      const ciphertext = combined.subarray(64);

      const derivedKey = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 64, 'sha256');
      const aesKey = derivedKey.subarray(0, 32);
      const hmacKey = derivedKey.subarray(32, 64);

      const actualHmac = crypto.createHmac('sha256', hmacKey)
        .update(Buffer.concat([salt, iv, ciphertext]))
        .digest();

      if (!crypto.timingSafeEqual(expectedHmac, actualHmac)) {
        throw new Error('HMAC mismatch - falsches Passwort oder beschädigte Datei');
      }

      const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return decrypted.toString('utf8');
    }

    // Legacy Version 1 (TSENC / QTENC)
    if (combined.length < 16) {
      throw new Error('Ungültige Chiffretext-Länge');
    }

    const iv = combined.subarray(0, 16);
    const ciphertext = combined.subarray(16);
    const aesKey = crypto.createHash('sha256').update(password, 'utf8').digest();

    const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  }
}

module.exports = AES256;
