
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check() {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/promptsmith';
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db();

    // Project ID from logs
    const projectId = "6985986b50b74bce5a7e689a";

    const feature = await db.collection('project_features').findOne({
        project_id: new ObjectId(projectId),
        feature_key: 'tech_choices'
    });

    console.log("Feature Found:", feature ? "YES" : "NO");
    if (feature) {
        console.log(JSON.stringify(feature, null, 2));
    }

    await client.close();
}

check().catch(console.error);
