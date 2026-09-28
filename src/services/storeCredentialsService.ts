import mongoose from 'mongoose';
import Store from '../models/Store';
import StoreAppCredentials, {
  IAppleCredentialStored,
  IGoogleCredentialStored,
} from '../models/StoreAppCredentials';
import { decrypt, encrypt } from '../utils/encryption';
import { BusinessLogicError, NotFoundError } from '../utils/errors';

/**
 * Store-owned App Store Connect and Google Play credentials (issue #185).
 *
 * Storage, status, and in-process decrypt for EAS Submit. This module does not
 * call Expo and does not change build dispatch. The store id always comes from
 * the caller (auth context for merchants). This module never logs key material.
 */

const CREDENTIAL_VERSION = 1;
const APPLE_KIND = 'apple-asc-api-key';
const GOOGLE_KIND = 'google-play-service-account';

const MAX_PEM_LENGTH = 16_000;
const MAX_STORED_JSON = 64 * 1024;
const MAX_CIPHERTEXT_LENGTH = 200_000;
const PEM_HEADER = '-----BEGIN PRIVATE KEY-----';
const PEM_FOOTER = '-----END PRIVATE KEY-----';

const APPLE_KEY_ID = /^[A-Za-z0-9]{10}$/;
const APPLE_ISSUER_ID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const GOOGLE_KEY_NAME = /^[a-z0-9_]{1,64}$/;
const GOOGLE_PROJECT_ID = /^[a-z][a-z0-9-]{3,61}$/;
const GOOGLE_PRIVATE_KEY_ID = /^[A-Za-z0-9_-]{8,128}$/;
const GOOGLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LAST4 = /^[A-Za-z0-9_-]{4}$/;
const STORE_ID = /^[a-fA-F0-9]{24}$/;

export const APPLE_INVALID_MESSAGE =
  'Check the key ID and issuer ID, then upload the App Store Connect API key (.p8) again.';
export const GOOGLE_INVALID_MESSAGE =
  'Upload the Google Play service account JSON file again.';
export const APPLE_NEEDS_ATTENTION_MESSAGE =
  'Upload the App Store Connect API key again.';
export const GOOGLE_NEEDS_ATTENTION_MESSAGE =
  'Upload the Google Play service account JSON again.';

const SECRET_MARKERS = ['-----BEGIN', 'PRIVATE KEY', 'private_key'];
const FORBIDDEN_RESPONSE_KEYS = new Set([
  'privatekey',
  'private_key',
  'ciphertext',
  'credentialsencrypted',
  'serviceaccount',
  'pem',
  'keyp8',
  'googleserviceaccountkeyjson',
]);

export type CredentialConnectionStatus = 'connected' | 'missing' | 'needsAttention';

export interface PublicAppleCredentialStatus {
  status: CredentialConnectionStatus;
  keyIdLast4?: string;
  issuerIdLast4?: string;
  updatedAt?: string;
  message?: string;
}

export interface PublicGoogleCredentialStatus {
  status: CredentialConnectionStatus;
  clientEmail?: string;
  privateKeyIdLast4?: string;
  updatedAt?: string;
  message?: string;
}

export interface PublicStoreCredentialsStatus {
  apple: PublicAppleCredentialStatus;
  google: PublicGoogleCredentialStatus;
}

export interface AdminStoreCredentialsStatus extends PublicStoreCredentialsStatus {
  storeId: string;
}

export class StoreCredentialsValidationError extends BusinessLogicError {
  constructor(message: string) {
    super(message, 'STORE_CREDENTIALS_INVALID', 400);
    this.name = 'StoreCredentialsValidationError';
  }
}

export class StoreCredentialsUnreadableError extends Error {
  constructor() {
    super('Stored credentials could not be read');
    this.name = 'StoreCredentialsUnreadableError';
  }
}

interface ApplePlain {
  keyId: string;
  issuerId: string;
  privateKey: string;
}

interface CredentialEnvelope extends Record<string, unknown> {
  v: number;
  kind: string;
}

/**
 * True when a value destined for an HTTP response carries key material or a
 * forbidden field name. Callers must drop the payload instead of sending it.
 */
