import axios from "axios";

const BASE = "https://rest.api.bible/v1";

/** Map UI translation codes to API.Bible bible ids (set via env or resolved from /bibles). */
const ENV_BIBLE_IDS = {
  NKJV: process.env.BIBLE_ID_NKJV,
  NLT: process.env.BIBLE_ID_NLT,
  AMP: process.env.BIBLE_ID_AMP,
  OYCB: process.env.BIBLE_ID_OYCB,
};

/** Normalise book names / common abbreviations → API.Bible 3-letter book codes */
const BOOK_CODES = buildBookCodeMap();

function buildBookCodeMap() {
  const pairs = [
    ["Genesis", "GEN"],
    ["Exodus", "EXO"],
    ["Leviticus", "LEV"],
    ["Numbers", "NUM"],
    ["Deuteronomy", "DEU"],
    ["Joshua", "JOS"],
    ["Judges", "JDG"],
    ["Ruth", "RUT"],
    ["1 Samuel", "1SA"],
    ["2 Samuel", "2SA"],
    ["1 Kings", "1KI"],
    ["2 Kings", "2KI"],
    ["1 Chronicles", "1CH"],
    ["2 Chronicles", "2CH"],
    ["Ezra", "EZR"],
    ["Nehemiah", "NEH"],
    ["Esther", "EST"],
    ["Job", "JOB"],
    ["Psalm", "PSA"],
    ["Psalms", "PSA"],
    ["Proverbs", "PRO"],
    ["Ecclesiastes", "ECC"],
    ["Song of Solomon", "SNG"],
    ["Isaiah", "ISA"],
    ["Jeremiah", "JER"],
    ["Lamentations", "LAM"],
    ["Ezekiel", "EZK"],
    ["Daniel", "DAN"],
    ["Hosea", "HOS"],
    ["Joel", "JOE"],
    ["Amos", "AMO"],
    ["Obadiah", "OBA"],
    ["Jonah", "JON"],
    ["Micah", "MIC"],
    ["Nahum", "NAM"],
    ["Habakkuk", "HAB"],
    ["Zephaniah", "ZEP"],
    ["Haggai", "HAG"],
    ["Zechariah", "ZEC"],
    ["Malachi", "MAL"],
    ["Matthew", "MAT"],
    ["Mark", "MRK"],
    ["Luke", "LUK"],
    ["John", "JHN"],
    ["Acts", "ACT"],
    ["Romans", "ROM"],
    ["1 Corinthians", "1CO"],
    ["2 Corinthians", "2CO"],
    ["Galatians", "GAL"],
    ["Ephesians", "EPH"],
    ["Philippians", "PHP"],
    ["Colossians", "COL"],
    ["1 Thessalonians", "1TH"],
    ["2 Thessalonians", "2TH"],
    ["1 Timothy", "1TI"],
    ["2 Timothy", "2TI"],
    ["Titus", "TIT"],
    ["Philemon", "PHM"],
    ["Hebrews", "HEB"],
    ["James", "JAS"],
    ["1 Peter", "1PE"],
    ["2 Peter", "2PE"],
    ["1 John", "1JN"],
    ["2 John", "2JN"],
    ["3 John", "3JN"],
    ["Jude", "JUD"],
    ["Revelation", "REV"],
  ];

  const map = new Map();
  for (const [name, code] of pairs) {
    map.set(normaliseBookKey(name), code);
    map.set(normaliseBookKey(name.replace(/\s+/g, "")), code);
  }

  const short = [
    ["Gen", "GEN"],
    ["Ex", "EXO"],
    ["Exod", "EXO"],
    ["Lev", "LEV"],
    ["Num", "NUM"],
    ["Deut", "DEU"],
    ["Josh", "JOS"],
    ["Jdg", "JDG"],
    ["Judg", "JDG"],
    ["Ru", "RUT"],
    ["Rth", "RUT"],
    ["1Sam", "1SA"],
    ["2Sam", "2SA"],
    ["1Ki", "1KI"],
    ["2Ki", "2KI"],
    ["1Chr", "1CH"],
    ["2Chr", "2CH"],
    ["Neh", "NEH"],
    ["Ps", "PSA"],
    ["Psalm", "PSA"],
    ["Prov", "PRO"],
    ["Eccl", "ECC"],
    ["Song", "SNG"],
    ["Isa", "ISA"],
    ["Jer", "JER"],
    ["Lam", "LAM"],
    ["Ezek", "EZK"],
    ["Dan", "DAN"],
    ["Hos", "HOS"],
    ["Joe", "JOE"],
    ["Am", "AMO"],
    ["Ob", "OBA"],
    ["Jon", "JON"],
    ["Mic", "MIC"],
    ["Na", "NAM"],
    ["Hab", "HAB"],
    ["Zeph", "ZEP"],
    ["Hag", "HAG"],
    ["Zech", "ZEC"],
    ["Mal", "MAL"],
    ["Mt", "MAT"],
    ["Matt", "MAT"],
    ["Mk", "MRK"],
    ["Mrk", "MRK"],
    ["Lk", "LUK"],
    ["Jn", "JHN"],
    ["Jhn", "JHN"],
    ["Ac", "ACT"],
    ["Rom", "ROM"],
    ["1Co", "1CO"],
    ["2Co", "2CO"],
    ["Gal", "GAL"],
    ["Eph", "EPH"],
    ["Phil", "PHP"],
    ["Php", "PHP"],
    ["Col", "COL"],
    ["1Th", "1TH"],
    ["2Th", "2TH"],
    ["1Ti", "1TI"],
    ["2Ti", "2TI"],
    ["Tit", "TIT"],
    ["Phm", "PHM"],
    ["Heb", "HEB"],
    ["Jam", "JAS"],
    ["Jas", "JAS"],
    ["1Pe", "1PE"],
    ["2Pe", "2PE"],
    ["1Jn", "1JN"],
    ["2Jn", "2JN"],
    ["3Jn", "3JN"],
    ["Jud", "JUD"],
    ["Jude", "JUD"],
    ["Rev", "REV"],
  ];
  for (const [abbr, code] of short) {
    if (code) map.set(normaliseBookKey(abbr), code);
  }

  return map;
}

