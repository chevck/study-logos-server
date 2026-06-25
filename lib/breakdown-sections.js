import { normalizeFirstMentions } from './first-mention.js';

export const BREAKDOWN_SECTIONS = [
  'core',
  'firstMentions',
  'caseStudy',
  'crossReferences',
  'commentary',
];

const SECTION_SET = new Set(BREAKDOWN_SECTIONS);

export function isBreakdownSection(value) {
  return typeof value === 'string' && SECTION_SET.has(value);
}

export function normalizeStudyLanguage(raw) {
  const s = String(raw ?? 'eng').trim().toLowerCase();
  if (s === 'yor' || s === 'yo') return 'yor';
  return 'eng';
}

export const STUDY_LANGUAGE_NOTE = {
  eng: '',
  yor: `The reader's study language is Yorùbá (Yoruba). Write definition, caseStudy, commentary, caseStudyLabel, commentaryAttribution, and each firstMentions[].note in Yorùbá with natural tone marks where appropriate. Keep caseStudyStyle as exactly one of: story | cinematic | historical | parable (English, lowercase). Keep original Hebrew/Greek in "original", "relatedForm", and romanisation in "transliteration". The "phrase" field must match the tapped surface text from the verse (one word or grouped words). Use conventional reference formatting for crossReferences and firstMentions[].reference. Keep firstMentions[].language as "Greek" or "Hebrew".`,
};

export function sanitizeReaderFirstName(raw) {
  const trimmed = String(raw ?? '').trim().slice(0, 48);
  if (!trimmed) return '';
  const first = trimmed.split(/\s+/).filter(Boolean)[0] ?? '';
  if (!first || !/^[\p{L}][\p{L}'-]*$/u.test(first)) return '';
  return first;
}

export function caseStudyCharacterNote(readerFirstName) {
  const lines = [
    'Case study character guidance:',
    '- For "story" style: invent a distinct protagonist every time — vary first names, gender, ethnicity, and life situation.',
    '- Never use "Marcus" or any stock name you have used before in this response.',
    '- Include women and men as protagonists across different stories.',
    '- Cinematic, historical, and parable styles should not rely on a recurring named character unless historically necessary.',
  ];

  if (readerFirstName) {
    lines.push(
      `- The signed-in reader's first name is "${readerFirstName}". When caseStudyStyle is "story", choose ONE of these approaches at random: (a) make ${readerFirstName} the protagonist in third person, (b) invent a completely different named character, or (c) use a different named character of another gender. Do not use ${readerFirstName} every time — variety matters.`,
      `- If you feature ${readerFirstName}, keep the tone dignified and pastoral — not gimmicky.`,
    );
  }

  return lines.join('\n');
}

export function stripJsonFences(text) {
  let s = text.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  return s.trim();
}

const SECTION_PROMPTS = {
  core: `You are a biblical scholar. Given a tapped word or phrase from a Bible verse, return JSON only (no markdown fences):
{
  "phrase": "the tapped text exactly as it appears in the verse",
  "reference": "the scripture reference",
  "original": "the Greek or Hebrew word in its original script",
  "transliteration": "romanised pronunciation",
  "language": "Greek or Hebrew",
  "definition": "what the original word meant in its original biblical and cultural context (2-3 sentences)"
}`,

  firstMentions: `You are a biblical scholar. Given a tapped word or phrase from a Bible verse, return JSON only (no markdown fences):
{
  "firstMentions": [
    {
      "language": "Greek or Hebrew — language of THIS tapped word",
      "reference": "Book Chapter:Verse of first canonical appearance of this lexeme in that language",
      "relatedForm": "the original word as it appears at that reference",
      "note": "One or two sentences on what that first occurrence establishes"
    },
    {
      "language": "Hebrew or Greek — the OTHER original language, if a related lexeme or clear conceptual equivalent exists",
      "reference": "Book Chapter:Verse of its first canonical appearance in that other language",
      "relatedForm": "the original word form at that reference",
      "note": "One or two sentences explaining the relationship to the tapped word and what that first occurrence establishes"
    }
  ]
}
Always include the first canonical appearance in the tapped word's language. If a related Hebrew or Greek equivalent exists, add a second firstMentions entry for the other language (omit the second entry only when no meaningful counterpart exists).`,

  caseStudy: `You are a biblical scholar and gifted communicator. Given a tapped word or phrase from a Bible verse, return JSON only (no markdown fences):
{
  "caseStudyStyle": "story" | "cinematic" | "historical" | "parable",
  "caseStudyLabel": "Short story" | "Cinematic" | "Historical analogy" | "Parable",
  "caseStudy": "A vivid narrative modern-day illustration. Story = one named protagonist in a real situation (vary name and gender every time — never default to Marcus). Cinematic = atmospheric scene, no named character. Historical = real historical event mirroring the concept. Parable = parable-style prose echoing biblical tone. Write 2-3 short paragraphs. Use <em> tags for atmosphere, <strong> for the original word when it appears."
}`,

  crossReferences: `You are a biblical scholar. Given a tapped word or phrase from a Bible verse, return JSON only (no markdown fences):
{
  "crossReferences": ["Ref 1", "Ref 2", "Ref 3", "Ref 4"]
}
Provide four relevant cross-references as conventional scripture references.`,

  commentary: `You are a biblical scholar. Given a tapped word or phrase from a Bible verse, return JSON only (no markdown fences):
{
  "commentary": "Short theological commentary on this word in this passage (2-3 sentences)",
  "commentaryAttribution": "— Scholar Name, Book Title (Year)"
}`,
};

export function systemPromptForSection(section) {
  return SECTION_PROMPTS[section] ?? SECTION_PROMPTS.core;
}

export function buildUserContent({
  surfacePhrase,
  reference,
  verseText,
  translation,
  studyLang,
  phraseTransliteration,
  phraseOriginal,
  readerFirstName,
  section,
  coreContext,
}) {
  const extra = STUDY_LANGUAGE_NOTE[studyLang] || STUDY_LANGUAGE_NOTE.eng;

  const lines = [
    `Word or words (as tapped): ${surfacePhrase}`,
    phraseTransliteration ? `Original transliteration: ${phraseTransliteration}` : null,
    phraseOriginal ? `Original script: ${phraseOriginal}` : null,
    `Reference: ${reference}`,
    translation ? `Translation: ${translation}` : null,
    extra ? `\n${extra}` : null,
  ];

  if (section === 'caseStudy') {
    lines.push('', caseStudyCharacterNote(readerFirstName));
  }

  if (section !== 'core' && coreContext) {
    lines.push(
      '',
      'Established word study context (keep consistent with this):',
      coreContext.original ? `Original: ${coreContext.original}` : null,
      coreContext.transliteration
        ? `Transliteration: ${coreContext.transliteration}`
        : null,
      coreContext.language ? `Language: ${coreContext.language}` : null,
      coreContext.definition ? `Definition: ${coreContext.definition}` : null,
    );
  }

  if (section === 'firstMentions') {
    lines.push(
      '',
      "First mentions: always include the first canonical appearance in the tapped word's language. If a related Hebrew or Greek equivalent exists, add a second firstMentions entry for the other language (omit the second entry only when no meaningful counterpart exists).",
    );
  }

  lines.push('', 'Full verse:', verseText);

  return lines.filter(Boolean).join('\n');
}

function normalizeCrossReferences(parsed) {
  if (!Array.isArray(parsed.crossReferences)) return [];
  return parsed.crossReferences
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim();
      if (entry && typeof entry === 'object' && typeof entry.reference === 'string') {
        return entry.reference.trim();
      }
      return '';
    })
    .filter(Boolean);
}

