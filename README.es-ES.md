

# Servidor MCP de Steam (Node.js/TypeScript)

## Descripción general

Este proyecto implementa un Servidor MCP (Model Context Protocol) de Steam utilizando Node.js, TypeScript y `@modelcontextprotocol/sdk`. El servidor actúa como intermediario entre un cliente MCP (como Roo) y la Steam Web API, proporcionando acceso estructurado a diversas estadísticas de juegos de Steam e información de usuarios.

Se comunica con el cliente MCP a través de la entrada/salida estándar (stdio) utilizando `StdioServerTransport` del `@modelcontextprotocol/sdk`. Escucha solicitudes `tools/call`, las valida, interactúa con la Steam Web API mediante Axios y devuelve resultados formateados o mensajes de error correspondientes.

## Stack tecnológico

*   **Lenguaje:** TypeScript
*   **Entorno de ejecución:** Node.js (v18+ recomendado)
*   **Cliente HTTP:** Axios
*   **Variables de entorno:** Dotenv
*   **SDK de MCP:** `@modelcontextprotocol/sdk`
*   **Gestión de paquetes:** npm

## Configuración e instalación

1.  **Prerrequisitos:**
    *   Node.js (v18 o superior recomendado).
    *   npm (generalmente incluido con Node.js).

2.  **Clonar el repositorio (si aún no lo has hecho):**
    ```bash
    git clone <repository-url> # Reemplaza con la URL de tu repositorio
    cd steam-mcp
    ```

3.  **Instalar dependencias:**
    ```bash
    npm install
    ```

4.  **Configurar variables de entorno:** Consulte la sección inferior.

5.  **Compilar el proyecto:**
    ```bash
    npm run build
    ```
    Esto compila el código TypeScript en el directorio `build`.

## Configuración (Variables de entorno)

El servidor requiere que se configure la siguiente variable de entorno:

*   **`STEAM_API_KEY` (Requerido):** Tu clave de la Steam Web API. Obtén una desde el [sitio web de desarrolladores de Steam](https://steamcommunity.com/dev/apikey). El servidor no funcionará sin esta clave.

Este proyecto utiliza un archivo `.env` en el directorio raíz del proyecto para cargar la clave de la API. Crea un archivo llamado `.env` en el directorio `steam-mcp` y agrega la siguiente línea:

```dotenv
STEAM_API_KEY=YOUR_API_KEY_HERE
```

Reemplaza `YOUR_API_KEY_HERE` con tu clave real de la Steam Web API.

## Ejecución del servidor (Independiente)

Después de compilar el proyecto (`npm run build`) y configurar el archivo `.env`, puedes ejecutar el servidor directamente usando Node:

```bash
node build/index.js
```

El servidor se iniciará y escuchará mensajes de MCP en la entrada/salida estándar.

## Comandos MCP disponibles

Este servidor proporciona las siguientes herramientas basadas en la Steam Web API:

*   `getCurrentPlayers`: Obtiene la cantidad actual de jugadores para un AppID dado.
*   `getAppList`: Obtiene la lista completa de aplicaciones públicas en Steam.
*   `getGameSchema`: Obtiene el esquema del juego (estadísticas, logros) para un AppID dado.
*   `getAppDetails`: Obtiene los detalles de la página de la tienda para uno o más AppIDs.
*   `getGameNews`: Obtiene las últimas noticias para un AppID dado.
*   `getPlayerAchievements`: Obtiene el estado de los logros de un jugador para un juego específico.
*   `getUserStatsForGame`: Obtiene estadísticas detalladas para un usuario en un juego específico.
*   `getGlobalStatsForGame`: Obtiene estadísticas globales agregadas para un juego específico.
*   `getSupportedApiList`: Obtiene la lista de interfaces y métodos compatibles con la Steam Web API.
*   `getGlobalAchievementPercentages`: Obtiene los porcentajes de finalización de logros globales para un juego.

## Conexión de un cliente MCP local (p. ej., Roo)

Para conectar un cliente MCP local, como la extensión Roo para VS Code, a este servidor, debes configurar el archivo `mcp.json` del cliente. Este archivo generalmente se encuentra en un directorio `.roo` dentro de tu proyecto o en la configuración de usuario.

La configuración indica al cliente cómo iniciar y comunicarse con el servidor mediante la entrada/salida estándar.

1.  **Asegúrate de que el proyecto esté compilado:** Ejecuta `npm run build`.
2.  **Busca o crea tu archivo `mcp.json`:** Esto podría estar en `.roo/mcp.json` en tu espacio de trabajo o en una ubicación de configuración global.
3.  **Agrega la configuración del servidor:** Agrega una entrada al array `servers` en `mcp.json`.

**Ejemplo de entrada en `mcp.json`:**

```json
{
  "servers": [
    // ... otras configuraciones de servidor ...
    {
      "name": "steam-local-stdio", // Elige un nombre descriptivo
      "type": "stdio",
      "enabled": true,
      "command": "node", // Comando a ejecutar
      "args": [
        // Ruta absoluta al archivo index.js compilado
        "C:\\Users\\<username>\\AppData\\Roaming\\Roo-Code\\MCP\\steam-mcp\\build\\index.js"
        // Ajusta la ruta si la ubicación de tu proyecto es diferente
      ],
      "cwd": "C:\\Users\\<username>\\AppData\\Roaming\\Roo-Code\\MCP\\steam-mcp" // Directorio de trabajo (raíz del proyecto)
    }
  ]
}
```

*   **`name`**: Un identificador único para esta conexión de servidor (p. ej., `steam`).
*   **`type`**: Debe ser `stdio`.
*   **`enabled`**: Establece en `true` para activar la conexión.
*   **`command`**: El comando para ejecutar el entorno Node.js (`node`).
*   **`args`**: Un array que contiene la ruta absoluta al script del servidor compilado (`build/index.js`). **Importante:** Asegúrate de que esta ruta sea correcta para tu sistema. Utiliza barras invertidas dobles (`\\`) para las rutas en la cadena JSON en Windows.
*   **`cwd`**: La ruta absoluta al directorio raíz del proyecto, desde donde se debe ejecutar el servidor. **Importante:** Asegúrate de que esta ruta sea correcta para tu sistema.

Una vez configurado y habilitado, tu cliente MCP debería poder iniciar y comunicarse con este servidor a través de stdio.
