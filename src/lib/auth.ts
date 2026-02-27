import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// ============================================
// UTILITY FUNCTIONS FOR AUTHENTICATION
// ============================================

/**
 * Hash password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Compare password with hashed password
 */
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

/**
 * Generate JWT token
 */
export function generateToken(payload: { userId: string; username: string; role: string }): string {
  const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): any {
  try {
    const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    return jwt.verify(token, secret);
  } catch (error) {
    return null;
  }
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  return { valid: true };
}

/**
 * Sanitize username (prevent SQL injection)
 */
export function sanitizeUsername(username: string): string {
  return username.trim().replace(/[^\w@.-]/g, '');
}
