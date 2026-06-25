function normalizeMentionItem(item, fallbackLanguage) {
  if (!item || typeof item !== 'object') return null;
  const reference = String(item.reference ?? '').trim();
  if (!reference) return null;

  return {
    language: String(item.language ?? fallbackLanguage ?? '').trim() || 'Original language',
    reference,
    note: String(item.note ?? '').trim(),
    relatedForm: String(item.relatedForm ?? item.original ?? '').trim(),
  };
}

/**
 * @returns {object[] | null}
 */
export function normalizeFirstMentions(parsed) {
  const fallbackLanguage = String(parsed.language ?? '').trim();
  let raw = [];

  if (Array.isArray(parsed.firstMentions)) {
    raw = parsed.firstMentions;
  } else if (parsed.firstMention && typeof parsed.firstMention === 'object') {
    raw = [parsed.firstMention];
  } else if (typeof parsed.firstMentionReference === 'string') {
    raw = [
      {
        reference: parsed.firstMentionReference,
        note: parsed.firstMentionNote,
        language: fallbackLanguage,
      },
    ];
  }

  const mentions = raw
    .map((item) => normalizeMentionItem(item, fallbackLanguage))
    .filter(Boolean);

  return mentions.length ? mentions : null;
}
