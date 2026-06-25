import { Router } from 'express';
import { anthropic } from '../lib/anthropic.js';
import {
  normalizeVerseText,
  preparePhrases,
} from '../lib/phrase-align.js';
import {
  isPhraseCacheDisabled,
  phraseCache,
  phraseCacheKey,
} from '../lib/phrase-cache.js';

const router = Router();

const MAX_ATTEMPTS = 3;

const SYSTEM_PROMPT = `You are a biblical scholar. Map an English Bible verse to clickable study units aligned with Greek or Hebrew words in the original text.

Each unit corresponds to ONE original-language word (lexeme) and its transliteration. The English "text" for a unit may be:
- a single English word (most common when translation is 1:1), OR
- several adjacent English words when the translation renders one original word with a phrase (e.g. "mercy seat", "In the beginning").

Return JSON only. No preamble, no markdown fences, just raw JSON.

Return exactly this structure:
{
  "reference": "the scripture reference",
  "phrases": [
    {
      "id": "p0",
      "text": "exact contiguous English substring from the verse",
      "transliteration": "romanised pronunciation for this ONE original word",
      "original": "the Greek or Hebrew word in original script",
      "language": "Greek or Hebrew"
    }
  ]
}

Rules:
- Segment by original-language WORD boundaries (transliteration units), NOT by English clause or sentence rhythm.
- Prefer the finest correct alignment: if one English word maps to one Greek/Hebrew word, that unit must be that single word alone.
- Group English words ONLY when they jointly translate one original word.
- Never merge two distinct original words into one unit.
- Never split one original word across multiple units.
- Each unit "text" MUST be copied CHARACTER FOR CHARACTER from the supplied English verse (same spelling, punctuation, and spaces).
- Units must cover the FULL verse with no gaps, overlaps, or reordering when concatenated.
- Use ids p0, p1, p2, ... in order.
- Articles, conjunctions, and particles each get their own unit when they are separate words in the original.`;

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

async function requestPhraseMapping({ model, reference, verseText, translation, retryError }) {
  const retryNote = retryError
    ? `\n\nIMPORTANT: Your previous response failed validation (${retryError}). Copy each unit's "text" CHARACTER FOR CHARACTER from the verse below. Do not paraphrase, re-punctuate, or change quotes. Concatenated unit texts must equal the verse exactly.`
    : '';

  const userContent = [
    `Reference: ${reference}`,
    translation ? `Translation: ${translation}` : null,
    '',
    'English verse (segment this exactly — copy substrings verbatim):',
    verseText,
    retryNote,
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
    return { error: 'The model returned an empty response' };
  }

  let parsed;
  try {
    parsed = JSON.parse(stripJsonFences(rawText));
  } catch (e) {
    console.error('[phrases] JSON parse failed:', e.message, rawText.slice(0, 500));
    return { error: 'Could not parse AI response as JSON. Try again.' };
  }

  const prepared = preparePhrases(verseText, parsed.phrases);
  if (!prepared.phrases) {
    return {
      error: prepared.error ?? 'Could not align phrases to verse',
      parsed,
    };
  }

  return {
    phrases: prepared.phrases,
    reference: String(parsed.reference ?? reference).trim(),
  };
}

router.post('/', async (req, res, next) => {
  try {
    const { reference, verseText, translation, studyLanguage } = req.body ?? {};

    if (!reference || !verseText) {
      return res.status(400).json({
        error: 'Request body must include reference and verseText',
      });
    }

    const normalizedVerse = normalizeVerseText(verseText);
    if (!normalizedVerse) {
      return res.status(400).json({ error: 'Verse text is empty' });
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
    const cacheOff = isPhraseCacheDisabled();
    const cKey = phraseCacheKey({
      reference,
      verseText: normalizedVerse,
      translation,
      studyLanguage: studyLang,
      model,
    });

    if (!cacheOff) {
      const cached = phraseCache.get(cKey);
      if (cached) {
        res.setHeader('X-Phrase-Cache', 'HIT');
        return res.json(cached);
      }
    }

    let lastError = null;
    let result = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const outcome = await requestPhraseMapping({
        model,
        reference,
        verseText: normalizedVerse,
        translation,
        retryError: attempt > 0 ? lastError : null,
      });

      if (outcome.phrases) {
        result = {
          reference: outcome.reference,
          phrases: outcome.phrases,
        };
        break;
      }

      lastError = outcome.error ?? 'Unknown alignment error';
      console.warn(`[phrases] attempt ${attempt + 1}/${MAX_ATTEMPTS} failed:`, lastError);
    }

    if (!result) {
      console.error('[phrases] all attempts failed:', lastError);
      return res.status(500).json({
        error: 'Word mapping did not align with the verse. Try again.',
      });
    }

    if (!cacheOff) {
      phraseCache.set(cKey, result);
    }

    res.setHeader('X-Phrase-Cache', cacheOff ? 'OFF' : 'MISS');
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
