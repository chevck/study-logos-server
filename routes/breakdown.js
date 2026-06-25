import { Router } from 'express';
import { anthropic } from '../lib/anthropic.js';
import {
  breakdownCache,
  breakdownCacheKey,
  isBreakdownCacheDisabled,
} from '../lib/breakdown-cache.js';
import {
  buildUserContent,
  caseStudyCharacterNote,
  extractSectionFromFull,
  isBreakdownSection,
  normalizeFullBreakdown,
  normalizeSectionPayload,
  normalizeStudyLanguage,
  sanitizeReaderFirstName,
  sectionCacheSuffix,
  stripJsonFences,
  STUDY_LANGUAGE_NOTE,
  systemPromptForSection,
} from '../lib/breakdown-sections.js';
import {
  attachStudyMetaHeaders,
  incrementUserStudyCount,
} from '../lib/study.js';

const router = Router();

const FULL_SYSTEM_PROMPT = `You are a biblical scholar and gifted communicator. When given a tapped word or group of words from a Bible verse (aligned to one original-language word via transliteration), produce a structured breakdown in JSON format only. No preamble, no markdown fences, just raw JSON.

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

async function callAnthropic({ model, system, userContent }) {
  const message = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    system,
    messages: [{ role: 'user', content: userContent }],
  });

  const block = message.content?.find((b) => b.type === 'text');
  const rawText = block?.type === 'text' ? block.text : '';

  if (!rawText) {
    const err = new Error('The model returned an empty response');
    err.statusCode = 500;
    throw err;
  }

  try {
    return JSON.parse(stripJsonFences(rawText));
  } catch (e) {
    console.error('[breakdown] JSON parse failed:', e.message, rawText.slice(0, 500));
    const err = new Error('Could not parse AI response as JSON. Try again.');
    err.statusCode = 500;
    throw err;
  }
}

function attachStudyMetaIfNeeded(req, res, section) {
  if (!req.user?.id) return Promise.resolve();
  if (section && section !== 'core') return Promise.resolve();

  return incrementUserStudyCount(req.user.id).then((meta) => {
    attachStudyMetaHeaders(res, meta);
  });
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
      section: sectionRaw,
      coreContext,
    } = req.body ?? {};

    const surfacePhrase = phrase ?? word;
    const readerFirstName = sanitizeReaderFirstName(readerFirstNameRaw);
    const section = isBreakdownSection(sectionRaw) ? sectionRaw : null;

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
    const baseKey = breakdownCacheKey({
      phrase: surfacePhrase,
      reference,
      verseText,
      translation,
      studyLanguage: studyLang,
      model,
      readerFirstName,
    });

    if (!cacheOff) {
      const fullCached = breakdownCache.get(baseKey);
      if (fullCached) {
        if (section) {
          const extracted = extractSectionFromFull(fullCached, section);
          if (extracted) {
            res.setHeader('X-Breakdown-Cache', 'HIT');
            await attachStudyMetaIfNeeded(req, res, section);
            return res.json(extracted);
          }
        } else {
          res.setHeader('X-Breakdown-Cache', 'HIT');
          await attachStudyMetaIfNeeded(req, res, null);
          return res.json(fullCached);
        }
      }

      if (section) {
        const sectionKey = baseKey + sectionCacheSuffix(section);
        const sectionCached = breakdownCache.get(sectionKey);
        if (sectionCached) {
          res.setHeader('X-Breakdown-Cache', 'HIT');
          await attachStudyMetaIfNeeded(req, res, section);
          return res.json(sectionCached);
        }
      }
    }

    if (section) {
      const userContent = buildUserContent({
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
      });

      const parsed = await callAnthropic({
        model,
        system: systemPromptForSection(section),
        userContent,
      });

      const normalized = normalizeSectionPayload(section, parsed);

      if (!cacheOff) {
        breakdownCache.set(baseKey + sectionCacheSuffix(section), normalized);
      }

      res.setHeader('X-Breakdown-Cache', cacheOff ? 'OFF' : 'MISS');
      await attachStudyMetaIfNeeded(req, res, section);
      return res.json(normalized);
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

    const parsed = await callAnthropic({
      model,
      system: FULL_SYSTEM_PROMPT,
      userContent,
    });

    const normalized = normalizeFullBreakdown(parsed);

    if (!cacheOff) {
      breakdownCache.set(baseKey, normalized);
    }

    res.setHeader('X-Breakdown-Cache', cacheOff ? 'OFF' : 'MISS');
    await attachStudyMetaIfNeeded(req, res, null);
    return res.json(normalized);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
});

export default router;
