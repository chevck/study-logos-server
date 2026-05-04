import { MongoClient } from "mongodb";

let clientPromise;

export function getMongoClient() {
  const uri = process.env.MONGODB_URI;
  console.log({ uri });
  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }
  if (!clientPromise) {
    const client = new MongoClient(uri);
    clientPromise = client.connect().then(() => client);
  }
  return clientPromise;
}

export async function getNotebooksCollection() {
  const client = await getMongoClient();
  const dbName = process.env.MONGODB_DB_NAME || "study-logos";
  return client.db(dbName).collection("notebooks");
}
