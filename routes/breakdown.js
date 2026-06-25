import { Router } from 'express';
import { anthropic } from '../lib/anthropic.js';
import {
  breakdownCache,
  breakdownCacheKey,
  isBreakdownCacheDisabled,
} from '../lib/breakdown-cache.js';
import { normalizeFirstMentions } from '../lib/first-mention.js';
import {
  attachStudyMetaHeaders,
  incrementUserStudyCount,
} from '../lib/study.js';

const router = Router();

const SYSTEM_PROMPT = `You are a biblical scholar and gifted communicator. When given a tapped word or group of words from a Bible verse (aligned to one original-language word via transliteration), produce a structured breakdown in JSON format only. No preamble, no markdown fences, just raw JSON.

Return exactly this structure:
{
  "phrase": "the tapped text exactly as it appears in the verse (one word or several words)",
  "reference": "the scripture reference",
  "original": "the Greek or Hebrew word in its original script",
  "transliteration": "romanised pronunciation",
  "language": "Greek or Hebrew",
  "definition": "what the original word meant in its original biblical and cultural context (2-3 sentences)",
  "caseStudyStyle": "story" | "cinematic" | "historical" | "parable",
  "caseStudyLabel": "Short story" | "Cinematic" | "Historical analogy" | "Parable",
  "caseStudy": "A vivid narrative modern-day illustration. Story = one named protagonist in a real situation (vary name and gender every time — never default to Marcus). Cinematic = atmospheric scene, no named character. Historical = real historical event mirroring the concept. Parable = parable-style prose echoing biblical tone. Write 2-3 short paragraphs. Use <em> tags for atmosphere, <strong> for the original word when it appears.",
  "crossReferences": ["Ref 1", "Ref 2", "Ref 3", "Ref 4"],
  "firstMentions": [
    {
      "language": "Greek or Hebrew — language of THIS tapped word",
      "reference": "Book Chapter:Verse of first canonical appearance of this lexeme in that language",
      "relatedForm": "the original word as it appears at that reference (optional but preferred)",
      "note": "One or two sentences on what that first occurrence establishes"
    },
    {
      "language": "Hebrew or Greek — the OTHER original language, if a related lexeme or clear conceptual equivalent exists",
      "reference": "Book Chapter:Verse of its first canonical appearance in that other language",
      "relatedForm": "the original word form at that reference",
      "note": "One or two sentences explaining the relationship to the tapped word and what that first occurrence establishes"
    }
  ],
  "commentary": "Short theological commentary on this word in this passage (2-3 sentences)",
  "commentaryAttribution": "— Scholar Name, Book Title (Year)"
}`;

function stripJsonFences(text) {
  let s = text.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  return s.trim();
}

function normalizeStudyLanguage(raw) {
  const s = String(raw ?? 'eng').trim().toLowerCase();
  if (s === 'yor' || s === 'yo') return 'yor';
  return 'eng';
}

const STUDY_LANGUAGE_NOTE = {
  eng: '',
  yor: `The reader's study language is Yorùbá (Yoruba). Write definition, caseStudy, commentary, caseStudyLabel, commentaryAttribution, and each firstMentions[].note in Yorùbá with natural tone marks where appropriate. Keep caseStudyStyle as exactly one of: story | cinematic | historical | parable (English, lowercase). Keep original Hebrew/Greek in "original", "relatedForm", and romanisation in "transliteration". The "phrase" field must match the tapped surface text from the verse (one word or grouped words). Use conventional reference formatting for crossReferences and firstMentions[].reference. Keep firstMentions[].language as "Greek" or "Hebrew".`,
};

