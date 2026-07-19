import { createHmac, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import type { NextFunction, Request, Response } from 'express';

const scrypt = promisify(scryptCallback);
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;

export interface AuthUser { id: string; email: string; name: string; role: 'patient' | 'admin'; }
interface StoredUser extends AuthUser { passwordHash?: string; passwordSalt?: string; provider?: 'password' | 'google' | 'apple'; createdAt: string; }
export interface ConsultationRecord { id: string; userId: string; reason: string; preferredDate: string; preferredTime: string; consultationType: 'video' | 'chat' | 'phone'; status: 'requested'; createdAt: string; }

// --- Postgres connection (Supabase-provisioned) ---
let pool: Pool | null = null;
let initPromise: Promise<void> | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
    if (!connectionString) throw new Error('POSTGRES_URL is required. Connect a Postgres database in Vercel Storage.');
    pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 5 });
  }
  return pool;
}

async function ensureSchema(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const client = getPool();
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'patient',
          password_hash TEXT,
          password_salt TEXT,
          provider TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS consultations (
          id UUID PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          reason TEXT NOT NULL,
          preferred_date TEXT NOT NULL,
          preferred_time TEXT NOT NULL,
          consultation_type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'requested',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS password_resets (
          token_hash TEXT PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at BIGINT NOT NULL
        );
      `);
    })();
  }
  return initPromise;
}

function sessionSecret(): string {
  const configured = process.env.AUTH_SESSION_SECRET;
  if (!configured && process.env.NODE_ENV === 'production') throw new Error('AUTH_SESSION_SECRET is required in production.');
  return configured || 'development-only-session-secret-change-before-deploy';
}

function normalizeEmail(value: unknown): string { return typeof value === 'string' ? value.trim().toLowerCase() : ''; }
function rowToPublicUser(row: any): AuthUser { return { id: row.id, email: row.email, name: row.name, role: row.role }; }
async function hashPassword(password: string, salt = randomBytes(16).toString('base64url')) { const hash = await scrypt(password, salt, 64) as Buffer; return { salt, hash: hash.toString('base64url') }; }
async function passwordsMatch(password: string, salt: string, expectedHash: string): Promise<boolean> { const { hash } = await hashPassword(password, salt); const expected = Buffer.from(expectedHash, 'base64url'); const actual = Buffer.from(hash, 'base64url'); return expected.length === actual.length && timingSafeEqual(expected, actual); }
function createSession(user: AuthUser): string { const payload = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + SESSION_TTL_MS })).toString('base64url'); return `${payload}.${createHmac('sha256', sessionSecret()).update(payload).digest('base64url')}`; }
function parseSession(token?: string): AuthUser | null {
  if (!token) return null; const [payload, signature] = token.split('.'); if (!payload || !signature) return null;
  const expected = createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  try { const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AuthUser & { exp: number }; return parsed.id && parsed.email && parsed.exp > Date.now() ? { id: parsed.id, email: parsed.email, name: parsed.name, role: parsed.role || 'patient' } : null; } catch { return null; }
}
function cookieValue(request: Request, name: string): string | undefined { return request.headers.cookie?.split(';').map((entry) => entry.trim()).find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1); }
export function setSession(response: Response, user: AuthUser) { const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''; response.setHeader('Set-Cookie', `medsutra_session=${createSession(user)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`); }
export function clearSession(response: Response) { const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''; response.setHeader('Set-Cookie', `medsutra_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`); }
export function requestUser(request: Request): AuthUser | null { return parseSession(cookieValue(request, 'medsutra_session')); }
export function requireAuth(request: Request, response: Response, next: NextFunction) { const user = requestUser(request); if (!user) return response.status(401).json({ error: 'Please sign in to continue.' }); (request as Request & { user?: AuthUser }).user = user; next(); }

export async function signUp(input: { name?: unknown; email?: unknown; password?: unknown }): Promise<AuthUser> {
  await ensureSchema();
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 80) : '';
  const email = normalizeEmail(input.email);
  const password = typeof input.password === 'string' ? input.password : '';
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid name and email address.');
  if (password.length < 10) throw new Error('Use a password with at least 10 characters.');

  const existing = await getPool().query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) throw new Error('An account already exists for this email address.');

  const { salt, hash } = await hashPassword(password);
  const id = randomUUID();
  await getPool().query(
    `INSERT INTO users (id, email, name, role, password_hash, password_salt, provider, created_at)
     VALUES ($1, $2, $3, 'patient', $4, $5, 'password', now())`,
    [id, email, name, hash, salt]
  );
  return { id, email, name, role: 'patient' };
}

export async function signIn(input: { email?: unknown; password?: unknown }): Promise<AuthUser | null> {
  await ensureSchema();
  const email = normalizeEmail(input.email);
  const password = typeof input.password === 'string' ? input.password : '';
  const result = await getPool().query(
    `SELECT * FROM users WHERE email = $1 AND provider = 'password'`,
    [email]
  );
  const user = result.rows[0];
  if (!user || !user.password_salt || !user.password_hash) return null;
  const matches = await passwordsMatch(password, user.password_salt, user.password_hash);
  return matches ? rowToPublicUser(user) : null;
}

export async function signInWithProvider(provider: 'google' | 'apple', input: { email?: unknown; name?: unknown }): Promise<AuthUser> {
  await ensureSchema();
  const email = normalizeEmail(input.email);
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 80) : '';
  if (!/^\S+@\S+\.\S+$/.test(email) || !name) throw new Error('The identity provider did not return a verified name and email address.');

  const existing = await getPool().query('SELECT * FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) return rowToPublicUser(existing.rows[0]);

  const id = randomUUID();
  await getPool().query(
    `INSERT INTO users (id, email, name, role, provider, created_at) VALUES ($1, $2, $3, 'patient', $4, now())`,
    [id, email, name, provider]
  );
  return { id, email, name, role: 'patient' };
}

export function createOAuthState(provider: 'google' | 'apple'): string { const payload = Buffer.from(JSON.stringify({ provider, exp: Date.now() + 10 * 60 * 1000, nonce: randomBytes(12).toString('base64url') })).toString('base64url'); return `${payload}.${createHmac('sha256', sessionSecret()).update(payload).digest('base64url')}`; }
export function validateOAuthState(provider: 'google' | 'apple', state: string | undefined): boolean { const [payload, signature] = state?.split('.') || []; if (!payload || !signature) return false; const expected = createHmac('sha256', sessionSecret()).update(payload).digest('base64url'); if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return false; try { const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { provider?: string; exp?: number }; return parsed.provider === provider && typeof parsed.exp === 'number' && parsed.exp > Date.now(); } catch { return false; } }

export async function saveConsultation(user: AuthUser, input: Record<string, unknown>): Promise<ConsultationRecord> {
  await ensureSchema();
  const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, 500) : '';
  const preferredDate = typeof input.preferredDate === 'string' ? input.preferredDate : '';
  const preferredTime = typeof input.preferredTime === 'string' ? input.preferredTime : '';
  const consultationType = input.consultationType === 'chat' || input.consultationType === 'phone' ? input.consultationType : 'video';
  if (!reason || !/^\d{4}-\d{2}-\d{2}$/.test(preferredDate) || !/^\d{2}:\d{2}$/.test(preferredTime)) throw new Error('Add a reason and a valid preferred date and time.');

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  await getPool().query(
    `INSERT INTO consultations (id, user_id, reason, preferred_date, preferred_time, consultation_type, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'requested', now())`,
    [id, user.id, reason, preferredDate, preferredTime, consultationType]
  );
  return { id, userId: user.id, reason, preferredDate, preferredTime, consultationType, status: 'requested', createdAt };
}

export async function createPasswordReset(emailValue: unknown): Promise<string | null> {
  await ensureSchema();
  const email = normalizeEmail(emailValue);
  const result = await getPool().query(`SELECT id FROM users WHERE email = $1 AND provider = 'password'`, [email]);
  const user = result.rows[0];
  if (!user) return null;

  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHmac('sha256', sessionSecret()).update(token).digest('base64url');
  const expiresAt = Date.now() + RESET_TTL_MS;

  await getPool().query('DELETE FROM password_resets WHERE expires_at <= $1', [Date.now()]);
  await getPool().query(
    'INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
    [tokenHash, user.id, expiresAt]
  );
  return token;
}

export async function resetPassword(input: { token?: unknown; password?: unknown }): Promise<boolean> {
  await ensureSchema();
  const token = typeof input.token === 'string' ? input.token : '';
  const password = typeof input.password === 'string' ? input.password : '';
  if (!token || password.length < 10) return false;

  const tokenHash = createHmac('sha256', sessionSecret()).update(token).digest('base64url');
  const result = await getPool().query(
    'SELECT * FROM password_resets WHERE token_hash = $1 AND expires_at > $2',
    [tokenHash, Date.now()]
  );
  const record = result.rows[0];
  if (!record) return false;

  const { salt, hash } = await hashPassword(password);
  await getPool().query('UPDATE users SET password_salt = $1, password_hash = $2 WHERE id = $3', [salt, hash, record.user_id]);
  await getPool().query('DELETE FROM password_resets WHERE token_hash = $1', [tokenHash]);
  return true;
}