export function normalizeSectionPayload(section, parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed;

  if (section === 'core') {
    if (!parsed.phrase && parsed.word) parsed.phrase = parsed.word;
    return {
      phrase: parsed.phrase,
      reference: parsed.reference,
      original: parsed.original,
      transliteration: parsed.transliteration,
      language: parsed.language,
      definition: parsed.definition,
    };
  }

  if (section === 'firstMentions') {
    const mentions = normalizeFirstMentions(parsed);
    return { firstMentions: mentions ?? [] };
  }

  if (section === 'caseStudy') {
    return {
      caseStudyStyle: parsed.caseStudyStyle,
      caseStudyLabel: parsed.caseStudyLabel,
      caseStudy: parsed.caseStudy,
    };
  }

  if (section === 'crossReferences') {
    return { crossReferences: normalizeCrossReferences(parsed) };
  }

  if (section === 'commentary') {
    return {
      commentary: parsed.commentary,
      commentaryAttribution: parsed.commentaryAttribution,
    };
  }

  return parsed;
}

export function normalizeFullBreakdown(parsed) {
  if (!parsed.phrase && parsed.word) {
    parsed.phrase = parsed.word;
  }

  parsed.firstMentions = normalizeFirstMentions(parsed) ?? [];
  delete parsed.firstMention;
  delete parsed.firstMentionReference;
  delete parsed.firstMentionNote;
  parsed.crossReferences = normalizeCrossReferences(parsed);

  return parsed;
}

export function extractSectionFromFull(full, section) {
  if (!full || typeof full !== 'object') return null;

  if (section === 'core') {
    return normalizeSectionPayload('core', full);
  }
  if (section === 'firstMentions') {
    return normalizeSectionPayload('firstMentions', full);
  }
  if (section === 'caseStudy') {
    return normalizeSectionPayload('caseStudy', full);
  }
  if (section === 'crossReferences') {
    return normalizeSectionPayload('crossReferences', full);
  }
  if (section === 'commentary') {
    return normalizeSectionPayload('commentary', full);
  }
  return null;
}

export function sectionCacheSuffix(section) {
  return `:${section}`;
}
