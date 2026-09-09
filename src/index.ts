#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'path'; // Import path module
import { fileURLToPath } from 'url'; // Needed for __dirname in ES modules

// Get directory name in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly point dotenv to the .env file in the project root (one level up from build)
const envPath = path.resolve(__dirname, '..', '.env');
const dotenvResult = dotenv.config({ path: envPath });

if (dotenvResult.error) {
    console.error(`FATAL ERROR: Could not load .env file from ${envPath}:`, dotenvResult.error);
    process.exit(1);
}

import { SteamMcpServer } from './server.js';

// --- Environment Variable Check ---
const STEAM_API_KEY = process.env.STEAM_API_KEY;
if (!STEAM_API_KEY) {
    // Log error to stderr and exit, as the server is unusable without the key.
    console.error("FATAL ERROR: STEAM_API_KEY environment variable is not set.");
    process.exit(1); // Exit immediately
}


const server = new SteamMcpServer(STEAM_API_KEY);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, async () => {
        await server.close();
        process.exit(0);
    });
}
server.run().catch(error => {
    console.error('Failed to start Steam MCP server:', error);
    process.exit(1);
});
