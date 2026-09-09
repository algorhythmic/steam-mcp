# Steam MCP Server (Node.js/TypeScript)

## Overview

This project implements a Steam MCP (Model Context Protocol) Server using Node.js, TypeScript, and the `@modelcontextprotocol/sdk`. The server acts as an intermediary between an MCP client (like Roo) and the Steam Web API, providing structured access to various Steam game statistics and user information.

It communicates with the MCP client via standard input/output (stdio) using the `@modelcontextprotocol/sdk`'s `StdioServerTransport`. It listens for `tools/call` requests, validates them, interacts with the Steam Web API using Axios, and returns formatted results or appropriate error messages.

## Technology Stack

*   **Language:** TypeScript
*   **Runtime:** Node.js (v24 LTS or newer)
*   **HTTP Client:** Axios
*   **Environment Variables:** Dotenv
*   **MCP SDK:** `@modelcontextprotocol/sdk`
*   **Package Management:** npm

## Setup and Installation

1.  **Prerequisites:**
    *   Node.js (v24 LTS or newer).
    *   npm (usually included with Node.js).

2.  **Clone the repository (if you haven't already):**
    ```bash
    git clone https://github.com/algorhythmic/steam-mcp.git
    cd steam-mcp
    ```

3.  **Install dependencies:**
    ```bash
    npm ci
    ```

4.  **Configure Environment Variables:** See the section below.

5.  **Rebuild after source changes:** `npm ci` already builds the project. To rebuild later:
    ```bash
    npm run build
    ```
    This compiles the TypeScript code into the `build` directory.

## Configuration (Environment Variables)

The server requires the following environment variable to be set:

*   **`STEAM_API_KEY` (Required):** Your Steam Web API key. Obtain one from the [Steam Developer website](https://steamcommunity.com/dev/apikey). The server will not function without this key.

Set `STEAM_API_KEY` in your MCP client's environment or your shell. You can also copy `.env.example` to `.env` in the project root and set the key there. The `.env` file is optional; an existing environment variable takes precedence.

```dotenv
STEAM_API_KEY=YOUR_API_KEY_HERE
```

Replace `YOUR_API_KEY_HERE` with your actual Steam Web API key.

## Running the Server (Standalone)

After building the project (`npm run build`) and configuring the `.env` file, you can run the server directly using Node:

```bash
node build/index.js
```

The server will start and listen for MCP messages on standard input/output.

## Available MCP Commands

This server provides the following tools based on the Steam Web API:

*   `getCurrentPlayers`: Retrieves the current number of players for a given AppID.
*   `getAppList`: Lists a page of Steam store apps (default 20, maximum 100). Pass `next_cursor` back as `cursor` to continue. Optional `include_games`, `include_dlc`, `include_software`, `include_videos`, `include_hardware`, and `if_modified_since` filters are supported. Pages are cached for five minutes; only games are included by default.
*   `getGameSchema`: Retrieves the game schema (stats, achievements) for a given AppID.
*   `getAppDetails`: Retrieves store page details for one or more AppIDs.
*   `getGameNews`: Retrieves the latest news items for a given AppID.
*   `getPlayerAchievements`: Retrieves a player's achievement status for a specific game.
*   `getUserStatsForGame`: Retrieves detailed statistics for a user in a specific game.
*   `getGlobalStatsForGame`: Retrieves aggregated global stats for a specific game.
*   `getSupportedApiList`: Retrieves the list of supported Steam Web API interfaces and methods.
*   `getGlobalAchievementPercentages`: Retrieves global achievement completion percentages for a game.

## Connecting Roo Code

Add a named entry under `mcpServers` in your project's `.roo/mcp.json`, or use Roo's global MCP settings. See the [Roo configuration reference](https://roocodeinc.github.io/Roo-Code/features/mcp/using-mcp-in-roo/).

Linux/macOS example (replace the absolute path and API key):

```json
{
  "mcpServers": {
    "steam": {
      "command": "node",
      "args": ["/absolute/path/to/steam-mcp/build/index.js"],
      "env": {
        "STEAM_API_KEY": "YOUR_STEAM_API_KEY_HERE"
      },
      "disabled": false
    }
  }
}
```

Windows example:

```json
{
  "mcpServers": {
    "steam": {
      "command": "node",
      "args": ["C:\\Users\\YourName\\Projects\\steam-mcp\\build\\index.js"],
      "env": {
        "STEAM_API_KEY": "YOUR_STEAM_API_KEY_HERE"
      },
      "disabled": false
    }
  }
}
```

If you use the project's `.env` file, omit the `env` object. The server locates `.env` relative to its installation, so setting `cwd` is unnecessary. Keep configurations containing real keys out of version control. Other MCP clients may use a different configuration format; use their documented stdio setup with the same command, absolute script path, and environment variable.

## First calls

After connecting, try “How many people are playing Dota 2?” The corresponding tool call is:

```json
{"name":"getCurrentPlayers","arguments":{"appid":570}}
```

To retrieve store information:

```json
{"name":"getAppDetails","arguments":{"appids":[570,730],"country":"US"}}
```

An AppID is the number following `/app/` in a Steam store URL. Player tools require a SteamID64 supplied as a **string**, preserving all its digits.

## Development and troubleshooting

- Run `npm test` for the TypeScript build and mocked MCP integration tests; no API key is needed for tests.
- Run `npm start` to start the built stdio server, or `npm run inspector` for an interactive MCP inspector.
- If Node cannot be found by your client, set `command` to the absolute path of your Node executable.
- If `build/index.js` is missing, run `npm ci` from the repository root.
- If `STEAM_API_KEY` is missing, set it in the client configuration or the optional `.env` file and restart the server.
- If Steam denies access, check the key and the target profile's game-details visibility. Some games do not expose stats or achievements.
- A server waiting quietly in a terminal is normal: stdio expects an MCP client. Diagnostic messages go to stderr; stdout is reserved for protocol messages.

## Request limits

Store-detail batches accept at most 20 IDs and fetch duplicate IDs once. Each Steam host has a shared limit of four active requests. HTTP operations have a 10-second deadline including queueing and retries; each tool call has a 15-second overall deadline and follows client cancellation. Transient network errors, HTTP 429, and selected 5xx responses receive at most two retries, respecting `Retry-After`. Responses are limited to 2 MiB.
