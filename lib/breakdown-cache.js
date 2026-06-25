import crypto from 'crypto';

function normalizePhrase(phrase) {
  return String(phrase ?? '').trim();
}

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

/**
 * Stable cache key: same logical request → same hash (saves Anthropic calls).
 * Includes model id so switching ANTHROPIC_MODEL does not reuse wrong responses.
 */
export function breakdownCacheKey({
  phrase,
  word,
  reference,
  verseText,
  translation,
  studyLanguage,
  model,
  readerFirstName,
}) {
  const payload = JSON.stringify({
    b: 4,
    p: normalizePhrase(phrase ?? word),
    r: normalizeReference(reference),
    v: normalizeVerseText(verseText),
    t: normalizeTranslation(translation),
    s: normalizeStudyLanguage(studyLanguage),
    m: String(model ?? '').trim(),
    n: String(readerFirstName ?? '').trim().toLowerCase(),
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export class BreakdownLRU {
  constructor(maxSize) {
    this.maxSize = Math.max(1, maxSize);
    /** @type {Map<string, object>} */
    this.map = new Map();
  }

  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  /** @param {string} key */
  /** @param {object} value Parsed breakdown JSON */
  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.maxSize) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
    this.map.set(key, value);
  }

  get size() {
    return this.map.size;
  }
}

function parseMaxSize() {
  const raw = process.env.BREAKDOWN_CACHE_MAX;
  const n = raw != null ? Number.parseInt(String(raw), 10) : NaN;
  if (Number.isFinite(n) && n > 0) return n;
  return 400;
}

export const breakdownCache = new BreakdownLRU(parseMaxSize());

export function isBreakdownCacheDisabled() {
  const v = process.env.BREAKDOWN_CACHE_DISABLED?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}