function normaliseBookKey(s) {
  return s.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
}

/** API.Bible verse id, e.g. ROM.6.3 */
const VERSE_ID_RE = /^([1-3]?[A-Z]{2,4})\.(\d+)\.(\d+)$/i;

/** Shorthand range id, e.g. ROM.6.3-4 */
const PASSAGE_SHORTHAND_RE = /^([1-3]?[A-Z]{2,4})\.(\d+)\.(\d+)-(\d+)$/i;

/** Full passage id, e.g. ROM.6.3-ROM.6.4 */
const PASSAGE_FULL_RE =
  /^([1-3]?[A-Z]{2,4})\.(\d+)\.(\d+)-([1-3]?[A-Z]{2,4})\.(\d+)\.(\d+)$/i;

/**
 * API.Bible passage ids use two verse ids: ROM.6.3-ROM.6.4 (not ROM.6.3-4).
 */
function toFullPassageId(book, chapter, startVerse, endVerse) {
  const b = book.toUpperCase();
  const start = `${b}.${chapter}.${startVerse}`;
  const end = `${b}.${chapter}.${endVerse}`;
  return start === end ? start : `${start}-${end}`;
}

/**
 * Parse references like "Romans 5:13", "Rom 5:13-14", "1 Cor 13:4", "ROM.6.3-4", or "ROM.6.3-ROM.6.4"
 */
export function referenceToPassageId(reference) {
  const trimmed = reference.trim();

  const full = trimmed.match(PASSAGE_FULL_RE);
  if (full) {
    return toFullPassageId(full[1], full[2], full[3], full[6]);
  }

  const shorthand = trimmed.match(PASSAGE_SHORTHAND_RE);
  if (shorthand) {
    return toFullPassageId(shorthand[1], shorthand[2], shorthand[3], shorthand[4]);
  }

  const single = trimmed.match(VERSE_ID_RE);
  if (single) {
    return `${single[1].toUpperCase()}.${single[2]}.${single[3]}`;
  }

  const match = trimmed.match(/^(.+?)\s+(\d+)\s*:\s*(\d+(?:\s*-\s*\d+)?)$/i);
  if (!match) {
    throw new Error(
      `Could not parse scripture reference "${reference}". Try e.g. Romans 5:13 or ROM.6.3-4`,
    );
  }

  const bookPart = match[1].trim();
  const chapter = match[2];
  const versePart = match[3].replace(/\s+/g, "");
  const bookCode = resolveBookCode(bookPart);

  if (versePart.includes("-")) {
    const [start, end] = versePart.split("-");
    return toFullPassageId(bookCode, chapter, start, end);
  }

  return `${bookCode}.${chapter}.${versePart}`;
}

