
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000/api/mcp';

async function callMcp(method: string, params?: any) {
    console.log(`\n--- Calling ${method} ---`);
    try {
        const res = await fetch(BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ method, params })
        });
        const data = await res.json();
        console.log("Status:", res.status);
        if (res.status === 200) {
            const preview = JSON.stringify(data, null, 2).slice(0, 500); // Truncate
            console.log("Response (first 500 chars):", preview);
            return data;
        } else {
            console.error("Error:", data);
        }
    } catch (e) {
        console.error("Fetch Error:", e);
    }
}

async function test() {
    // 1. List Projects
    const resources: any = await callMcp("resources/list");

    // 2. Read first project (if exists)
    if (resources?.resources?.length > 0) {
        const firstUri = resources.resources[0].uri;
        await callMcp("resources/read", { uri: firstUri });
    }

    // 3. List Prompts
    const prompts: any = await callMcp("prompts/list");

    // 4. Get first prompt
    if (prompts?.prompts?.length > 0) {
        const firstName = prompts.prompts[0].name;
        await callMcp("prompts/get", { name: firstName });
    }
}

test();
