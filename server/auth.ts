import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';

const scrypt = promisify(scryptCallback);
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const storePath = path.join(process.cwd(), 'data', 'medsutra-secure-store.enc');

export interface AuthUser { id: string; email: string; name: string; role: 'patient' | 'admin'; }
interface StoredUser extends AuthUser { passwordHash?: string; passwordSalt?: string; provider?: 'password' | 'google' | 'apple'; createdAt: string; }
export interface ConsultationRecord { id: string; userId: string; reason: string; preferredDate: string; preferredTime: string; consultationType: 'video' | 'chat' | 'phone'; status: 'requested'; createdAt: string; }
interface PasswordResetRecord { tokenHash: string; userId: string; expiresAt: number; }
interface SecureStore { users: StoredUser[]; consultations: ConsultationRecord[]; passwordResets: PasswordResetRecord[]; }

const emptyStore = (): SecureStore => ({ users: [], consultations: [], passwordResets: [] });
let storePromise: Promise<SecureStore> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function encryptionKey(): Buffer {
  const configured = process.env.DATA_ENCRYPTION_KEY;
  if (!configured && process.env.NODE_ENV === 'production') throw new Error('DATA_ENCRYPTION_KEY is required in production.');
  return createHmac('sha256', 'medsutra-auth-store').update(configured || 'development-only-key-change-before-deploy').digest();
}

function sessionSecret(): string {
  const configured = process.env.AUTH_SESSION_SECRET;
  if (!configured && process.env.NODE_ENV === 'production') throw new Error('AUTH_SESSION_SECRET is required in production.');
  return configured || 'development-only-session-secret-change-before-deploy';
}

function encrypt(value: string): string {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return JSON.stringify({ iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), data: encrypted.toString('base64url') });
}

function decrypt(value: string): string {
  const parsed = JSON.parse(value) as { iv: string; tag: string; data: string };
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(parsed.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(parsed.data, 'base64url')), decipher.final()]).toString('utf8');
}