export function responseContainsCredentialSecret(value: unknown): boolean {
  return scanForSecrets(value);
}

export function normalizePrivateKeyPem(raw: string): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_PEM_LENGTH) {
    return null;
  }

  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
  if (!text.startsWith(PEM_HEADER) || !text.endsWith(PEM_FOOTER)) {
    return null;
  }
  if (text.indexOf(PEM_HEADER) !== 0 || text.lastIndexOf(PEM_HEADER) !== 0) {
    return null;
  }
  if (text.indexOf(PEM_FOOTER) !== text.lastIndexOf(PEM_FOOTER)) {
    return null;
  }

  const body = text.slice(PEM_HEADER.length, text.length - PEM_FOOTER.length).trim();
  const lines = body.split('\n').filter(line => line.length > 0);
  if (lines.length === 0 || lines.length > 64) {
    return null;
  }
  if (lines.some(line => line.length > 128 || !/^[A-Za-z0-9+/=]+$/.test(line))) {
    return null;
  }
  if (lines.join('').length < 32) {
    return null;
  }

  return `${PEM_HEADER}\n${lines.join('\n')}\n${PEM_FOOTER}\n`;
}

/**
 * Encrypt a credential envelope. The returned string is the existing
 * `iv:hex:authTag` blob and does not contain the plaintext.
 */
export function protectCredentialJson(payload: Record<string, unknown>): string {
  const plaintext = JSON.stringify({ ...payload, v: CREDENTIAL_VERSION });
  if (plaintext.length > MAX_STORED_JSON) {
    throw new StoreCredentialsValidationError(
      'That key file is too large. Upload the original key file.'
    );
  }
  return encrypt(plaintext);
}

/**
 * Decrypt a credential envelope. Failures use a fixed message so a bad blob
 * cannot echo key material.
 */
export function readCredentialJson(ciphertext: string): CredentialEnvelope {
  if (typeof ciphertext !== 'string' || ciphertext.length === 0 || ciphertext.length > MAX_CIPHERTEXT_LENGTH) {
    throw new StoreCredentialsUnreadableError();
  }

  let plaintext: string;
  try {
    plaintext = decrypt(ciphertext);
  } catch {
    throw new StoreCredentialsUnreadableError();
  }

  if (plaintext.length > MAX_STORED_JSON) {
    throw new StoreCredentialsUnreadableError();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext);
  } catch {
    throw new StoreCredentialsUnreadableError();
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new StoreCredentialsUnreadableError();
  }

  const record = parsed as CredentialEnvelope;
  if (record.v !== CREDENTIAL_VERSION || typeof record.kind !== 'string') {
    throw new StoreCredentialsUnreadableError();
  }
  return record;
}

export function parseAppleCredentialSubmission(body: unknown, fileText?: string | null): ApplePlain {
  const record = asRecord(body);
  const keyId = typeof record.keyId === 'string' ? record.keyId.trim() : '';
  const issuerId = typeof record.issuerId === 'string' ? record.issuerId.trim() : '';
  const fieldText = typeof record.privateKey === 'string' ? record.privateKey : '';
  const privateKeySource = fileText && fileText.trim().length > 0 ? fileText : fieldText;
  const privateKey = normalizePrivateKeyPem(privateKeySource);

  if (!APPLE_KEY_ID.test(keyId) || !APPLE_ISSUER_ID.test(issuerId) || !privateKey) {
    throw new StoreCredentialsValidationError(APPLE_INVALID_MESSAGE);
  }

  return { keyId, issuerId, privateKey };
}

export function parseGoogleCredentialSubmission(body: unknown, fileText?: string | null): Record<string, string> {
  if (typeof fileText === 'string' && fileText.trim().length > 0) {
    return parseServiceAccountJson(fileText);
  }
  return parseGoogleBody(body, 0);
}

export async function getStoreCredentialsStatus(storeId: string): Promise<PublicStoreCredentialsStatus> {
  const doc = await loadCredentialDoc(storeId);
  return {
    apple: appleStatus(doc?.apple),
    google: googleStatus(doc?.google),
  };
}

