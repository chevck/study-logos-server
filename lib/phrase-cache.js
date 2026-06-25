import crypto from 'crypto';
import { BreakdownLRU, isBreakdownCacheDisabled } from './breakdown-cache.js';

function normalizeReference(reference) {
  return String(reference ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeVerseText(verseText) {
  return String(verseText ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeTranslation(translation) {
  return translation != null && String(translation).trim()
    ? String(translation).trim().toUpperCase()
    : '';
}

function normalizeStudyLanguage(raw) {
  const s = String(raw ?? 'eng').trim().toLowerCase();
  if (s === 'yor' || s === 'yo') return 'yor';
  return 'eng';
}

export function phraseCacheKey({
  reference,
  verseText,
  translation,
  studyLanguage,
  model,
}) {
  const payload = JSON.stringify({
    seg: 3,
    r: normalizeReference(reference),
    v: normalizeVerseText(verseText),
    t: normalizeTranslation(translation),
    s: normalizeStudyLanguage(studyLanguage),
    m: String(model ?? '').trim(),
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function parseMaxSize() {
  const raw = process.env.PHRASE_CACHE_MAX ?? process.env.BREAKDOWN_CACHE_MAX;
  const n = raw != null ? Number.parseInt(String(raw), 10) : NaN;
  if (Number.isFinite(n) && n > 0) return n;
  return 400;
}

export const phraseCache = new BreakdownLRU(parseMaxSize());

export function isPhraseCacheDisabled() {
  if (isBreakdownCacheDisabled()) return true;
  const v = process.env.PHRASE_CACHE_DISABLED?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}
