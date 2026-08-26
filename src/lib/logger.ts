// src/lib/logger.ts
// Structured logging utility — writes to Firestore 'logs' collection
// Replaces console.error with searchable, filterable audit trail

import { getAdminDb, collection, addDoc, serverTimestamp } from './firebase-admin';

export type LogLevel = 'info' | 'warn' | 'error' | 'security';
export type LogCategory = 'auth' | 'api' | 'upload' | 'security' | 'system' | 'data';

interface LogEntry {
  level: LogLevel;
  category: LogCategory;
  message: string;
  details?: Record<string, any>;
  ip?: string;
  userAgent?: string;
  endpoint?: string;
  method?: string;
  timestamp?: any; // serverTimestamp()
}

// In-memory buffer to avoid flooding Firestore on errors
const LOG_BUFFER: LogEntry[] = [];
const FLUSH_INTERVAL_MS = 5000;
let flushTimer: ReturnType<typeof setInterval> | null = null;

function startFlushTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    flushBuffer();
  }, FLUSH_INTERVAL_MS);
}

async function flushBuffer() {
  if (LOG_BUFFER.length === 0) return;
  const batch = LOG_BUFFER.splice(0, LOG_BUFFER.length);
  try {
    const db = getAdminDb();
    const logsRef = collection(db, 'logs');
    for (const entry of batch) {
      await addDoc(logsRef, { ...entry, timestamp: serverTimestamp() });
    }
  } catch (err) {
    // If Firestore is down, log to console as last resort
    console.error('[LOGGER] Failed to flush logs to Firestore:', err);
    console.error('[LOGGER] Lost entries:', JSON.stringify(batch));
  }
}

// Ensure buffer is flushed on process exit
if (typeof process !== 'undefined') {
  process.on('exit', () => { /* sync flush not possible, best effort */ });
  process.on('SIGTERM', async () => { await flushBuffer(); process.exit(0); });
  process.on('SIGINT', async () => { await flushBuffer(); process.exit(0); });
}

function extractRequestInfo(request?: Request): { ip?: string; userAgent?: string; endpoint?: string; method?: string } {
  if (!request) return {};
  return {
    ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
    userAgent: request.headers.get('user-agent') || 'unknown',
    endpoint: request.url || 'unknown',
    method: request.method || 'unknown',
  };
}

function bufferLog(entry: LogEntry) {
  LOG_BUFFER.push(entry);
  startFlushTimer();
  // Flush immediately on errors and security events
  if (entry.level === 'error' || entry.level === 'security') {
    flushBuffer();
  }
}

// ── Public API ──

export function logInfo(category: LogCategory, message: string, details?: Record<string, any>, request?: Request) {
  bufferLog({ level: 'info', category, message, details, ...extractRequestInfo(request) });
}

export function logWarn(category: LogCategory, message: string, details?: Record<string, any>, request?: Request) {
  bufferLog({ level: 'warn', category, message, details, ...extractRequestInfo(request) });
}

export function logError(category: LogCategory, message: string, details?: Record<string, any>, request?: Request) {
  bufferLog({ level: 'error', category, message, details, ...extractRequestInfo(request) });
}

export function logSecurity(event: string, details?: Record<string, any>, request?: Request) {
  bufferLog({ level: 'security', category: 'security', message: event, details, ...extractRequestInfo(request) });
}

// ── Convenience wrappers for common events ──

export function logAuthFailure(reason: string, request?: Request, extra?: Record<string, any>) {
  logSecurity('auth_failure', { reason, ...extra }, request);
}

export function logAuthSuccess(admin: boolean, request?: Request) {
  logInfo('auth', admin ? 'Admin login successful' : 'Auth check passed', undefined, request);
}

export function logRateLimitHit(identifier: string, request?: Request) {
  logSecurity('rate_limit_exceeded', { identifier }, request);
}

export function logAchievementCreated(id: string, teacherName: string, request?: Request) {
  logInfo('data', 'Achievement created', { achievementId: id, teacherName }, request);
}

export function logAchievementDeleted(id: string, byAdmin: boolean, request?: Request) {
  logInfo('data', 'Achievement deleted', { achievementId: id, byAdmin }, request);
}

export function logAchievementStatusChanged(id: string, newStatus: string, request?: Request) {
  logInfo('data', `Achievement status changed to ${newStatus}`, { achievementId: id, newStatus }, request);
}

export function logCsrfBlock(request?: Request) {
  logSecurity('csrf_block', undefined, request);
}

// Flush on demand (called from admin endpoint)
export async function flushLogs() {
  await flushBuffer();
}