async function loadStore(): Promise<SecureStore> {
  try {
    const parsed = JSON.parse(decrypt(await readFile(storePath, 'utf8'))) as Partial<SecureStore>;
    return { users: Array.isArray(parsed.users) ? parsed.users : [], consultations: Array.isArray(parsed.consultations) ? parsed.consultations : [], passwordResets: Array.isArray(parsed.passwordResets) ? parsed.passwordResets : [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyStore();
    throw error;
  }
}

async function getStore(): Promise<SecureStore> { storePromise ||= loadStore(); return storePromise; }
async function persistStore(store: SecureStore): Promise<void> {
  writeQueue = writeQueue.then(async () => { await mkdir(path.dirname(storePath), { recursive: true }); const tempPath = `${storePath}.${randomBytes(6).toString('hex')}.tmp`; await writeFile(tempPath, encrypt(JSON.stringify(store)), { mode: 0o600 }); await rename(tempPath, storePath); });
  return writeQueue;
}
function normalizeEmail(value: unknown): string { return typeof value === 'string' ? value.trim().toLowerCase() : ''; }
function publicUser(user: StoredUser): AuthUser { return { id: user.id, email: user.email, name: user.name, role: user.role }; }
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
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 80) : ''; const email = normalizeEmail(input.email); const password = typeof input.password === 'string' ? input.password : '';
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid name and email address.'); if (password.length < 10) throw new Error('Use a password with at least 10 characters.');
  const store = await getStore(); if (store.users.some((user) => user.email === email)) throw new Error('An account already exists for this email address.');
  const { salt, hash } = await hashPassword(password); const user: StoredUser = { id: randomUUID(), name, email, role: 'patient', passwordSalt: salt, passwordHash: hash, provider: 'password', createdAt: new Date().toISOString() };
  store.users.push(user); await persistStore(store); return publicUser(user);
}
export async function signIn(input: { email?: unknown; password?: unknown }): Promise<AuthUser | null> { const email = normalizeEmail(input.email); const password = typeof input.password === 'string' ? input.password : ''; const user = (await getStore()).users.find((candidate) => candidate.email === email && candidate.provider === 'password'); return user?.passwordSalt && user.passwordHash && await passwordsMatch(password, user.passwordSalt, user.passwordHash) ? publicUser(user) : null; }
export async function signInWithProvider(provider: 'google' | 'apple', input: { email?: unknown; name?: unknown }): Promise<AuthUser> { const email = normalizeEmail(input.email); const name = typeof input.name === 'string' ? input.name.trim().slice(0, 80) : ''; if (!/^\S+@\S+\.\S+$/.test(email) || !name) throw new Error('The identity provider did not return a verified name and email address.'); const store = await getStore(); const existing = store.users.find((candidate) => candidate.email === email); if (existing) return publicUser(existing); const user: StoredUser = { id: randomUUID(), email, name, role: 'patient', provider, createdAt: new Date().toISOString() }; store.users.push(user); await persistStore(store); return publicUser(user); }
export function createOAuthState(provider: 'google' | 'apple'): string { const payload = Buffer.from(JSON.stringify({ provider, exp: Date.now() + 10 * 60 * 1000, nonce: randomBytes(12).toString('base64url') })).toString('base64url'); return `${payload}.${createHmac('sha256', sessionSecret()).update(payload).digest('base64url')}`; }
export function validateOAuthState(provider: 'google' | 'apple', state: string | undefined): boolean { const [payload, signature] = state?.split('.') || []; if (!payload || !signature) return false; const expected = createHmac('sha256', sessionSecret()).update(payload).digest('base64url'); if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return false; try { const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { provider?: string; exp?: number }; return parsed.provider === provider && typeof parsed.exp === 'number' && parsed.exp > Date.now(); } catch { return false; } }
export async function saveConsultation(user: AuthUser, input: Record<string, unknown>): Promise<ConsultationRecord> {
  const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, 500) : ''; const preferredDate = typeof input.preferredDate === 'string' ? input.preferredDate : ''; const preferredTime = typeof input.preferredTime === 'string' ? input.preferredTime : ''; const consultationType = input.consultationType === 'chat' || input.consultationType === 'phone' ? input.consultationType : 'video';
  if (!reason || !/^\d{4}-\d{2}-\d{2}$/.test(preferredDate) || !/^\d{2}:\d{2}$/.test(preferredTime)) throw new Error('Add a reason and a valid preferred date and time.');
  const record: ConsultationRecord = { id: randomUUID(), userId: user.id, reason, preferredDate, preferredTime, consultationType, status: 'requested', createdAt: new Date().toISOString() }; const store = await getStore(); store.consultations.push(record); await persistStore(store); return record;
}
export async function createPasswordReset(emailValue: unknown): Promise<string | null> { const user = (await getStore()).users.find((candidate) => candidate.email === normalizeEmail(emailValue) && candidate.provider === 'password'); if (!user) return null; const token = randomBytes(32).toString('base64url'); const store = await getStore(); store.passwordResets = store.passwordResets.filter((record) => record.expiresAt > Date.now()); store.passwordResets.push({ tokenHash: createHmac('sha256', sessionSecret()).update(token).digest('base64url'), userId: user.id, expiresAt: Date.now() + RESET_TTL_MS }); await persistStore(store); return token; }
export async function resetPassword(input: { token?: unknown; password?: unknown }): Promise<boolean> { const token = typeof input.token === 'string' ? input.token : ''; const password = typeof input.password === 'string' ? input.password : ''; if (!token || password.length < 10) return false; const store = await getStore(); const tokenHash = createHmac('sha256', sessionSecret()).update(token).digest('base64url'); const record = store.passwordResets.find((entry) => entry.tokenHash === tokenHash && entry.expiresAt > Date.now()); const user = record && store.users.find((entry) => entry.id === record.userId); if (!record || !user) return false; const { salt, hash } = await hashPassword(password); user.passwordSalt = salt; user.passwordHash = hash; store.passwordResets = store.passwordResets.filter((entry) => entry !== record); await persistStore(store); return true; }
