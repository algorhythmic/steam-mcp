import type { AxiosInstance } from 'axios';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

export const catalogInputSchema = {
    type: 'object' as const,
    properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20, description: 'Maximum apps to return in this page.' },
        cursor: { type: 'integer', minimum: 0, maximum: 4294967295, description: 'Use next_cursor from the previous page.' },
        if_modified_since: { type: 'integer', minimum: 0, description: 'Only apps modified since this Unix timestamp in seconds.' },
        include_games: { type: 'boolean', default: true },
        include_dlc: { type: 'boolean', default: false },
        include_software: { type: 'boolean', default: false },
        include_videos: { type: 'boolean', default: false },
        include_hardware: { type: 'boolean', default: false },
    },
    additionalProperties: false,
} as const;

type CatalogArgs = {
    limit?: number; cursor?: number; if_modified_since?: number;
    include_games?: boolean; include_dlc?: boolean; include_software?: boolean;
    include_videos?: boolean; include_hardware?: boolean;
};
type App = { appid: number; name: string; last_modified?: number; price_change_number?: number };
type CatalogPage = { applist: { apps: App[] }; has_more: boolean; next_cursor?: number };

export class Catalog {
    private cache = new Map<string, { expires: number; page: CatalogPage }>();

    constructor(private client: AxiosInstance, private now = Date.now) {}

    async list(input: unknown): Promise<CatalogPage> {
        const args = input ?? {};
        if (typeof args !== 'object' || Array.isArray(args)) {
            throw new McpError(ErrorCode.InvalidParams, 'getAppList expects an object.');
        }
        for (const [name, value] of Object.entries(args)) {
            const schema = catalogInputSchema.properties[name as keyof typeof catalogInputSchema.properties];
            if (!schema || (schema.type === 'boolean' ? typeof value !== 'boolean'
                : !Number.isSafeInteger(value) || value < schema.minimum || ('maximum' in schema && value > schema.maximum))) {
                throw new McpError(ErrorCode.InvalidParams, `Invalid getAppList field '${name}'. Check the advertised limits and types.`);
            }
        }
        const options = args as CatalogArgs;
        const limit = options.limit ?? 20;
        const params = {
            max_results: limit, last_appid: options.cursor ?? 0,
            if_modified_since: options.if_modified_since ?? 0,
            include_games: options.include_games ?? true, include_dlc: options.include_dlc ?? false,
            include_software: options.include_software ?? false, include_videos: options.include_videos ?? false,
            include_hardware: options.include_hardware ?? false,
        };
        const key = JSON.stringify(params);
        const cached = this.cache.get(key);
        if (cached && cached.expires > this.now()) {
            this.cache.delete(key);
            this.cache.set(key, cached);
            return structuredClone(cached.page);
        }
        const { data } = await this.client.get('/IStoreService/GetAppList/v1/', { params });
        const apps = data?.response?.apps;
        if (!Array.isArray(apps) || !apps.every(app => Number.isInteger(app?.appid) && app.appid > params.last_appid && typeof app.name === 'string')) {
            throw new McpError(ErrorCode.InternalError, 'Steam returned an invalid app catalog page.');
        }
        const pageApps: App[] = apps.slice(0, limit).map(app => ({
            appid: app.appid, name: app.name,
            ...(Number.isSafeInteger(app.last_modified) ? { last_modified: app.last_modified } : {}),
            ...(Number.isSafeInteger(app.price_change_number) ? { price_change_number: app.price_change_number } : {}),
        }));
        const hasMore = apps.length > limit || data.response.have_more_results === true ||
            (data.response.have_more_results === undefined && apps.length === limit);
        if (hasMore && pageApps.length === 0) {
            throw new McpError(ErrorCode.InternalError, 'Steam returned a catalog continuation without any apps.');
        }
        const page: CatalogPage = {
            applist: { apps: pageApps }, has_more: hasMore,
            ...(hasMore ? { next_cursor: pageApps.at(-1)!.appid } : {}),
        };
        this.cache.delete(key);
        if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(key, { expires: this.now() + 300_000, page: structuredClone(page) });
        return page;
    }
}
