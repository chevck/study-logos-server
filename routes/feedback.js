import { Router } from 'express';
import {
  ensureExperienceReviewIndexes,
  markUserExperienceReviewSubmitted,
  saveExperienceReview,
  validateExperienceReview,
} from '../lib/experienceReviews.js';
import { getUserStudyState, userObjectId } from '../lib/study.js';
import { getUsersCollection } from '../lib/users.js';
import { requireSession } from '../middleware/auth.js';

const router = Router();

let indexesReady = false;

async function ready() {
  if (!indexesReady) {
    await ensureExperienceReviewIndexes();
    indexesReady = true;
  }
}

router.post('/experience', requireSession, async (req, res, next) => {
  try {
    await ready();

    const validationError = validateExperienceReview(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const users = await getUsersCollection();
    const user = await users.findOne({ _id: userObjectId(req.user.id) });
    if (!user) {
      return res.status(401).json({ error: 'Sign in to continue.' });
    }

    if (user.experienceReviewSubmittedAt) {
      const state = await getUserStudyState(req.user.id);
      return res.json({
        ok: true,
        studyCount: state.studyCount,
        experienceReviewRequired: false,
      });
    }

    const payload = {
      rating: Number(req.body.rating),
      recommendRating: Number(req.body.recommendRating),
      enjoyedMost: String(req.body.enjoyedMost).trim(),
      wishHad: String(req.body.wishHad).trim(),
      mostHelpfulSection: String(req.body.mostHelpfulSection).trim(),
    };

    await saveExperienceReview(req.user.id, user.email, payload);
    await markUserExperienceReviewSubmitted(req.user.id);

    const state = await getUserStudyState(req.user.id);
    res.json({
      ok: true,
      studyCount: state.studyCount,
      experienceReviewRequired: false,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
