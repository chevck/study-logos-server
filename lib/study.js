import { ObjectId } from 'mongodb';
import { getUsersCollection } from './users.js';

export const EXPERIENCE_REVIEW_STUDY_THRESHOLD = 5;

export function experienceReviewRequired(userDoc) {
  const count = userDoc?.studyCount ?? 0;
  return (
    count >= EXPERIENCE_REVIEW_STUDY_THRESHOLD &&
    !userDoc?.experienceReviewSubmittedAt
  );
}

export function userObjectId(userId) {
  return ObjectId.isValid(userId) ? new ObjectId(String(userId)) : userId;
}

export async function getUserStudyState(userId) {
  const users = await getUsersCollection();
  const doc = await users.findOne({ _id: userObjectId(userId) });
  if (!doc) {
    return { studyCount: 0, experienceReviewRequired: false };
  }
  return {
    studyCount: doc.studyCount ?? 0,
    experienceReviewRequired: experienceReviewRequired(doc),
  };
}

export async function incrementUserStudyCount(userId) {
  const users = await getUsersCollection();
  const id = userObjectId(userId);
  await users.updateOne(
    { _id: id },
    {
      $inc: { studyCount: 1 },
      $set: { updatedAt: new Date() },
    },
  );
  const doc = await users.findOne({ _id: id });
  return {
    studyCount: doc?.studyCount ?? 0,
    experienceReviewRequired: experienceReviewRequired(doc),
  };
}

export function attachStudyMetaHeaders(res, meta) {
  if (!meta) return;
  res.setHeader('X-Study-Count', String(meta.studyCount));
  if (meta.experienceReviewRequired) {
    res.setHeader('X-Experience-Review-Required', '1');
  }
}
