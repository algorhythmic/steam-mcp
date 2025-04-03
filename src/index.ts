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

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosError } from 'axios'; // Import AxiosError type

// --- Environment Variable Check ---
const STEAM_API_KEY = process.env.STEAM_API_KEY;
if (!STEAM_API_KEY) {
    // Log error to stderr and exit, as the server is unusable without the key.
    console.error("FATAL ERROR: STEAM_API_KEY environment variable is not set.");
    process.exit(1); // Exit immediately
}


// --- Argument Types and Validation ---

// getCurrentPlayers
interface GetCurrentPlayersArgs {
    appid: number;
}

// Type guard to check if the arguments match the expected structure
const isValidGetCurrentPlayersArgs = (
    args: any
): args is GetCurrentPlayersArgs =>
    typeof args === 'object' &&
    args !== null &&
    typeof args.appid === 'number';

interface GetCurrentPlayersApiResponse {
    response: {
        player_count: number;
        result: number; // 1 for success
    };
}

// getGameSchema
interface GetGameSchemaArgs {
    appid: number;
}
const isValidGetGameSchemaArgs = (args: any): args is GetGameSchemaArgs =>
    typeof args === 'object' && args !== null && typeof args.appid === 'number';

// getAppList (no args)

// getAppDetails
interface GetAppDetailsArgs {
    appids: number[];
    country?: string; // Optional country code
}
const isValidGetAppDetailsArgs = (args: any): args is GetAppDetailsArgs =>
    typeof args === 'object' &&
    args !== null &&
    Array.isArray(args.appids) &&
    args.appids.every((id: any) => typeof id === 'number') &&
    (args.country === undefined || typeof args.country === 'string');

// getGameNews
interface GetGameNewsArgs {
    appid: number;
    count?: number; // Optional
    maxlength?: number; // Optional
}
const isValidGetGameNewsArgs = (args: any): args is GetGameNewsArgs =>
    typeof args === 'object' &&
    args !== null &&
    typeof args.appid === 'number' &&
    (args.count === undefined || typeof args.count === 'number') &&
    (args.maxlength === undefined || typeof args.maxlength === 'number');

// getPlayerAchievements
interface GetPlayerAchievementsArgs {
    steamid: string;
    appid: number;
}
const isValidGetPlayerAchievementsArgs = (args: any): args is GetPlayerAchievementsArgs =>
    typeof args === 'object' &&
    args !== null &&
    typeof args.steamid === 'string' &&
    typeof args.appid === 'number';

// getUserStatsForGame
interface GetUserStatsForGameArgs {
    steamid: string;
    appid: number;
}
const isValidGetUserStatsForGameArgs = (args: any): args is GetUserStatsForGameArgs =>
    typeof args === 'object' &&
    args !== null &&
    typeof args.steamid === 'string' &&
    typeof args.appid === 'number';

// getGlobalStatsForGame
interface GetGlobalStatsForGameArgs {
    appid: number;
    stat_names: string[]; // Changed from 'count' in API to 'stat_names' for clarity
    start_date?: number; // Optional timestamp
    end_date?: number; // Optional timestamp
}
const isValidGetGlobalStatsForGameArgs = (args: any): args is GetGlobalStatsForGameArgs =>
    typeof args === 'object' &&
    args !== null &&
    typeof args.appid === 'number' &&
    Array.isArray(args.stat_names) &&
    args.stat_names.every((name: any) => typeof name === 'string') &&
    (args.start_date === undefined || typeof args.start_date === 'number') &&
    (args.end_date === undefined || typeof args.end_date === 'number');

// getSupportedApiList (no args)

// getGlobalAchievementPercentages
interface GetGlobalAchievementPercentagesArgs {
    appid: number; // Steam API uses 'gameid', but we use 'appid' for consistency
}
const isValidGetGlobalAchievementPercentagesArgs = (args: any): args is GetGlobalAchievementPercentagesArgs =>
    typeof args === 'object' &&
    args !== null &&
    typeof args.appid === 'number';