export async function saveAppleCredentials(params: {
  storeId: string;
  userId: string;
  body: unknown;
  fileText?: string | null;
}): Promise<PublicStoreCredentialsStatus> {
  const parsed = parseAppleCredentialSubmission(params.body, params.fileText);
  const ciphertext = protectCredentialJson({
    kind: APPLE_KIND,
    keyId: parsed.keyId,
    issuerId: parsed.issuerId,
    privateKey: parsed.privateKey,
  });
  assertAppleSeal(ciphertext, parsed);

  const now = new Date();
  await upsertPlatform(params.storeId, {
    apple: {
      ciphertext,
      keyIdLast4: parsed.keyId.slice(-4),
      issuerIdLast4: parsed.issuerId.slice(-4),
      updatedAt: now,
      updatedBy: new mongoose.Types.ObjectId(params.userId),
    },
  });

  return getStoreCredentialsStatus(params.storeId);
}

export async function saveGoogleCredentials(params: {
  storeId: string;
  userId: string;
  body: unknown;
  fileText?: string | null;
}): Promise<PublicStoreCredentialsStatus> {
  const serviceAccount = parseGoogleCredentialSubmission(params.body, params.fileText);
  const ciphertext = protectCredentialJson({
    kind: GOOGLE_KIND,
    serviceAccount,
  });
  assertGoogleSeal(ciphertext, serviceAccount);

  const now = new Date();
  await upsertPlatform(params.storeId, {
    google: {
      ciphertext,
      clientEmail: serviceAccount.client_email,
      privateKeyIdLast4: serviceAccount.private_key_id.slice(-4),
      updatedAt: now,
      updatedBy: new mongoose.Types.ObjectId(params.userId),
    },
  });

  return getStoreCredentialsStatus(params.storeId);
}

export async function disconnectAppleCredentials(storeId: string): Promise<PublicStoreCredentialsStatus> {
  await StoreAppCredentials.updateOne({ storeId }, { $unset: { apple: 1 } });
  await deleteDocIfEmpty(storeId);
  return getStoreCredentialsStatus(storeId);
}

export async function disconnectGoogleCredentials(storeId: string): Promise<PublicStoreCredentialsStatus> {
  await StoreAppCredentials.updateOne({ storeId }, { $unset: { google: 1 } });
  await deleteDocIfEmpty(storeId);
  return getStoreCredentialsStatus(storeId);
}

export type OpenedAppleSubmitCredential =
  | { status: 'missing' }
  | { status: 'needsAttention' }
  | { status: 'connected'; keyId: string; issuerId: string; privateKey: Buffer };

export type OpenedGoogleSubmitCredential =
  | { status: 'missing' }
  | { status: 'needsAttention' }
  | { status: 'connected'; serviceAccountJson: Buffer };

/**
 * Decrypt the Apple key for an in-process EAS Submit call.
 * The PEM is returned only as a Buffer. Callers must zero it and must not log it.
 */
export async function openAppleCredentialForSubmit(storeId: string): Promise<OpenedAppleSubmitCredential> {
  if (!STORE_ID.test(storeId)) {
    return { status: 'missing' };
  }
  const doc = await loadCredentialDoc(storeId);
  if (!doc?.apple || !hasText(doc.apple.ciphertext)) {
    return { status: 'missing' };
  }
  try {
    const envelope = readCredentialJson(doc.apple.ciphertext);
    if (envelope.kind !== APPLE_KIND) {
      return { status: 'needsAttention' };
    }
    const keyId = typeof envelope.keyId === 'string' ? envelope.keyId : '';
    const issuerId = typeof envelope.issuerId === 'string' ? envelope.issuerId : '';
    const privateKey = typeof envelope.privateKey === 'string' ? envelope.privateKey : '';
    const pem = normalizePrivateKeyPem(privateKey);
    if (!APPLE_KEY_ID.test(keyId) || !APPLE_ISSUER_ID.test(issuerId) || !pem) {
      return { status: 'needsAttention' };
    }
    return {
      status: 'connected',
      keyId,
      issuerId,
      privateKey: Buffer.from(pem, 'utf8'),
    };
  } catch {
    return { status: 'needsAttention' };
  }
}

