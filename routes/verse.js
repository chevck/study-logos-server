import { Router } from "express";
import { fetchVerseText } from "../lib/bible.js";

const router = Router();

function normalizeBibleLanguage(raw) {
  const s = String(raw ?? "eng")
    .trim()
    .toLowerCase();
  if (/^[a-z]{3}$/.test(s)) return s;
  if (s === "en") return "eng";
  if (s === "yo") return "yor";
  return "eng";
}

router.get("/", async (req, res, next) => {
  try {
    const { reference, translation } = req.query;
    if (!reference || typeof reference !== "string") {
      return res.status(400).json({
        error: "Missing or invalid query parameter: reference",
      });
    }

    const bibleLang = normalizeBibleLanguage(req.query.language);
    const defaultTrans = bibleLang === "yor" ? "OYCB" : "NKJV";
    const trans =
      typeof translation === "string" && translation.trim()
        ? translation.trim()
        : defaultTrans;
    const result = await fetchVerseText(reference, trans, bibleLang);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
