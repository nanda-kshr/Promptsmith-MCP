
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

const EXPERT_MODE = {
    name: "EXPERT",
    features: {
        vision: {
            name: "Vision",
            method: "USER_INPUT",
            enabled: true
        },
        user_flow: {
            name: "User Flow",
            method: "USER_INPUT",
            enabled: true
        },
        tech_choices: {
            name: "Tech Choices",
            method: "USER_INPUT",
            enabled: true
        },
        data_models: {
            name: "Data Models",
            method: "USER_INPUT",
            enabled: true
        },
        rules: {
            name: "Rules",
            method: "USER_INPUT",
            enabled: true
        },
        apis: {
            name: "APIs",
            method: "USER_INPUT",
            enabled: true
        },
        execute_coding: {
            name: "Execute Coding",
            method: "EXECUTE",
            enabled: true
        },
        refactor: {
            name: "Refactor",
            method: "USER_INPUT",
            enabled: true
        }
    }
};

async function seed() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error("No MONGODB_URI");
        process.exit(1);
    }

    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db(process.env.MONGODB_DB || 'promptsmith');
        const modesCollection = db.collection('modes');

        // Update if exists, insert if not
        const result = await modesCollection.updateOne(
            { name: EXPERT_MODE.name },
            { $set: EXPERT_MODE },
            { upsert: true }
        );

        console.log(`Seeding complete. Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}, UpsertedId: ${result.upsertedId}`);

    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

seed();
