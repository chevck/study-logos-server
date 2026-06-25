/** Normalize verse text for consistent AI input and validation. */
export function normalizeVerseText(raw) {
  return String(raw ?? '')
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u2032\u0060]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeToken(token) {
  return (token || '')
    .normalize('NFKC')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .toLowerCase();
}

function getVerseWords(verseText) {
  const words = [];
  const re = /\S+/g;
  let match;
  while ((match = re.exec(verseText)) !== null) {
    words.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return words;
}

/**
 * Re-slice phrase text from the verse when words match but punctuation,
 * spacing, or quotes differ from the model output.
 */
export function alignPhrasesByWords(verseText, phrases) {
  if (!Array.isArray(phrases) || phrases.length === 0) return null;

  const verseWords = getVerseWords(verseText);
  let wordIdx = 0;
  let cursor = 0;
  const aligned = [];

  for (let i = 0; i < phrases.length; i++) {
    const p = phrases[i];
    if (!p || typeof p.text !== 'string') return null;

    const phraseWords = p.text.match(/\S+/g) ?? [];
    if (phraseWords.length === 0) return null;

    for (const pw of phraseWords) {
      if (wordIdx >= verseWords.length) return null;
      if (normalizeToken(verseWords[wordIdx].text) !== normalizeToken(pw)) {
        return null;
      }
      wordIdx++;
    }

    const end =
      wordIdx >= verseWords.length
        ? verseText.length
        : verseWords[wordIdx].start;

    aligned.push({
      ...p,
      text: verseText.slice(cursor, end),
    });
    cursor = end;
  }

  if (wordIdx !== verseWords.length || cursor !== verseText.length) {
    return null;
  }

  return aligned;
}

export function validatePhrases(verseText, phrases) {
  if (!Array.isArray(phrases) || phrases.length === 0) {
    return 'Model returned no phrases';
  }

  let cursor = 0;

  for (let i = 0; i < phrases.length; i++) {
    const p = phrases[i];
    if (!p || typeof p.text !== 'string' || !p.text.trim()) {
      return `Phrase ${i} has invalid text`;
    }

    const idx = verseText.indexOf(p.text, cursor);
    if (idx === -1 || idx !== cursor) {
      return `Phrase ${i} text does not align with verse at position ${cursor}`;
    }

    cursor += p.text.length;
    p.id = typeof p.id === 'string' && p.id.trim() ? p.id.trim() : `p${i}`;
    p.transliteration = String(p.transliteration ?? '').trim();
    p.original = String(p.original ?? '').trim();
    p.language = String(p.language ?? '').trim() || 'Greek';
  }

  if (cursor !== verseText.length) {
    return 'Phrases do not cover the full verse';
  }

  return null;
}

/**
 * Accept exact model output or repair via word alignment.
 * @returns {{ phrases: object[] | null, error: string | null }}
 */
export function preparePhrases(verseText, rawPhrases) {
  if (!Array.isArray(rawPhrases) || rawPhrases.length === 0) {
    return { phrases: null, error: 'Model returned no phrases' };
  }

  const exactCopy = rawPhrases.map((p) => ({ ...p }));
  let err = validatePhrases(verseText, exactCopy);
  if (!err) {
    return { phrases: exactCopy, error: null };
  }

  const aligned = alignPhrasesByWords(verseText, rawPhrases);
  if (aligned) {
    err = validatePhrases(verseText, aligned);
    if (!err) {
      return { phrases: aligned, error: null };
    }
  }

  return { phrases: null, error: err ?? 'Could not align phrases to verse' };
}
