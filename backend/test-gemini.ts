import { GoogleGenAI } from "@google/genai";
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function run() {
    const client = new GoogleGenAI({});
    console.log("Client created.");
    // upload a dummy file to test
    const fs = require('fs');
    fs.writeFileSync('dummy.txt', 'Hello world');
    const uploaded = await client.files.upload({ file: 'dummy.txt', config: { mimeType: 'text/plain' } });
    console.log("Uploaded:", uploaded.uri);
    
    const interaction = await client.interactions.create({
        model: 'gemini-3.7-flash',
        input: [
            { type: 'document', uri: uploaded.uri, mime_type: 'text/plain' },
            { type: 'text', text: 'What is the content of this file?' }
        ]
    });
    console.log(interaction.output_text);
}
run().catch(console.error);