/**
 * Decrypt the Google service-account JSON for an in-process EAS Submit call.
 * Callers must zero the buffer and must not log it.
 */
export async function openGoogleCredentialForSubmit(storeId: string): Promise<OpenedGoogleSubmitCredential> {
  if (!STORE_ID.test(storeId)) {
    return { status: 'missing' };
  }
  const doc = await loadCredentialDoc(storeId);
  if (!doc?.google || !hasText(doc.google.ciphertext)) {
    return { status: 'missing' };
  }
  try {
    const envelope = readCredentialJson(doc.google.ciphertext);
    if (envelope.kind !== GOOGLE_KIND) {
      return { status: 'needsAttention' };
    }
    const account = parseServiceAccountObject(envelope.serviceAccount);
    return {
      status: 'connected',
      serviceAccountJson: Buffer.from(JSON.stringify(account), 'utf8'),
    };
  } catch {
    return { status: 'needsAttention' };
  }
}

export async function getAdminStoreCredentialsStatus(storeId: string): Promise<AdminStoreCredentialsStatus> {
  if (!STORE_ID.test(storeId)) {
    throw new StoreCredentialsValidationError('That store id is not valid.');
  }

  const store = await Store.exists({ _id: storeId });
  if (!store) {
    throw new NotFoundError('Store not found');
  }

  const status = await getStoreCredentialsStatus(storeId);
  return {
    storeId,
    apple: status.apple,
    google: status.google,
  };
}

function appleStatus(record: IAppleCredentialStored | undefined): PublicAppleCredentialStatus {
  if (!record || !hasText(record.ciphertext)) {
    return { status: 'missing' };
  }

  const updatedAt = toIso(record.updatedAt);
  try {
    const opened = readApple(record.ciphertext);
    return compactApple({
      status: 'connected',
      keyIdLast4: safeLast4(opened.keyIdLast4),
      issuerIdLast4: safeLast4(opened.issuerIdLast4),
      updatedAt,
    });
  } catch {
    return compactApple({
      status: 'needsAttention',
      keyIdLast4: safeLast4(record.keyIdLast4),
      issuerIdLast4: safeLast4(record.issuerIdLast4),
      updatedAt,
      message: APPLE_NEEDS_ATTENTION_MESSAGE,
    });
  }
}

function googleStatus(record: IGoogleCredentialStored | undefined): PublicGoogleCredentialStatus {
  if (!record || !hasText(record.ciphertext)) {
    return { status: 'missing' };
  }

  const updatedAt = toIso(record.updatedAt);
  try {
    const opened = readGoogle(record.ciphertext);
    return compactGoogle({
      status: 'connected',
      clientEmail: safeEmail(opened.clientEmail),
      privateKeyIdLast4: safeLast4(opened.privateKeyIdLast4),
      updatedAt,
    });
  } catch {
    return compactGoogle({
      status: 'needsAttention',
      clientEmail: safeEmail(record.clientEmail),
      privateKeyIdLast4: safeLast4(record.privateKeyIdLast4),
      updatedAt,
      message: GOOGLE_NEEDS_ATTENTION_MESSAGE,
    });
  }
}

function compactApple(status: PublicAppleCredentialStatus): PublicAppleCredentialStatus {
  const result: PublicAppleCredentialStatus = { status: status.status };
  if (status.keyIdLast4) {
    result.keyIdLast4 = status.keyIdLast4;
  }
  if (status.issuerIdLast4) {
    result.issuerIdLast4 = status.issuerIdLast4;
  }
  if (status.updatedAt) {
    result.updatedAt = status.updatedAt;
  }
  if (status.status === 'needsAttention') {
    result.message = APPLE_NEEDS_ATTENTION_MESSAGE;
  }
  return result;
}

