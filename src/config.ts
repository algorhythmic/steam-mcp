import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

export function loadConfig({
    envPath = fileURLToPath(new URL('../.env', import.meta.url)),
    environment = process.env,
}: { envPath?: string; environment?: NodeJS.ProcessEnv } = {}) {
    const values: Record<string, string> = {};
    for (const [name, value] of Object.entries(environment)) {
        if (value !== undefined) values[name] = value;
    }
    const result = dotenv.config({ path: envPath, processEnv: values });
    if (result.error && (result.error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error(`Could not read configuration file ${envPath}. Check its path and permissions.`);
    }
    const apiKey = values.STEAM_API_KEY?.trim();
    if (!apiKey) {
        throw new Error('STEAM_API_KEY is required. Set it in the MCP client environment or in the optional project .env file.');
    }
    return { apiKey };
}