/** @deprecated Use referenceToPassageId */
export function referenceToVerseId(reference) {
  const id = referenceToPassageId(reference);
  return id.includes("-") ? id.split("-")[0] : id;
}

function isVerseRange(passageId) {
  return PASSAGE_FULL_RE.test(passageId);
}

function singleVerseId(passageId) {
  return passageId.split("-")[0];
}

function resolveBookCode(bookPart) {
  const key = normaliseBookKey(bookPart);
  const code = BOOK_CODES.get(key);
  if (code) return code;

  const compact = normaliseBookKey(bookPart.replace(/\s+/g, ""));
  const code2 = BOOK_CODES.get(compact);
  if (code2) return code2;

  throw new Error(`Unknown Bible book: "${bookPart}"`);
}

/** @type {Map<string, object[]>} */
const bibleListCacheByLang = new Map();
const bibleListInflightByLang = new Map();

async function fetchBibleList(apiKey, language = "eng") {
  const { data } = await axios.get(`${BASE}/bibles`, {
    headers: { "api-key": apiKey },
    params: { language },
  });
  return data.data ?? [];
}

async function getBibleList(apiKey, language) {
  const cached = bibleListCacheByLang.get(language);
  if (cached) return cached;
  if (bibleListInflightByLang.has(language)) {
    return bibleListInflightByLang.get(language);
  }
  const p = fetchBibleList(apiKey, language).then((list) => {
    bibleListCacheByLang.set(language, list);
    bibleListInflightByLang.delete(language);
    return list;
  });
  bibleListInflightByLang.set(language, p);
  return p;
}

function defaultTranslationCode(language) {
  return language === "yor" ? "OYCB" : "NKJV";
}

async function resolveBibleId(translation, apiKey, language = "eng") {
  const upper = String(
    translation || defaultTranslationCode(language),
  ).toUpperCase();
  if (ENV_BIBLE_IDS[upper]) return ENV_BIBLE_IDS[upper];

  const list = await getBibleList(apiKey, language);

  const wanted = upper;
  const found = list.find((b) => {
    const abbr = (b.abbreviation || b.abbreviationLocal || "").toUpperCase();
    const name = (b.name || "").toUpperCase();
    const short = (b.description || "").toUpperCase();
    return (
      abbr === wanted ||
      name.includes(wanted) ||
      short.includes(wanted) ||
      name.replace(/\s+/g, "").includes(wanted)
    );
  });

  if (!found?.id) {
    throw new Error(
      `No Bible id found for translation "${translation}". Set BIBLE_ID_${upper} in server/.env or pick a translation returned by API.Bible for your key.`,
    );
  }
  return found.id;
}

function stripHtml(html) {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ");
}

function stripSectionHeadings(html) {
  if (!html) return "";
  return html.replace(
    /<(p|div|span|h[1-6])\b[^>]*\bclass=["'][^"']*\b(?:s\d*|ms\d*|mr|mt\d*|d|r)\b[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi,
    " ",
  );
}

function cleanVerseText(raw) {
  let text = stripHtml(stripSectionHeadings(raw));
  text = text.replace(/\[[a-z0-9]+\]/gi, "");
  text = text.replace(/\(\s*[a-z]\s*\)/gi, "");
  text = text.replace(/[\u0000-\u001f]+/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

export async function fetchVerseText(
  reference,
  translation,
  bibleLanguage = "eng",
) {
  const apiKey = process.env.BIBLE_API_KEY;
  if (!apiKey) {
    throw new Error("BIBLE_API_KEY is not configured on the server");
  }

  const lang = bibleLanguage || "eng";
  const bibleId = await resolveBibleId(translation, apiKey, lang);
  const passageId = referenceToPassageId(reference);
  const resource = isVerseRange(passageId) ? "passages" : "verses";
  const resourceId = isVerseRange(passageId)
    ? passageId
    : singleVerseId(passageId);

  const { data } = await axios.get(
    `${BASE}/bibles/${bibleId}/${resource}/${encodeURIComponent(resourceId)}`,
    {
      headers: { "api-key": apiKey },
      params: {
        "include-chapter-numbers": false,
        "include-verse-numbers": false,
        "content-type": "html",
      },
    },
  );

  const content = data?.data?.content ?? "";
  const refOut = data?.data?.reference ?? reference;
  const text = cleanVerseText(content);

  if (!text) {
    throw new Error(`No verse text returned for ${reference}`);
  }

  return {
    reference: refOut,
    translation: String(
      translation || defaultTranslationCode(lang),
    ).toUpperCase(),
    bibleLanguage: lang,
    text,
  };
}
