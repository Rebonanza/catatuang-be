import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly aesKey: Buffer;

  constructor(private readonly configService: ConfigService) {
    const secret =
      this.configService.get<string>('JWT_SECRET') || 'super-secret-key';
    this.aesKey = crypto.createHash('sha256').update(secret).digest();
  }

  encrypt(text: string): string {
    if (!text) return '';

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.aesKey, iv);

    let enc = cipher.update(text, 'utf8', 'hex');
    enc += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${authTag}:${enc}`;
  }

  decrypt(encryptedText: string): string {
    if (!encryptedText) return '';

    try {
      const [ivHex, authTagHex, encHex] = encryptedText.split(':');
      if (!ivHex || !authTagHex || !encHex) return '';

      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      const decipher = crypto.createDecipheriv(this.algorithm, this.aesKey, iv);
      decipher.setAuthTag(authTag);

      let dec = decipher.update(encHex, 'hex', 'utf8');
      dec += decipher.final('utf8');

      return dec;
    } catch (error) {
      // If decryption fails, it might be due to wrong key or corrupted data
      // In this system, we log the error but we might return empty if it's transient
      return '';
    }
  }
}
