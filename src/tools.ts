import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { toolInputSchemas } from './schemas.js';

export const toolDefinitions: Tool[] = [
    // Existing: getCurrentPlayers
    {
        name: 'getCurrentPlayers',
        description: 'Retrieves the current number of players for a given Steam application ID (AppID).',
        inputSchema: toolInputSchemas.getCurrentPlayers,
        // Based on ISteamUserStats/GetNumberOfCurrentPlayers/v1
        outputSchema: {
            type: 'object', properties: { response: { type: 'object', properties: { player_count: { title: 'Player Count', type: 'integer' }, result: { title: 'Result Code', type: 'integer' } }, required: ['player_count', 'result'] } }, required: ['response']
        }
    },
    // New: getAppList
    {
        name: 'getAppList',
        description: 'Lists one bounded page of Steam store apps. Use next_cursor to continue; filter by app type or modification time.',
        inputSchema: toolInputSchemas.getAppList,
        // Based on IStoreService/GetAppList/v1
        outputSchema: {
            type: 'object',
            properties: {
                applist: { type: 'object', properties: { apps: { type: 'array', items: {
                    type: 'object', properties: { appid: { type: 'integer' }, name: { type: 'string' } }, required: ['appid', 'name'],
                } } }, required: ['apps'] },
                has_more: { type: 'boolean' },
                next_cursor: { type: 'integer' },
            }, required: ['applist', 'has_more'],
        }
    },
    // New: getGameSchema
    {
        name: 'getGameSchema',
        description: 'Retrieves the game schema (stats and achievements definitions) for a given AppID.',
        inputSchema: toolInputSchemas.getGameSchema,
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
        inputSchema: toolInputSchemas.getAppDetails,
        // Based on appdetails endpoint (structure varies per appid)
        outputSchema: {
            type: 'object',
            description: 'AppID-keyed results with a summary counting distinct requested IDs, successes, and failures.',
            properties: {
                summary: {
                    type: 'object',
                    properties: {
                        requested: { type: 'integer', minimum: 1 },
                        succeeded: { type: 'integer', minimum: 0 },
                        failed: { type: 'integer', minimum: 0 },
                    },
                    required: ['requested', 'succeeded', 'failed'],
                    additionalProperties: false,
                },
            },
            required: ['summary'],
            additionalProperties: {
                type: 'object',
                properties: {
                    success: { type: 'boolean' },
                    data: { type: 'object' }, // Define more specific structure if needed, but it varies
                    error: { type: 'string', description: 'Error message if success is false for this appid.' }
                },
                required: ['success'],
                oneOf: [
                    { properties: { success: { const: true } }, required: ['data'] },
                    { properties: { success: { const: false } }, required: ['error'] },
                ],
            }
        }
    }, // End of getAppDetails definition
    // New: getGameNews
    {
        name: 'getGameNews',
        description: 'Retrieves the latest news items for a given AppID.',
        inputSchema: toolInputSchemas.getGameNews,
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
                                    date: { type: 'integer' },
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
        inputSchema: toolInputSchemas.getPlayerAchievements,
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
                                    unlocktime: { type: 'integer' }
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
        inputSchema: toolInputSchemas.getUserStatsForGame,
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
        inputSchema: toolInputSchemas.getGlobalStatsForGame,
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
        inputSchema: toolInputSchemas.getSupportedApiList,
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
        inputSchema: toolInputSchemas.getGlobalAchievementPercentages,
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
                                    percent: { type: 'number' } // Percentage
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
