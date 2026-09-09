import { SteamHttpClient, type HttpOptions } from './http.js';
import { Catalog } from './catalog.js';
import { toolDefinitions } from './tools.js';
import { parseToolArgs, toolSchemas, type ToolArgs } from './schemas.js';
import { describeError, logError } from './errors.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios, { type AxiosInstance } from 'axios';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

interface GetCurrentPlayersApiResponse {
    response: { player_count: number; result: number };
}

// --- Utility Types ---
// Generic type for the content part of a successful MCP tool response
type McpToolResponseContent = { type: 'text'; text: string };

// Generic type for a successful MCP tool response
type McpToolSuccessResponse = {
    content: McpToolResponseContent[];
    structuredContent: Record<string, unknown>;
    isError?: false;
};

// Generic type for an error MCP tool response
type McpToolErrorResponse = {
    content: McpToolResponseContent[];
    isError: true;
    error?: { code: ErrorCode; message: string }; // Optional structured error
};

// Union type for tool responses
type McpToolResponse = McpToolSuccessResponse | McpToolErrorResponse;

export class SteamMcpServer {
    private server: Server;
    private axiosInstance: SteamHttpClient;
    private storeInstance: SteamHttpClient;
    private catalog: Catalog;

    constructor(private readonly apiKey: string, clients: { webApi?: AxiosInstance; store?: AxiosInstance; http?: HttpOptions } = {}) {
        this.server = new Server(
            {
                // Server metadata
                name: 'steam-mcp-server',
                version: '0.1.0',
                description: 'MCP Server for interacting with the Steam Web API',
            },
            {
                // Server capabilities (only tools in this case)
                capabilities: {
                    tools: {},     // Tools will be defined via handlers
                },
            }
        );

        // Create an axios instance for making requests to the Steam API
        this.axiosInstance = new SteamHttpClient(clients.webApi ?? axios.create({
            baseURL: 'https://api.steampowered.com',
            params: {
                key: apiKey // Add key as a default parameter
            }
        }), clients.http);
        this.storeInstance = new SteamHttpClient(clients.store ?? axios.create(), clients.http);
        this.catalog = new Catalog(this.axiosInstance);
        this.setupToolHandlers();

        // Basic error handling and graceful shutdown
        this.server.onerror = (error) => logError('MCP', error, this.apiKey);

    }

