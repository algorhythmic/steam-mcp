import assert from 'node:assert/strict';
import test from 'node:test';
import { AxiosError } from 'axios';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { createHarness } from './helpers.mjs';

for (const [tool, args] of [['getCurrentPlayers', { appid: 570 }], ['getAppDetails', { appids: [570] }]]) {
    test(`${tool} keeps credentials and HTTP bodies out of errors and logs`, async t => {
        const logs = [];
        t.mock.method(console, 'error', (...values) => logs.push(values.join(' ')));
        const { call } = await createHarness(t, config => {
            throw new AxiosError('Request failed: https://example.test?key=test-api-key', 'ERR_BAD_RESPONSE', {
                ...config, headers: { Authorization: 'Bearer secret-header' },
            }, { requestSecret: 'secret-request' }, {
                status: 503, data: 'secret-response', headers: {}, config,
            });
        });
        const result = await call(tool, args);
        const output = JSON.stringify({ result, logs });
        for (const secret of ['test-api-key', 'secret-header', 'secret-request', 'secret-response']) {
            assert.equal(output.includes(secret), false);
        }
        assert.match(logs.join(''), /SteamRequestError/);
        assert.match(logs.join(''), /503/);
    });
}

test('upstream tool error messages redact an echoed API key', async t => {
    t.mock.method(console, 'error', () => {});
    const { call } = await createHarness(t, () => {
        throw new McpError(ErrorCode.InternalError, 'Rejected key test-api-key');
    });
    const result = await call('getCurrentPlayers', { appid: 570 });
    assert.equal(result.isError, true);
    assert.equal(JSON.stringify(result).includes('test-api-key'), false);
});
