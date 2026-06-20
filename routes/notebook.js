import { Router } from 'express';
import { requireSession } from '../middleware/auth.js';
import { getNotebooksCollection } from '../lib/mongo.js';

const router = Router();

const MAX_ENTRIES = 500;

function isValidNotebookId(id) {
  return (
    typeof id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  );
}

function validateEntry(e) {
  return (
    e &&
    typeof e === 'object' &&
    typeof e.id === 'string' &&
    e.id.length <= 500 &&
    typeof e.word === 'string' &&
    typeof e.reference === 'string' &&
    typeof e.original === 'string' &&
    typeof e.transliteration === 'string' &&
    typeof e.definition === 'string'
  );
}

router.get('/:notebookId', async (req, res, next) => {
  try {
    const { notebookId } = req.params;
    if (!isValidNotebookId(notebookId)) {
      return res.status(400).json({ error: 'Invalid notebook id' });
    }
    const col = await getNotebooksCollection();
    const doc = await col.findOne({ _id: notebookId });
    res.json({ entries: doc?.entries ?? [] });
  } catch (err) {
    next(err);
  }
});

router.put('/:notebookId', requireSession, async (req, res, next) => {
  try {
    const { notebookId } = req.params;
    if (!isValidNotebookId(notebookId)) {
      return res.status(400).json({ error: 'Invalid notebook id' });
    }
    const { entries } = req.body ?? {};
    if (!Array.isArray(entries)) {
      return res.status(400).json({ error: 'entries must be an array' });
    }
    if (entries.length > MAX_ENTRIES) {
      return res.status(400).json({ error: `At most ${MAX_ENTRIES} entries` });
    }
    if (!entries.every(validateEntry)) {
      return res.status(400).json({ error: 'Invalid entry shape' });
    }
    const col = await getNotebooksCollection();
    await col.updateOne(
      { _id: notebookId },
      {
        $set: {
          entries,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
