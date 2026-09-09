import axios from 'axios';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

export function redactSecrets(message: string, secret: string): string {
    let safe = message;
    for (const value of [secret, encodeURIComponent(secret)]) {
        if (value) safe = safe.split(value).join('[REDACTED]');
    }
    return safe.replace(/([?&](?:key|api_key|access_token)=)[^&\s]+/gi, '$1[REDACTED]');
}

export function logError(context: string, error: unknown, secret: string) {
    // Axios errors include headers, query parameters, and request/response bodies.
    // Only these diagnostic fields may be written to stderr.
    const summary = axios.isAxiosError(error)
        ? { kind: 'SteamRequestError', status: error.response?.status,
            code: /^[A-Z_0-9]+$/.test(error.code ?? '') ? error.code : undefined }
        : error instanceof McpError
            ? { kind: 'McpError', code: error.code }
            : { kind: 'InternalError' };
    console.error(redactSecrets(JSON.stringify({ context, ...summary }), secret));
}

export function describeError(error: unknown, toolName: string, secret: string): string {
    let message = `Unable to execute '${toolName}'. Please try again.`;
    if (error instanceof McpError) {
        message = error.message;
    } else if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (error.code === 'ERR_CANCELED') {
            message = `Steam request cancelled during '${toolName}'.`;
        } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            message = `Steam request timed out during '${toolName}'. Please try again.`;
        } else if (status === 401 || status === 403) {
            message = `Steam denied access (${status}). Check the API key and profile visibility.`;
        } else if (status === 400 || status === 404) {
            message = `Steam could not find the requested data (${status}). Check the IDs supplied to '${toolName}'.`;
        } else if (status === 429) {
            message = 'Steam is rate limiting requests (429). Wait before trying again.';
        } else if (status && status >= 500) {
            message = `Steam is temporarily unavailable (${status}). Please try again later.`;
        } else {
            message = `Could not contact Steam during '${toolName}'. Check your connection and try again.`;
        }
    }
    return redactSecrets(message, secret);
}