function compactGoogle(status: PublicGoogleCredentialStatus): PublicGoogleCredentialStatus {
  const result: PublicGoogleCredentialStatus = { status: status.status };
  if (status.clientEmail) {
    result.clientEmail = status.clientEmail;
  }
  if (status.privateKeyIdLast4) {
    result.privateKeyIdLast4 = status.privateKeyIdLast4;
  }
  if (status.updatedAt) {
    result.updatedAt = status.updatedAt;
  }
  if (status.status === 'needsAttention') {
    result.message = GOOGLE_NEEDS_ATTENTION_MESSAGE;
  }
  return result;
}

function readApple(ciphertext: string): { keyIdLast4: string; issuerIdLast4: string } {
  const envelope = readCredentialJson(ciphertext);
  if (envelope.kind !== APPLE_KIND) {
    throw new StoreCredentialsUnreadableError();
  }
  const keyId = typeof envelope.keyId === 'string' ? envelope.keyId : '';
  const issuerId = typeof envelope.issuerId === 'string' ? envelope.issuerId : '';
  const privateKey = typeof envelope.privateKey === 'string' ? envelope.privateKey : '';
  if (!APPLE_KEY_ID.test(keyId) || !APPLE_ISSUER_ID.test(issuerId) || !normalizePrivateKeyPem(privateKey)) {
    throw new StoreCredentialsUnreadableError();
  }
  return {
    keyIdLast4: keyId.slice(-4),
    issuerIdLast4: issuerId.slice(-4),
  };
}

function readGoogle(ciphertext: string): { clientEmail: string; privateKeyIdLast4: string } {
  const envelope = readCredentialJson(ciphertext);
  if (envelope.kind !== GOOGLE_KIND) {
    throw new StoreCredentialsUnreadableError();
  }
  try {
    const account = parseServiceAccountObject(envelope.serviceAccount);
    return {
      clientEmail: account.client_email,
      privateKeyIdLast4: account.private_key_id.slice(-4),
    };
  } catch (error) {
    if (error instanceof StoreCredentialsUnreadableError) {
      throw error;
    }
    throw new StoreCredentialsUnreadableError();
  }
}

function assertAppleSeal(ciphertext: string, parsed: ApplePlain): void {
  const opened = readApple(ciphertext);
  if (opened.keyIdLast4 !== parsed.keyId.slice(-4) || opened.issuerIdLast4 !== parsed.issuerId.slice(-4)) {
    throw new Error('Credential seal failed');
  }
}

function assertGoogleSeal(ciphertext: string, serviceAccount: Record<string, string>): void {
  const opened = readGoogle(ciphertext);
  if (
    opened.clientEmail !== serviceAccount.client_email ||
    opened.privateKeyIdLast4 !== serviceAccount.private_key_id.slice(-4)
  ) {
    throw new Error('Credential seal failed');
  }
}

async function upsertPlatform(
  storeId: string,
  set: { apple?: IAppleCredentialStored; google?: IGoogleCredentialStored }
): Promise<void> {
  try {
    await StoreAppCredentials.findOneAndUpdate(
      { storeId },
      { $set: set },
      { upsert: true, runValidators: true }
    );
  } catch (error) {
    if (!isDuplicateKey(error)) {
      throw error;
    }
    await StoreAppCredentials.updateOne({ storeId }, { $set: set }, { runValidators: true });
  }
}

async function deleteDocIfEmpty(storeId: string): Promise<void> {
  const remaining = await loadCredentialDoc(storeId);
  if (!remaining) {
    return;
  }
  if (!hasText(remaining.apple?.ciphertext) && !hasText(remaining.google?.ciphertext)) {
    await StoreAppCredentials.deleteOne({ _id: remaining._id, storeId });
  }
}

interface LoadedCredentialDoc {
  _id: mongoose.Types.ObjectId;
  apple?: IAppleCredentialStored;
  google?: IGoogleCredentialStored;
}

async function loadCredentialDoc(storeId: string): Promise<LoadedCredentialDoc | null> {
  const doc = await StoreAppCredentials.findOne({ storeId })
    .select('+apple.ciphertext +google.ciphertext')
    .lean();
  return doc as unknown as LoadedCredentialDoc | null;
}

