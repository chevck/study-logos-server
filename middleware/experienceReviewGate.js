import { getUsersCollection } from '../lib/users.js';
import {
  EXPERIENCE_REVIEW_STUDY_THRESHOLD,
  experienceReviewRequired,
  userObjectId,
} from '../lib/study.js';

const REVIEW_MESSAGE = `After ${EXPERIENCE_REVIEW_STUDY_THRESHOLD} word studies, please share a quick review before continuing.`;

function reviewRequiredError() {
  const err = new Error(REVIEW_MESSAGE);
  err.statusCode = 403;
  err.code = 'EXPERIENCE_REVIEW_REQUIRED';
  return err;
}

/** Logged-in users with a pending experience review cannot start new breakdowns. */
export async function enforceExperienceReview(req, _res, next) {
  if (!req.user?.id) {
    return next();
  }

  try {
    const users = await getUsersCollection();
    const user = await users.findOne({ _id: userObjectId(req.user.id) });
    if (user && experienceReviewRequired(user)) {
      return next(reviewRequiredError());
    }
    return next();
  } catch (err) {
    return next(err);
  }
}