function sanitizeReaderFirstName(raw) {
  const trimmed = String(raw ?? '').trim().slice(0, 48);
  if (!trimmed) return '';
  const first = trimmed.split(/\s+/).filter(Boolean)[0] ?? '';
  if (!first || !/^[\p{L}][\p{L}'-]*$/u.test(first)) return '';
  return first;
}

function caseStudyCharacterNote(readerFirstName) {
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

router.post('/', async (req, res, next) => {
  try {
    const {
      phrase,
      word,
      reference,
      verseText,
      translation,
      studyLanguage,
      phraseTransliteration,
      phraseOriginal,
      readerFirstName: readerFirstNameRaw,
    } = req.body ?? {};

    const surfacePhrase = phrase ?? word;
    const readerFirstName = sanitizeReaderFirstName(readerFirstNameRaw);

    if (!surfacePhrase || !reference || !verseText) {
      return res.status(400).json({
        error:
          'Request body must include phrase, reference, and verseText (translation optional)',
      });
    }

    if (!anthropic) {
      return res.status(500).json({
        error:
          'Anthropic client is not configured. Set ANTHROPIC_API_KEY in server/.env',
      });
    }

    const model =
      process.env.ANTHROPIC_MODEL?.trim() || 'claude-haiku-4-5';

    const studyLang = normalizeStudyLanguage(studyLanguage);

    const cacheOff = isBreakdownCacheDisabled();
    const cKey = breakdownCacheKey({
      phrase: surfacePhrase,
      reference,
      verseText,
      translation,
      studyLanguage: studyLang,
      model,
      readerFirstName,
    });

    if (!cacheOff) {
      const cached = breakdownCache.get(cKey);
      if (cached) {
        res.setHeader('X-Breakdown-Cache', 'HIT');
        if (req.user?.id) {
          const meta = await incrementUserStudyCount(req.user.id);
          attachStudyMetaHeaders(res, meta);
        }
        return res.json(cached);
      }
    }

    const extra = STUDY_LANGUAGE_NOTE[studyLang] || STUDY_LANGUAGE_NOTE.eng;

    const userContent = [
      `Word or words (as tapped): ${surfacePhrase}`,
      phraseTransliteration ? `Original transliteration: ${phraseTransliteration}` : null,
      phraseOriginal ? `Original script: ${phraseOriginal}` : null,
      `Reference: ${reference}`,
      translation ? `Translation: ${translation}` : null,
      extra ? `\n${extra}` : null,
      '',
      caseStudyCharacterNote(readerFirstName),
      '',
      'First mentions: always include the first canonical appearance in the tapped word\'s language. If a related Hebrew or Greek equivalent exists, add a second firstMentions entry for the other language (omit the second entry only when no meaningful counterpart exists).',
      '',
      'Full verse:',
      verseText,
    ]
      .filter(Boolean)
      .join('\n');

    const message = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    });

    const block = message.content?.find((b) => b.type === 'text');
    const rawText = block?.type === 'text' ? block.text : '';

    if (!rawText) {
      return res.status(500).json({
        error: 'The model returned an empty response',
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(stripJsonFences(rawText));
    } catch (e) {
      console.error('[breakdown] JSON parse failed:', e.message, rawText.slice(0, 500));
      return res.status(500).json({
        error: 'Could not parse AI response as JSON. Try again.',
      });
    }

    if (!parsed.phrase && parsed.word) {
      parsed.phrase = parsed.word;
    }

    parsed.firstMentions = normalizeFirstMentions(parsed);
    delete parsed.firstMention;
    delete parsed.firstMentionReference;
    delete parsed.firstMentionNote;

    if (Array.isArray(parsed.crossReferences)) {
      parsed.crossReferences = parsed.crossReferences
        .map((entry) => {
          if (typeof entry === 'string') return entry.trim();
          if (entry && typeof entry === 'object' && typeof entry.reference === 'string') {
            return entry.reference.trim();
          }
          return '';
        })
        .filter(Boolean);
    } else {
      parsed.crossReferences = [];
    }

    if (!cacheOff) {
      breakdownCache.set(cKey, parsed);
    }

    res.setHeader('X-Breakdown-Cache', cacheOff ? 'OFF' : 'MISS');
    if (req.user?.id) {
      const meta = await incrementUserStudyCount(req.user.id);
      attachStudyMetaHeaders(res, meta);
    }
    res.json(parsed);
  } catch (err) {
    next(err);
  }
});

export default router;
