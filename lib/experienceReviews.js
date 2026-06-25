import { getMongoClient } from './mongo.js';
import { userObjectId } from './study.js';

export const MOST_HELPFUL_SECTIONS = [
  'originalLanguage',
  'definition',
  'caseStudy',
  'crossReferences',
  'firstMention',
  'commentary',
];

export async function getExperienceReviewsCollection() {
  const client = await getMongoClient();
  const dbName = process.env.MONGODB_DB_NAME || 'study-logos';
  return client.db(dbName).collection('experience_reviews');
}

export async function ensureExperienceReviewIndexes() {
  const col = await getExperienceReviewsCollection();
  await col.createIndex({ userId: 1 }, { unique: true });
  await col.createIndex({ submittedAt: -1 });
}

export function validateExperienceReview(body) {
  const rating = Number(body?.rating);
  const recommendRating = Number(body?.recommendRating);
  const enjoyedMost = String(body?.enjoyedMost ?? '').trim();
  const wishHad = String(body?.wishHad ?? '').trim();
  const mostHelpfulSection = String(body?.mostHelpfulSection ?? '').trim();

  if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
    return 'Choose an overall rating from 1 to 10.';
  }
  if (!Number.isInteger(recommendRating) || recommendRating < 1 || recommendRating > 10) {
    return 'Choose a recommendation rating from 1 to 10.';
  }
  if (enjoyedMost.length < 3) {
    return 'Tell us a little about what you have enjoyed so far.';
  }
  if (wishHad.length < 3) {
    return 'Tell us what you wish the app had or what would help your study.';
  }
  if (!MOST_HELPFUL_SECTIONS.includes(mostHelpfulSection)) {
    return 'Choose which part of the breakdown helps you most.';
  }

  return null;
}

export async function saveExperienceReview(userId, userEmail, payload) {
  const col = await getExperienceReviewsCollection();
  const now = new Date();
  const doc = {
    userId: String(userId),
    email: userEmail ?? null,
    rating: payload.rating,
    recommendRating: payload.recommendRating,
    enjoyedMost: payload.enjoyedMost,
    wishHad: payload.wishHad,
    mostHelpfulSection: payload.mostHelpfulSection,
    submittedAt: now,
  };

  await col.updateOne(
    { userId: String(userId) },
    { $set: doc },
    { upsert: true },
  );

  return doc;
}

export async function markUserExperienceReviewSubmitted(userId) {
  const { getUsersCollection } = await import('./users.js');
  const users = await getUsersCollection();
  await users.updateOne(
    { _id: userObjectId(userId) },
    {
      $set: {
        experienceReviewSubmittedAt: new Date(),
        updatedAt: new Date(),
      },
    },
  );
}
