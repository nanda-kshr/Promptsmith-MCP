import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || ''; 
const options = {};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;


if (!globalThis._mongoClientPromise){
    const client = new MongoClient(uri,options);
    globalThis._mongoClientPromise = client.connect();
}

clientPromise = globalThis._mongoClientPromise;

export async function getDb(){
    const client = await clientPromise;
    return client.db(process.env.MONGODB_DB)
}

