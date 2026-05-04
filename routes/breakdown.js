import { Router } from 'express';
import { anthropic } from '../lib/anthropic.js';
import {
  breakdownCache,
  breakdownCacheKey,
  isBreakdownCacheDisabled,
} from '../lib/breakdown-cache.js';

const router = Router();

const SYSTEM_PROMPT = `You are a biblical scholar and gifted communicator. When given a word from a Bible verse, produce a structured breakdown in JSON format only. No preamble, no markdown fences, just raw JSON.

Return exactly this structure:
{
  "word": "the word as it appears in the verse",
  "reference": "the scripture reference",
  "original": "the Greek or Hebrew word in its original script",
  "transliteration": "romanised pronunciation",
  "language": "Greek or Hebrew",
  "definition": "what the word meant in its original biblical and cultural context (2-3 sentences)",
  "caseStudyStyle": "story" | "cinematic" | "historical" | "parable",
  "caseStudyLabel": "Short story" | "Cinematic" | "Historical analogy" | "Parable",
  "caseStudy": "A vivid narrative modern-day illustration. Story = named character, real situation. Cinematic = atmospheric scene, no named character. Historical = real historical event mirroring the concept. Parable = parable-style prose echoing biblical tone. Write 2-3 short paragraphs. Use <em> tags for atmosphere, <strong> for the original word when it appears.",
  "crossReferences": ["Ref 1", "Ref 2", "Ref 3", "Ref 4"],
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
  yor: `The reader's study language is Yorùbá (Yoruba). Write definition, caseStudy, commentary, caseStudyLabel, and commentaryAttribution in Yorùbá with natural tone marks where appropriate. Keep caseStudyStyle as exactly one of: story | cinematic | historical | parable (English, lowercase). Keep original Hebrew/Greek in "original" and romanisation in "transliteration". The "word" field must match the tapped surface word from the verse. Use conventional reference formatting for crossReferences.`,
};

router.post('/', async (req, res, next) => {
  try {
    const { word, reference, verseText, translation, studyLanguage } =
      req.body ?? {};

    if (!word || !reference || !verseText) {
      return res.status(400).json({
        error:
          'Request body must include word, reference, and verseText (translation optional)',
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
      word,
      reference,
      verseText,
      translation,
      studyLanguage: studyLang,
      model,
    });

    if (!cacheOff) {
      const cached = breakdownCache.get(cKey);
      if (cached) {
        res.setHeader('X-Breakdown-Cache', 'HIT');
        return res.json(cached);
      }
    }

    const extra = STUDY_LANGUAGE_NOTE[studyLang] || STUDY_LANGUAGE_NOTE.eng;

    const userContent = [
      `Word (as tapped): ${word}`,
      `Reference: ${reference}`,
      translation ? `Translation: ${translation}` : null,
      extra ? `\n${extra}` : null,
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

    if (!cacheOff) {
      breakdownCache.set(cKey, parsed);
    }

    res.setHeader('X-Breakdown-Cache', cacheOff ? 'OFF' : 'MISS');
    res.json(parsed);
  } catch (err) {
    next(err);
  }
});

export default router;
