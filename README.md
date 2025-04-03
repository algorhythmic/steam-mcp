# Steam MCP Server (Node.js/TypeScript)

## Overview

This project implements a Steam MCP (Model Context Protocol) Server using Node.js, TypeScript, and the `@modelcontextprotocol/sdk`. The server acts as an intermediary between an MCP client (like Roo) and the Steam Web API, providing structured access to various Steam game statistics and user information.

It communicates with the MCP client via standard input/output (stdio) using the `@modelcontextprotocol/sdk`'s `StdioServerTransport`. It listens for `tools/call` requests, validates them, interacts with the Steam Web API using Axios, and returns formatted results or appropriate error messages.

## Technology Stack

*   **Language:** TypeScript
*   **Runtime:** Node.js (v18+ recommended)
*   **HTTP Client:** Axios
*   **Environment Variables:** Dotenv
*   **MCP SDK:** `@modelcontextprotocol/sdk`
*   **Package Management:** npm

## Setup and Installation

1.  **Prerequisites:**
    *   Node.js (v18 or higher recommended).
    *   npm (usually included with Node.js).

2.  **Clone the repository (if you haven't already):**
    ```bash
    git clone <repository-url> # Replace with your repository URL
    cd steam-mcp
    ```

3.  **Install dependencies:**
    ```bash
    npm install
    ```

4.  **Configure Environment Variables:** See the section below.

5.  **Build the project:**
    ```bash
    npm run build
    ```
    This compiles the TypeScript code into the `build` directory.

## Configuration (Environment Variables)

The server requires the following environment variable to be set:

*   **`STEAM_API_KEY` (Required):** Your Steam Web API key. Obtain one from the [Steam Developer website](https://steamcommunity.com/dev/apikey). The server will not function without this key.

This project uses a `.env` file in the project root directory to load the API key. Create a file named `.env` in the `steam-mcp` directory and add the following line:

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
*   `getAppList`: Retrieves the complete list of public applications on Steam.
*   `getGameSchema`: Retrieves the game schema (stats, achievements) for a given AppID.
*   `getAppDetails`: Retrieves store page details for one or more AppIDs.
*   `getGameNews`: Retrieves the latest news items for a given AppID.
*   `getPlayerAchievements`: Retrieves a player's achievement status for a specific game.
*   `getUserStatsForGame`: Retrieves detailed statistics for a user in a specific game.
*   `getGlobalStatsForGame`: Retrieves aggregated global stats for a specific game.
*   `getSupportedApiList`: Retrieves the list of supported Steam Web API interfaces and methods.
*   `getGlobalAchievementPercentages`: Retrieves global achievement completion percentages for a game.

## Connecting a Local MCP Client (e.g., Roo)

To connect a local MCP client, such as the Roo VS Code extension, to this server, you need to configure the client's `mcp.json` file. This file typically resides in a `.roo` directory within your project or user settings.

The configuration tells the client how to launch and communicate with the server using standard input/output.

1.  **Ensure the project is built:** Run `npm run build`.
2.  **Locate or create your `mcp.json` file:** This might be in `.roo/mcp.json` in your workspace or a global configuration location.
3.  **Add the server configuration:** Add an entry to the `servers` array in `mcp.json`.

**Example `mcp.json` entry:**

```json
{
  "servers": [
    // ... other server configurations ...
    {
      "name": "steam-local-stdio", // Choose a descriptive name
      "type": "stdio",
      "enabled": true,
      "command": "node", // Command to execute
      "args": [
        // Absolute path to the built index.js file
        "C:\\Users\\Flyin\\AppData\\Roaming\\Roo-Code\\MCP\\steam-mcp\\build\\index.js"
        // Adjust the path if your project location is different
      ],
      "cwd": "C:\\Users\\Flyin\\AppData\\Roaming\\Roo-Code\\MCP\\steam-mcp" // Working directory (project root)
    }
  ]
}
```

*   **`name`**: A unique identifier for this server connection (e.g., `steam`).
*   **`type`**: Must be `stdio`.
*   **`enabled`**: Set to `true` to activate the connection.
*   **`command`**: The command to run the Node.js runtime (`node`).
*   **`args`**: An array containing the absolute path to the compiled server script (`build/index.js`). **Important:** Ensure this path is correct for your system. Use double backslashes (`\\`) for paths in the JSON string on Windows.
*   **`cwd`**: The absolute path to the project's root directory, where the server should be run from. **Important:** Ensure this path is correct for your system.

Once configured and enabled, your MCP client should be able to launch and communicate with this server via stdio.
