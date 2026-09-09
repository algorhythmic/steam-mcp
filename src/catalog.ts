import { parseToolArgs } from './schemas.js';
import type { SteamHttpClient } from './http.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

type App = { appid: number; name: string; last_modified?: number; price_change_number?: number };
type CatalogPage = { applist: { apps: App[] }; has_more: boolean; next_cursor?: number };

export class Catalog {
    private cache = new Map<string, { expires: number; page: CatalogPage }>();

    constructor(private client: SteamHttpClient, private now = Date.now) {}

    async list(input: unknown, signal?: AbortSignal): Promise<CatalogPage> {
        const options = parseToolArgs('getAppList', input);
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
        const { data } = await this.client.get('/IStoreService/GetAppList/v1/', { params, signal });
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