function parseGoogleBody(body: unknown, depth: number): Record<string, string> {
  if (depth > 2) {
    throw new StoreCredentialsValidationError(GOOGLE_INVALID_MESSAGE);
  }
  if (typeof body === 'string') {
    return parseServiceAccountJson(body);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new StoreCredentialsValidationError(GOOGLE_INVALID_MESSAGE);
  }

  const record = body as Record<string, unknown>;
  if (record.type === 'service_account' || typeof record.private_key === 'string') {
    return parseServiceAccountObject(record);
  }
  if ('serviceAccount' in record) {
    return parseGoogleBody(record.serviceAccount, depth + 1);
  }
  throw new StoreCredentialsValidationError(GOOGLE_INVALID_MESSAGE);
}

function parseServiceAccountJson(raw: string): Record<string, string> {
  if (raw.length > MAX_STORED_JSON) {
    throw new StoreCredentialsValidationError(GOOGLE_INVALID_MESSAGE);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch {
    throw new StoreCredentialsValidationError(GOOGLE_INVALID_MESSAGE);
  }
  return parseServiceAccountObject(parsed);
}

function parseServiceAccountObject(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StoreCredentialsValidationError(GOOGLE_INVALID_MESSAGE);
  }

  const source = value as Record<string, unknown>;
  const keys = Object.keys(source);
  if (keys.length === 0 || keys.length > 30) {
    throw new StoreCredentialsValidationError(GOOGLE_INVALID_MESSAGE);
  }

  const sanitized: Record<string, string> = {};
  for (const key of keys) {
    if (!GOOGLE_KEY_NAME.test(key)) {
      throw new StoreCredentialsValidationError(GOOGLE_INVALID_MESSAGE);
    }
    const field = source[key];
    if (typeof field !== 'string') {
      continue;
    }
    if (field.length > (key === 'private_key' ? MAX_PEM_LENGTH : 2048)) {
      throw new StoreCredentialsValidationError(GOOGLE_INVALID_MESSAGE);
    }
    if ((key.endsWith('_uri') || key.endsWith('_url')) && !/^https:\/\/\S+$/.test(field)) {
      throw new StoreCredentialsValidationError(GOOGLE_INVALID_MESSAGE);
    }
    sanitized[key] = field;
  }

  if (sanitized.type !== 'service_account') {
    throw new StoreCredentialsValidationError(GOOGLE_INVALID_MESSAGE);
  }
  if (!GOOGLE_PROJECT_ID.test(sanitized.project_id || '')) {
    throw new StoreCredentialsValidationError(GOOGLE_INVALID_MESSAGE);
  }
  if (!GOOGLE_PRIVATE_KEY_ID.test(sanitized.private_key_id || '')) {
    throw new StoreCredentialsValidationError(GOOGLE_INVALID_MESSAGE);
  }
  const email = sanitized.client_email || '';
  if (!GOOGLE_EMAIL.test(email) || email.length > 320) {
    throw new StoreCredentialsValidationError(GOOGLE_INVALID_MESSAGE);
  }
  const privateKey = normalizePrivateKeyPem(sanitized.private_key || '');
  if (!privateKey) {
    throw new StoreCredentialsValidationError(GOOGLE_INVALID_MESSAGE);
  }
  sanitized.private_key = privateKey;
  return sanitized;
}

function asRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {};
  }
  return body as Record<string, unknown>;
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function toIso(value: Date | string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

function safeLast4(value: unknown): string | undefined {
  if (typeof value !== 'string' || !LAST4.test(value)) {
    return undefined;
  }
  return value;
}

function safeEmail(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 320 || !GOOGLE_EMAIL.test(value)) {
    return undefined;
  }
  if (SECRET_MARKERS.some(marker => value.includes(marker))) {
    return undefined;
  }
  return value;
}

function scanForSecrets(value: unknown): boolean {
  if (typeof value === 'string') {
    return SECRET_MARKERS.some(marker => value.includes(marker));
  }
  if (!value || typeof value !== 'object') {
    return false;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_RESPONSE_KEYS.has(key.toLowerCase())) {
      return true;
    }
    if (scanForSecrets(child)) {
      return true;
    }
  }
  return false;
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;
}