// --- Utility Types ---
// Generic type for the content part of a successful MCP tool response
type McpToolResponseContent = { type: 'text'; text: string };

// Generic type for a successful MCP tool response
type McpToolSuccessResponse = {
    content: McpToolResponseContent[];
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

class SteamMcpServer {
    private server: Server;
    private axiosInstance;

    constructor() {
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
                    resources: {}, // No resources defined
                    tools: {},     // Tools will be defined via handlers
                },
            }
        );

        // Create an axios instance for making requests to the Steam API
        this.axiosInstance = axios.create({
            baseURL: 'https://api.steampowered.com',
            params: {
                key: STEAM_API_KEY // Add key as a default parameter
            }
        });
        this.setupToolHandlers();

        // Basic error handling and graceful shutdown
        this.server.onerror = (error) => console.error('[MCP Error]', error);
        process.on('SIGINT', async () => {
            await this.server.close();
            process.exit(0);
        });
        process.on('SIGTERM', async () => {
            await this.server.close();
            process.exit(0);
        });
    }

    private setupToolHandlers() {
        // Handler for listing available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            const toolDefinitions = [
                // Existing: getCurrentPlayers
                {
                    name: 'getCurrentPlayers',
                    description: 'Retrieves the current number of players for a given Steam application ID (AppID).',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            appid: {
                                title: 'Appid',
                                type: 'integer',
                                description: 'The Steam Application ID of the game.',
                            },
                        },
                        required: ['appid'],
                    },
                    // Based on ISteamUserStats/GetNumberOfCurrentPlayers/v1
                    outputSchema: {
                        type: 'object', properties: { response: { type: 'object', properties: { player_count: { title: 'Player Count', type: 'integer' }, result: { title: 'Result Code', type: 'integer' } }, required: ['player_count', 'result'] } }, required: ['response']
                    }
                },
                // New: getAppList
                {
                    name: 'getAppList',
                    description: 'Retrieves the complete list of public applications (games, software, etc.) available on Steam.',
                    inputSchema: { type: 'object', properties: {}, description: "No arguments required." },
                    // Based on ISteamApps/GetAppList/v2
                    outputSchema: {
                        type: 'object', properties: { applist: { type: 'object', properties: { apps: { type: 'array', items: { type: 'object', properties: { appid: { type: 'integer' }, name: { type: 'string' } }, required: ['appid', 'name'] } } }, required: ['apps'] } }, required: ['applist']
                    }
                },
                // New: getGameSchema
                {
                    name: 'getGameSchema',
                    description: 'Retrieves the game schema (stats and achievements definitions) for a given AppID.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            appid: {
                                title: 'Appid',
                                type: 'integer',
                                description: 'The Steam Application ID of the game.',
                            },
                        },
                        required: ['appid'],
                    },
                    // Based on ISteamUserStats/GetSchemaForGame/v2
                    outputSchema: {
                        type: 'object',
                        properties: {
                            game: {
                                type: 'object',
                                properties: {
                                    gameName: { type: 'string' },
                                    gameVersion: { type: 'string' },
                                    availableGameStats: {
                                        type: 'object',
                                        properties: {
                                            stats: {
                                                type: 'array',
                                                items: {
                                                    type: 'object',
                                                    properties: {
                                                        name: { type: 'string' },
                                                        defaultvalue: { type: 'number' },
                                                        displayName: { type: 'string' }
                                                    }
                                                }
                                            },
                                            achievements: {
                                                type: 'array',
                                                items: {
                                                    type: 'object',
                                                    properties: {
                                                        name: { type: 'string' },
                                                        defaultvalue: { type: 'integer' },
                                                        displayName: { type: 'string' },
                                                        hidden: { type: 'integer' }, // 0 or 1
                                                        description: { type: 'string' },
                                                        icon: { type: 'string', format: 'uri' },
                                                        icongray: { type: 'string', format: 'uri' }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                },
                                required: ['gameName', 'gameVersion', 'availableGameStats'] // Added required for clarity
                            }
                        },
                        required: ['game']
                    }
                }, // Keep comma here
                // New: getAppDetails
                {
                    name: 'getAppDetails',
                    description: 'Retrieves store page details for one or more Steam AppIDs.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            appids: {
                                title: 'Appids',
                                type: 'array',
                                items: { type: 'integer' },
                                description: 'A list of Steam Application IDs.',
                            },
                            country: {
                                title: 'Country Code',
                                type: 'string',
                                description: "ISO 3166 country code for regional pricing/filtering (e.g., 'US', 'GB'). Optional.",
                            },
                        },
                        required: ['appids'],
                    },
                    // Based on appdetails endpoint (structure varies per appid)
                    outputSchema: {
                        type: 'object',
                        description: 'A dictionary where keys are AppIDs (as strings) and values are app detail objects or error indicators.',
                        additionalProperties: {
                            type: 'object',
                            properties: {
                                success: { type: 'boolean' },
                                data: { type: 'object' }, // Define more specific structure if needed, but it varies
                                error: { type: 'string', description: 'Error message if success is false for this appid.' }
                            }
                        }
                    }
                }, // End of getAppDetails definition
                // New: getGameNews
                {
                    name: 'getGameNews',
                    description: 'Retrieves the latest news items for a given AppID.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            appid: {
                                title: 'Appid',
                                type: 'integer',
                                description: 'The Steam Application ID of the game.',
                            },
                            count: {
                                title: 'Count',
                                type: 'integer',
                                description: 'Number of news items to retrieve.',
                                default: 10, // Default value from spec
                            },
                            maxlength: {
                                title: 'Max Length',
                                type: 'integer',
                                description: "Maximum length of the 'contents' field for each news item. 0 for full content.",
                                default: 300, // Default value from spec
                            },
                        },
                        required: ['appid'],
                    },
                    // Based on ISteamNews/GetNewsForApp/v2
                    outputSchema: {
                        type: 'object',
                        properties: {
                            appnews: {
                                type: 'object',
                                properties: {
                                    appid: { type: 'integer' },
                                    newsitems: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                gid: { type: 'string' },
                                                title: { type: 'string' },
                                                url: { type: 'string', format: 'uri' },
                                                is_external_url: { type: 'boolean' },
                                                author: { type: 'string' },
                                                contents: { type: 'string' },
                                                feedlabel: { type: 'string' },
                                                date: { type: 'integer', format: 'timestamp' },
                                                feedname: { type: 'string' }
                                            }
                                        }
                                    },
                                    count: { type: 'integer' }
                                }
                            }
                        },
                        required: ['appnews']
                    }
                }, // End of getGameNews definition
                // New: getPlayerAchievements
                {
                    name: 'getPlayerAchievements',
                    description: "Retrieves a player's achievement status for a specific game.",
                    inputSchema: {
                        type: 'object',
                        properties: {
                            steamid: {
                                title: 'Steamid',
                                type: 'string',
                                description: "The player's 64-bit Steam ID.",
                            },
                            appid: {
                                title: 'Appid',
                                type: 'integer',
                                description: 'The Steam Application ID of the game.',
                            },
                        },
                        required: ['steamid', 'appid'],
                    },
                    // Based on ISteamUserStats/GetPlayerAchievements/v1
                    outputSchema: {
                        type: 'object',
                        properties: {
                            playerstats: {
                                type: 'object',
                                properties: {
                                    steamID: { type: 'string' },
                                    gameName: { type: 'string' },
                                    achievements: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                apiname: { type: 'string' },
                                                achieved: { type: 'integer' },
                                                unlocktime: { type: 'integer', format: 'timestamp' }
                                            }
                                        }
                                    },
                                    success: { type: 'boolean' },
                                    error: { type: 'string', description: 'Error message if success is false.' }
                                }
                            }
                        },
                        required: ['playerstats']
                    }
                }, // End of getPlayerAchievements definition
                // New: getUserStatsForGame
                {
                    name: 'getUserStatsForGame',
                    description: "Retrieves detailed statistics for a user in a specific game.",
                    inputSchema: {
                        type: 'object',
                        properties: {
                            steamid: {
                                title: 'Steamid',
                                type: 'string',
                                description: "The player's 64-bit Steam ID.",
                            },
                            appid: {
                                title: 'Appid',
                                type: 'integer',
                                description: 'The Steam Application ID of the game.',
                            },
                        },
                        required: ['steamid', 'appid'],
                    },
                    // Based on ISteamUserStats/GetUserStatsForGame/v1 (or v2?) - Using v1 based on spec
                    outputSchema: {
                        type: 'object',
                        properties: {
                            playerstats: {
                                type: 'object',
                                properties: {
                                    steamID: { type: 'string' },
                                    gameName: { type: 'string' },
                                    stats: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                name: { type: 'string' },
                                                value: { type: 'number' } // Steam API might return as integer or float
                                            },
                                            required: ['name', 'value']
                                        }
                                    },
                                    achievements: { // Often included here too
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                name: { type: 'string' },
                                                achieved: { type: 'integer' }
                                            },
                                             required: ['name', 'achieved']
                                        }
                                    },
                                    success: { type: 'boolean' }, // Note: This API doesn't seem to have a top-level success/error like GetPlayerAchievements
                                    // error: { type: 'string' } // No explicit error field in successful response structure
                                },
                                required: ['steamID', 'gameName'] // Stats/Achievements might be empty
                            }
                        },
                        required: ['playerstats']
                    }
                }, // End of getUserStatsForGame definition
                // New: getGlobalStatsForGame
                {
                    name: 'getGlobalStatsForGame',
                    description: 'Retrieves aggregated global stats for a specific game.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            appid: {
                                title: 'Appid',
                                type: 'integer',
                                description: 'The Steam Application ID of the game.',
                            },
                            stat_names: {
                                title: 'Stat Names',
                                type: 'array',
                                items: { type: 'string' },
                                description: 'List of specific global stat API names to retrieve.',
                            },
                            start_date: {
                                title: 'Start Date',
                                type: 'integer',
                                format: 'timestamp',
                                description: 'Optional Unix timestamp for the start date.',
                            },
                            end_date: {
                                title: 'End Date',
                                type: 'integer',
                                format: 'timestamp',
                                description: 'Optional Unix timestamp for the end date.',
                            },
                        },
                        required: ['appid', 'stat_names'],
                    },
                    // Based on ISteamUserStats/GetGlobalStatsForGame/v1
                    outputSchema: {
                        type: 'object',
                        properties: {
                            response: {
                                type: 'object',
                                properties: {
                                    result: { type: 'integer', description: 'Steam API result code (1 for success).' },
                                    globalstats: {
                                        type: 'object',
                                        description: 'Object where keys are stat names, values are {total: string}.',
                                        additionalProperties: {
                                            type: 'object',
                                            properties: { total: { type: 'string' } }, // Value is often a large number string
                                            required: ['total']
                                        }
                                    },
                                    error: { type: 'string', description: 'Error message if result code indicates failure.' }
                                },
                                required: ['result'] // globalstats might be absent
                            }
                        },
                        required: ['response']
                    }
                }, // End of getGlobalStatsForGame definition
                // New: getSupportedApiList
                {
                    name: 'getSupportedApiList',
                    description: 'Retrieves the complete list of supported Steam Web API interfaces and methods.',
                    inputSchema: {
                        type: 'object',
                        properties: {},
                        description: 'No arguments required.',
                    },
                    // Based on ISteamWebAPIUtil/GetSupportedAPIList/v1
                    outputSchema: {
                        type: 'object',
                        properties: {
                            apilist: {
                                type: 'object',
                                properties: {
                                    interfaces: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                name: { type: 'string' },
                                                methods: {
                                                    type: 'array',
                                                    items: {
                                                        type: 'object',
                                                        properties: {
                                                            name: { type: 'string' },
                                                            version: { type: 'integer' },
                                                            httpmethod: { type: 'string' },
                                                            parameters: { type: 'array', items: { type: 'object' } } // Simplified parameters schema
                                                        },
                                                        required: ['name', 'version', 'httpmethod', 'parameters']
                                                    }
                                                }
                                            },
                                            required: ['name', 'methods']
                                        }
                                    }
                                },
                                required: ['interfaces']
                            }
                        },
                        required: ['apilist']
                    }
                }, // End of getSupportedApiList definition
                // New: getGlobalAchievementPercentages
                {
                    name: 'getGlobalAchievementPercentages',
                    description: 'Retrieves the global achievement completion percentages for a specific game.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            appid: {
                                title: 'Appid',
                                type: 'integer',
                                description: 'The Steam Application ID of the game.',
                            },
                        },
                        required: ['appid'],
                    },
                    // Based on ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2
                    outputSchema: {
                        type: 'object',
                        properties: {
                            achievementpercentages: {
                                type: 'object',
                                properties: {
                                    achievements: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                name: { type: 'string' }, // API name
                                                percent: { type: 'number', format: 'float' } // Percentage
                                            },
                                            required: ['name', 'percent']
                                        }
                                    }
                                },
                                required: ['achievements']
                            }
                        },
                        required: ['achievementpercentages']
                    }
                }
                // Final tool added
            ];
            return { tools: toolDefinitions };
        });

        // Handler for executing a tool call
        // Refactored handler for executing tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<McpToolResponse> => {
            const toolName = request.params.name;
            const args = request.params.arguments;

            try {
                switch (toolName) {
                    case 'getCurrentPlayers':
                        return await this.handleGetCurrentPlayers(args);
                    case 'getAppList':
                        return await this.handleGetAppList(args); // No args expected, but pass for consistency
                    case 'getGameSchema':
                        return await this.handleGetGameSchema(args);
                    case 'getAppDetails':
                        return await this.handleGetAppDetails(args);
                    case 'getGameNews':
                        return await this.handleGetGameNews(args);
                    case 'getPlayerAchievements':
                        return await this.handleGetPlayerAchievements(args);
                    case 'getUserStatsForGame':
                        return await this.handleGetUserStatsForGame(args);
                    case 'getGlobalStatsForGame':
                        return await this.handleGetGlobalStatsForGame(args);
                    case 'getSupportedApiList':
                        return await this.handleGetSupportedApiList(args); // Pass args for consistency, though unused
                    case 'getGlobalAchievementPercentages':
                        return await this.handleGetGlobalAchievementPercentages(args);
                    // --- Add cases for other tools here ---
                    default:
                        // Use MethodNotFound for unknown tools
                        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
                }
            } catch (error) {
                // Centralized error handling
                console.error(`[${toolName} Error]`, error); // Log the raw error
                return this.formatErrorResponse(error, toolName, args);
            }
        });
    }

    // --- Tool Handler Implementations ---

    private async handleGetCurrentPlayers(args: any): Promise<McpToolResponse> {
        if (!isValidGetCurrentPlayersArgs(args)) {
            throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments for getCurrentPlayers. Requires an integer "appid".');
        }
        const appId = args.appid;
        const response = await this.axiosInstance.get<GetCurrentPlayersApiResponse>(
            '/ISteamUserStats/GetNumberOfCurrentPlayers/v1/',
            { params: { appid: appId } } // API key is added automatically by axiosInstance defaults
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

    private async handleGetAppList(args: any): Promise<McpToolResponse> {
        // No arguments expected or validated for this tool
        const response = await this.axiosInstance.get<any>( // Use 'any' for now, define interface later if needed
            '/ISteamApps/GetAppList/v2/'
            // No extra params needed, API key is added automatically
        );
        // This endpoint doesn't have a 'result' code in the response, assume success if no error
        return this.formatSuccessResponse(response.data);
    }

    private async handleGetGameSchema(args: any): Promise<McpToolResponse> {
        if (!isValidGetGameSchemaArgs(args)) {
            throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments for getGameSchema. Requires an integer "appid".');
        }
        const appId = args.appid;
        const response = await this.axiosInstance.get<any>( // Use 'any' for now
            '/ISteamUserStats/GetSchemaForGame/v2/',
            { params: { appid: appId } }
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

    private async handleGetAppDetails(args: any): Promise<McpToolResponse> {
        if (!isValidGetAppDetailsArgs(args)) {
            throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments for getAppDetails. Requires an array of integers "appids" and optionally a string "country".');
        }

        const appIds = args.appids;
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
                    const response = await axios.get(appDetailsUrl, { params });

                    // The appdetails endpoint wraps the result with the appid as the key
                    const appData = response.data?.[appid.toString()];

                    if (appData?.success) {
                        return { [appid]: appData }; // Return successful data keyed by appid
                    } else {
                        // Handle cases where the API indicates failure for this specific appid
                        return { [appid]: { success: false, error: `Steam API reported failure for appid ${appid}. Data: ${JSON.stringify(appData)}` } };
                    }
                } catch (error) {
                     // Handle network/request errors for this specific appid
                    let errorMessage = `Failed to fetch details for appid ${appid}`;
                    if (axios.isAxiosError(error)) {
                        errorMessage += `: ${error.message}`;
                        if (error.response) {
                             errorMessage += ` (Status: ${error.response.status})`;
                        }
                    } else if (error instanceof Error) {
                        errorMessage += `: ${error.message}`;
                    }
                    console.error(`[getAppDetails Error for ${appid}]`, error); // Log specific error
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
                console.error("[getAppDetails Promise.allSettled Rejection]", result.reason);
                // We might need a way to represent this top-level error if needed.
            }
            return acc;
        }, {});

        return this.formatSuccessResponse(combinedResults);
    }

private async handleGetGameNews(args: any): Promise<McpToolResponse> {
    if (!isValidGetGameNewsArgs(args)) {
        throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments for getGameNews. Requires an integer "appid" and optionally integers "count" and "maxlength".');
    }

    const appId = args.appid;
    const count = args.count ?? 10; // Use default if not provided
    const maxLength = args.maxlength ?? 300; // Use default if not provided

    const response = await this.axiosInstance.get<any>( // Define interface if needed
        '/ISteamNews/GetNewsForApp/v2/',
        {
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

private async handleGetPlayerAchievements(args: any): Promise<McpToolResponse> {
    if (!isValidGetPlayerAchievementsArgs(args)) {
        throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments for getPlayerAchievements. Requires a string "steamid" and an integer "appid".');
    }

    const steamId = args.steamid;
    const appId = args.appid;

    const response = await this.axiosInstance.get<any>( // Define interface if needed
        '/ISteamUserStats/GetPlayerAchievements/v1/',
        {
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

private async handleGetUserStatsForGame(args: any): Promise<McpToolResponse> {
    if (!isValidGetUserStatsForGameArgs(args)) {
        throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments for getUserStatsForGame. Requires a string "steamid" and an integer "appid".');
    }

    const steamId = args.steamid;
    const appId = args.appid;

    // Note: Spec mentions v1, but v2 is generally preferred if available. Sticking to v1 based on spec.
    const response = await this.axiosInstance.get<any>(
        '/ISteamUserStats/GetUserStatsForGame/v1/', // Using v1 as per spec
        {
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

private async handleGetGlobalStatsForGame(args: any): Promise<McpToolResponse> {
    if (!isValidGetGlobalStatsForGameArgs(args)) {
        throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments for getGlobalStatsForGame. Requires integer "appid", array of strings "stat_names", and optionally timestamps "start_date", "end_date".');
    }

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
        { params } // API key added automatically
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

private async handleGetSupportedApiList(args: any): Promise<McpToolResponse> {
    // No arguments to validate for this tool

    const response = await this.axiosInstance.get<any>(
        '/ISteamWebAPIUtil/GetSupportedAPIList/v1/'
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

private async handleGetGlobalAchievementPercentages(args: any): Promise<McpToolResponse> {
    if (!isValidGetGlobalAchievementPercentagesArgs(args)) {
        throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments for getGlobalAchievementPercentages. Requires an integer "appid".');
    }

    const appId = args.appid;

    // Note: Steam API uses 'gameid' parameter here, not 'appid'
    const response = await this.axiosInstance.get<any>(
        '/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/',
        {
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

    private formatSuccessResponse(data: any): McpToolSuccessResponse {
        return {
            content: [{
                type: 'text',
                text: JSON.stringify(data, null, 2),
            }],
        };
    }

    private formatErrorResponse(error: unknown, toolName: string, args: any): McpToolErrorResponse {
        let errorMessage = `An unknown error occurred while executing tool '${toolName}'.`;
        let errorCode = ErrorCode.InternalError;
        let mcpErrorData = undefined; // For structured error data

        if (error instanceof McpError) {
            // If it's already an McpError (e.g., from validation), use its details
            errorCode = error.code;
            errorMessage = error.message;
            // We could potentially add error.data here if the SDK supported it easily
        } else if (axios.isAxiosError(error)) {
            errorMessage = `Steam API request failed during '${toolName}': ${error.message}`;
            mcpErrorData = { type: "SteamApiError", details: error.message }; // Basic details

            if (error.response) {
                errorMessage += ` (Status: ${error.response.status})`;
                mcpErrorData.details += ` (Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)})`; // Include response data if available

                // Map HTTP status codes
                if (error.response.status === 400 || error.response.status === 404) {
                    errorCode = ErrorCode.InvalidParams; // Often indicates bad input like invalid AppID
                    errorMessage = `Steam API request failed (Status: ${error.response.status}). Check arguments for '${toolName}' (e.g., appid: ${args?.appid}).`;
                } else if (error.response.status === 401 || error.response.status === 403) {
                     errorCode = ErrorCode.InternalError; // Use InternalError, message clarifies permission issue
                     errorMessage = `Steam API request failed (Status: ${error.response.status}). Check API key or profile visibility.`;
                     mcpErrorData.type = "PermissionError";
                } else if (error.response.status >= 500) {
                    errorCode = ErrorCode.InternalError; // Treat 5xx as internal/upstream issues
                    mcpErrorData.type = "UpstreamError";
                }
            } else if (error.request) {
                // Network error (no response received)
                errorCode = ErrorCode.InternalError; // SDK lacks specific NetworkError code
                errorMessage = `Network error contacting Steam API during '${toolName}': ${error.message}`;
                mcpErrorData = { type: "NetworkError", details: error.message };
            }
        } else if (error instanceof Error) {
            // Generic JavaScript error
            errorMessage = `Internal server error during '${toolName}': ${error.message}`;
            mcpErrorData = { type: "InternalServerError", details: error.message };
        }

        return {
            content: [{ type: 'text', text: errorMessage }],
            isError: true,
            error: { code: errorCode, message: errorMessage }, // Include structured error
            // data: mcpErrorData // SDK doesn't seem to directly support 'data' in the error response structure easily
        };
    }

    // Start the server and connect it to the transport
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        // Log to stderr so it doesn't interfere with stdout communication
        console.error('Steam MCP server running on stdio');
    }
}

// Create an instance of the server and run it
const server = new SteamMcpServer();
server.run().catch(error => {
    console.error("Failed to start Steam MCP server:", error);
    process.exit(1);
});
