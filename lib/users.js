import { getMongoClient } from "./mongo.js";
import { themeFromDoc } from "./theme.js";

export async function getUsersCollection() {
  const client = await getMongoClient();
  const dbName = process.env.MONGODB_DB_NAME || "study-logos";
  return client.db(dbName).collection("users");
}

export async function ensureUserIndexes() {
  const users = await getUsersCollection();
  await users.createIndex({ email: 1 }, { unique: true });
}

export function normalizeEmail(email) {
  return String(email ?? "")
    .trim()
    .toLowerCase();
}

export function publicUser(doc) {
  return {
    id: String(doc._id),
    fullName: doc.fullName,
    email: doc.email,
    theme: themeFromDoc(doc),
  };
}
