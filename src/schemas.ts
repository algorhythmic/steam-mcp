import { z } from 'zod';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

const appid = z.number().int().min(1).max(4294967295).describe('Positive Steam AppID from the /app/ segment of a store URL.');
const timestamp = z.number().int().min(0).max(4294967295).describe('Unix timestamp in seconds, not milliseconds.');
const steamid = z.string().regex(/^[1-9]\d{16}$/, 'Expected a 17-digit SteamID64 string.').describe('17-digit SteamID64, supplied as a string.');
const game = z.strictObject({ appid });
const playerGame = z.strictObject({ appid, steamid });

export const toolSchemas = {
    getCurrentPlayers: game,
    getAppList: z.strictObject({
        limit: z.number().int().min(1).max(100).default(20).describe('Maximum apps in this page.'),
        cursor: z.number().int().min(0).max(4294967295).optional().describe('Use next_cursor from the previous page.'),
        if_modified_since: timestamp.optional(),
        include_games: z.boolean().default(true),
        include_dlc: z.boolean().default(false),
        include_software: z.boolean().default(false),
        include_videos: z.boolean().default(false),
        include_hardware: z.boolean().default(false),
    }),
    getGameSchema: game,
    getAppDetails: z.strictObject({
        appids: z.array(appid).min(1).max(20).describe('One to 20 AppIDs. Duplicate IDs are fetched once.'),
        country: z.string().regex(/^[A-Za-z]{2}$/, 'Expected a two-letter country code, such as US or GB.').toUpperCase().optional(),
    }),
    getGameNews: z.strictObject({
        appid,
        count: z.number().int().min(1).max(100).default(10),
        maxlength: z.number().int().min(0).max(10000).default(300).describe('Maximum characters per news item; 0 requests full content within the response size limit.'),
    }),
    getPlayerAchievements: playerGame,
    getUserStatsForGame: playerGame,
    getGlobalStatsForGame: z.strictObject({
        appid,
        stat_names: z.array(z.string().trim().min(1).max(256)).min(1).max(100),
        start_date: timestamp.optional(),
        end_date: timestamp.optional().describe('Unix timestamp in seconds, on or after start_date.'),
    }).refine(args => args.start_date === undefined || args.end_date === undefined || args.start_date <= args.end_date, {
        path: ['end_date'], message: 'end_date must be greater than or equal to start_date.',
    }),
    getSupportedApiList: z.strictObject({}),
    getGlobalAchievementPercentages: game,
};

export type ToolName = keyof typeof toolSchemas;
export type ToolArgs<Name extends ToolName> = z.infer<(typeof toolSchemas)[Name]>;

export const toolInputSchemas = Object.fromEntries(Object.entries(toolSchemas).map(([name, schema]) => [
    name, { ...z.toJSONSchema(schema, { target: 'draft-7', io: 'input' }), type: 'object' as const },
])) as unknown as Record<ToolName, { type: 'object'; [key: string]: unknown }>;

export function parseToolArgs<Name extends ToolName>(name: Name, input: unknown): ToolArgs<Name> {
    const result = toolSchemas[name].safeParse(input === undefined ? {} : input);
    if (!result.success) {
        const details = result.error.issues.map(issue => `${issue.path.join('.') || 'arguments'}: ${issue.message}`).join('; ');
        throw new McpError(ErrorCode.InvalidParams, `Invalid arguments for ${name}. ${details}`);
    }
    return result.data as ToolArgs<Name>;
}