    private setupToolHandlers() {
        // Handler for listing available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return { tools: toolDefinitions };
        });

        // Handler for executing a tool call
        // Refactored handler for executing tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request, extra): Promise<McpToolResponse> => {
            const toolName = request.params.name;
            const args = request.params.arguments;
            if (!Object.hasOwn(toolSchemas, toolName)) {
                throw new McpError(ErrorCode.InvalidParams, 'Unknown tool. Use tools/list to discover available tools.');
            }
            const deadline = new AbortController();
            const timer = setTimeout(() => deadline.abort(new DOMException('Tool deadline exceeded', 'TimeoutError')), 15_000);
            const signal = AbortSignal.any([extra.signal, deadline.signal]);

            try {
                switch (toolName) {
                    case 'getCurrentPlayers':
                        return await this.handleGetCurrentPlayers(parseToolArgs('getCurrentPlayers', args), signal);
                    case 'getAppList':
                        return await this.handleGetAppList(args, signal);
                    case 'getGameSchema':
                        return await this.handleGetGameSchema(parseToolArgs('getGameSchema', args), signal);
                    case 'getAppDetails':
                        return await this.handleGetAppDetails(parseToolArgs('getAppDetails', args), signal);
                    case 'getGameNews':
                        return await this.handleGetGameNews(parseToolArgs('getGameNews', args), signal);
                    case 'getPlayerAchievements':
                        return await this.handleGetPlayerAchievements(parseToolArgs('getPlayerAchievements', args), signal);
                    case 'getUserStatsForGame':
                        return await this.handleGetUserStatsForGame(parseToolArgs('getUserStatsForGame', args), signal);
                    case 'getGlobalStatsForGame':
                        return await this.handleGetGlobalStatsForGame(parseToolArgs('getGlobalStatsForGame', args), signal);
                    case 'getSupportedApiList':
                        return await this.handleGetSupportedApiList(parseToolArgs('getSupportedApiList', args), signal); // Pass args for consistency, though unused
                    case 'getGlobalAchievementPercentages':
                        return await this.handleGetGlobalAchievementPercentages(parseToolArgs('getGlobalAchievementPercentages', args), signal);
                    // --- Add cases for other tools here ---
                    default:
                        // Use MethodNotFound for unknown tools
                        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
                }
            } catch (error) {
                // Centralized error handling
                logError(toolName, error, this.apiKey);
                return this.formatErrorResponse(error, toolName);
            } finally { clearTimeout(timer); }
        });
    }

    // --- Tool Handler Implementations ---

    private async handleGetCurrentPlayers(args: ToolArgs<'getCurrentPlayers'>, signal: AbortSignal): Promise<McpToolResponse> {
        const appId = args.appid;
        const response = await this.axiosInstance.get<GetCurrentPlayersApiResponse>(
            '/ISteamUserStats/GetNumberOfCurrentPlayers/v1/',
            { params: { appid: appId }, signal } // API key is added automatically by axiosInstance defaults
        );

        // Specific check for this endpoint's success indicator
        if (response.data?.response?.result !== 1) {
            throw new McpError(
                ErrorCode.InternalError, // Or a more specific code if possible
                `Steam API returned an error result code: ${response.data?.response?.result ?? 'unknown'}`
            );
        }
        return this.formatSuccessResponse(response.data);
    }

    private async handleGetAppList(args: unknown, signal: AbortSignal): Promise<McpToolResponse> {
        return this.formatSuccessResponse(await this.catalog.list(args, signal));
    }

    private async handleGetGameSchema(args: ToolArgs<'getGameSchema'>, signal: AbortSignal): Promise<McpToolResponse> {
        const appId = args.appid;
        const response = await this.axiosInstance.get<any>( // Use 'any' for now
            '/ISteamUserStats/GetSchemaForGame/v2/',
            { params: { appid: appId }, signal }
        );
        // Check if game data exists, indicating success for this endpoint
        if (!response.data?.game) {
             throw new McpError(
                ErrorCode.InternalError, // Or NotFound? Steam API is inconsistent here.
                `Steam API did not return game schema data for appid ${appId}. It might be invalid or lack a schema.`
            );
        }
        return this.formatSuccessResponse(response.data);
    }

    private async handleGetAppDetails(args: ToolArgs<'getAppDetails'>, signal: AbortSignal): Promise<McpToolResponse> {

        const appIds = [...new Set(args.appids)];
        const countryCode = args.country;
        const appDetailsUrl = 'https://store.steampowered.com/api/appdetails'; // Different base URL

        // Use Promise.allSettled to handle potential errors for individual appids
        const results = await Promise.allSettled(
            appIds.map(async (appid) => {
                try {
                    const params: { appids: number; cc?: string } = { appids: appid };
                    if (countryCode) {
                        params.cc = countryCode;
                    }
                    // Make request *without* the default axiosInstance base URL and API key
                    const response = await this.storeInstance.get(appDetailsUrl, { params, signal });

                    // The appdetails endpoint wraps the result with the appid as the key
                    const appData = response.data?.[appid.toString()];

                    if (appData?.success) {
                        return { [appid]: appData }; // Return successful data keyed by appid
                    } else {
                        // Handle cases where the API indicates failure for this specific appid
                        return { [appid]: { success: false, error: `Steam API reported failure for appid ${appid}. ` } };
                    }
                } catch (error) {
                     // Handle network/request errors for this specific appid
                    const errorMessage = describeError(error, 'getAppDetails', this.apiKey);
                    logError(`getAppDetails:${appid}`, error, this.apiKey);
                    return { [appid]: { success: false, error: errorMessage } };
                }
            })
        );

        // Combine results into a single object keyed by appid
        const combinedResults = results.reduce((acc, result) => {
            if (result.status === 'fulfilled') {
                Object.assign(acc, result.value);
            } else {
                // This case should ideally be handled within the individual try/catch,
                // but log if an unexpected rejection occurs at the Promise.allSettled level.
                logError('getAppDetails', result.reason, this.apiKey);
                // We might need a way to represent this top-level error if needed.
            }
            return acc;
        }, {});

        return this.formatSuccessResponse(combinedResults);
    }

    private async handleGetGameNews(args: ToolArgs<'getGameNews'>, signal: AbortSignal): Promise<McpToolResponse> {

        const appId = args.appid;
        const count = args.count ?? 10; // Use default if not provided
        const maxLength = args.maxlength ?? 300; // Use default if not provided

        const response = await this.axiosInstance.get<any>( // Define interface if needed
            '/ISteamNews/GetNewsForApp/v2/',
            {
                signal,
                params: {
                    appid: appId,
                    count: count,
                    maxlength: maxLength,
                } // API key added automatically
            }
        );

        // Check if appnews data exists, indicating success for this endpoint
        if (!response.data?.appnews) {
             throw new McpError(
                ErrorCode.InternalError, // Or NotFound?
                `Steam API did not return news data for appid ${appId}. It might be invalid or have no news.`
            );
        }

        return this.formatSuccessResponse(response.data);
    }

    private async handleGetPlayerAchievements(args: ToolArgs<'getPlayerAchievements'>, signal: AbortSignal): Promise<McpToolResponse> {

        const steamId = args.steamid;
        const appId = args.appid;

        const response = await this.axiosInstance.get<any>( // Define interface if needed
            '/ISteamUserStats/GetPlayerAchievements/v1/',
            {
                signal,
                params: {
                    steamid: steamId,
                    appid: appId,
                    // 'l': 'english' // Optional: language, consider adding later if needed
                } // API key added automatically
            }
        );

        // Check the success flag within the playerstats object
        if (!response.data?.playerstats?.success) {
            const errorMsg = response.data?.playerstats?.error ?? `Steam API reported failure for getPlayerAchievements (appid: ${appId}, steamid: ${steamId}).`;
             throw new McpError(
                ErrorCode.InternalError, // Could potentially map 'Profile is private' to a different code if desired
                errorMsg
            );
        }

        return this.formatSuccessResponse(response.data);
    }

    private async handleGetUserStatsForGame(args: ToolArgs<'getUserStatsForGame'>, signal: AbortSignal): Promise<McpToolResponse> {

        const steamId = args.steamid;
        const appId = args.appid;

        // Note: Spec mentions v1, but v2 is generally preferred if available. Sticking to v1 based on spec.
        const response = await this.axiosInstance.get<any>(
            '/ISteamUserStats/GetUserStatsForGame/v1/', // Using v1 as per spec
            {
                signal,
                params: {
                    steamid: steamId,
                    appid: appId,
                } // API key added automatically
            }
        );

        // This endpoint throws an HTTP error (like 500) for private profiles or invalid IDs,
        // rather than returning a JSON body with success:false.
        // The central Axios error handler should catch these.
        // We just need to ensure the expected structure exists on success.
        if (!response.data?.playerstats) {
             throw new McpError(
                ErrorCode.InternalError,
                `Steam API did not return the expected 'playerstats' structure for getUserStatsForGame (appid: ${appId}, steamid: ${steamId}).`
            );
        }

        // Unlike GetPlayerAchievements, this endpoint doesn't seem to have a 'success' boolean inside playerstats.
        // Assume success if the request didn't throw an error and playerstats exists.

        return this.formatSuccessResponse(response.data);
    }

    private async handleGetGlobalStatsForGame(args: ToolArgs<'getGlobalStatsForGame'>, signal: AbortSignal): Promise<McpToolResponse> {

        const appId = args.appid;
        const statNames = args.stat_names;
        const startDate = args.start_date;
        const endDate = args.end_date;

        // The Steam API expects stat names prefixed with 'count=' and indexed.
        const params: Record<string, any> = {
            appid: appId,
            count: statNames.length, // Number of stats being requested
        };
        statNames.forEach((name, index) => {
            params[`name[${index}]`] = name;
        });

        if (startDate !== undefined) {
            params['startdate'] = startDate;
        }
        if (endDate !== undefined) {
            params['enddate'] = endDate;
        }

        const response = await this.axiosInstance.get<any>(
            '/ISteamUserStats/GetGlobalStatsForGame/v1/',
            { params, signal } // API key added automatically
        );

        // Check the result code in the response
        if (response.data?.response?.result !== 1) {
            const errorMsg = response.data?.response?.error ?? `Steam API reported failure for getGlobalStatsForGame (appid: ${appId}). Result code: ${response.data?.response?.result ?? 'unknown'}`;
             throw new McpError(
                ErrorCode.InternalError, // Or map specific result codes if known
                errorMsg
            );
        }
         // Also check if the response structure is as expected even on success code 1
        if (!response.data?.response) {
             throw new McpError(
                ErrorCode.InternalError,
                `Steam API returned success code but missing 'response' object for getGlobalStatsForGame (appid: ${appId}).`
            );
        }


        return this.formatSuccessResponse(response.data);
    }

    private async handleGetSupportedApiList(args: ToolArgs<'getSupportedApiList'>, signal: AbortSignal): Promise<McpToolResponse> {
        // No arguments to validate for this tool

        const response = await this.axiosInstance.get<any>(
            '/ISteamWebAPIUtil/GetSupportedAPIList/v1/', { signal }
            // API key might be optional for this endpoint, but axiosInstance adds it anyway
        );

        // Check if the expected structure exists
        if (!response.data?.apilist?.interfaces) {
             throw new McpError(
                ErrorCode.InternalError,
                `Steam API did not return the expected 'apilist.interfaces' structure for getSupportedApiList.`
            );
        }

        return this.formatSuccessResponse(response.data);
    }

    private async handleGetGlobalAchievementPercentages(args: ToolArgs<'getGlobalAchievementPercentages'>, signal: AbortSignal): Promise<McpToolResponse> {

        const appId = args.appid;

        // Note: Steam API uses 'gameid' parameter here, not 'appid'
        const response = await this.axiosInstance.get<any>(
            '/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/',
            {
                signal,
                params: {
                    gameid: appId // Use gameid as required by the API
                } // API key added automatically
            }
        );

        // Check if the expected structure exists
        if (!response.data?.achievementpercentages?.achievements) {
             throw new McpError(
                ErrorCode.InternalError,
                `Steam API did not return the expected 'achievementpercentages.achievements' structure for getGlobalAchievementPercentages (appid: ${appId}).`
            );
        }

        return this.formatSuccessResponse(response.data);
    }

// --- Add handlers for other tools here ---


    // --- Helper Methods ---

    private formatSuccessResponse(data: object): McpToolSuccessResponse {
        return {
            content: [{
                type: 'text',
                text: JSON.stringify(data, null, 2),
            }],
            structuredContent: { ...data },
        };
    }

    private formatErrorResponse(error: unknown, toolName: string): McpToolErrorResponse {
        const errorMessage = describeError(error, toolName, this.apiKey);
        const errorCode = error instanceof McpError ? error.code : ErrorCode.InternalError;
        return {
            content: [{ type: 'text', text: errorMessage }],
            isError: true,
            error: { code: errorCode, message: errorMessage },
        };
    }

    async connect(transport: Transport) {
        await this.server.connect(transport);
    }

    async close() {
        await this.server.close();
    }

    // Start the server and connect it to the transport
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        // Log to stderr so it doesn't interfere with stdout communication
        console.error('Steam MCP server running on stdio');
    }
}
