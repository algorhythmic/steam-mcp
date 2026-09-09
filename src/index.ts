#!/usr/bin/env node
import { loadConfig } from './config.js';
import { SteamMcpServer } from './server.js';

async function main() {
    const { apiKey } = loadConfig();
    const server = new SteamMcpServer(apiKey);
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.once(signal, async () => {
            await server.close();
            process.exit(0);
        });
    }
    await server.run();
}

main().catch(error => {
    console.error('Failed to start Steam MCP server:', error instanceof Error ? error.message : 'Unknown startup error');
    process.exit(1);
});
