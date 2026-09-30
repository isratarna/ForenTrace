// One shared MongoDB connection for the whole chatbot.
import dns from 'node:dns';
import { MongoClient } from 'mongodb';

// Some Wi-Fi routers/ISPs refuse the DNS lookup that "mongodb+srv://" needs
// (error: querySrv ECONNREFUSED). Using Google/Cloudflare DNS fixes it.
dns.setServers(['8.8.8.8', '1.1.1.1']);

let clientPromise = null;

function getClient() {
  if (!clientPromise) {
    clientPromise = new MongoClient(process.env.MONGODB_URI)
      .connect()
      .catch(err => {
        clientPromise = null; // allow a retry next time
        throw err;
      });
  }
  return clientPromise;
}

export async function getCollection() {
  const client = await getClient();
  const dbName = process.env.MONGODB_DB || 'forentrace_chatbot';
  return client.db(dbName).collection('faq_chunks');
}

export async function closeMongo() {
  if (!clientPromise) return;
  try {
    const client = await clientPromise;
    await client.close();
  } catch {
    // connection never opened, nothing to close
  }
  clientPromise = null;
}