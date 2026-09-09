import axios from 'axios';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { SteamMcpServer } from '../build/server.js';

export async function createHarness(t, reply) {
    const requests = [];
    const adapter = async config => {
        requests.push(config);
        return { data: await reply(config), status: 200, statusText: 'OK', headers: {}, config };
    };
    const server = new SteamMcpServer('test-api-key', {
        webApi: axios.create({ adapter, params: { key: 'test-api-key' } }),
        store: axios.create({ adapter }),
        http: { backoffMs: 0 },
    });
    const client = new Client({ name: 'steam-mcp-tests', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const { tools } = await client.listTools();
    t.after(() => client.close());
    return { client, tools, requests, call: (name, args = {}, options) => client.callTool({ name, arguments: args }, undefined, options) };
}
