import assert from 'node:assert/strict';
import test from 'node:test';
import axios, { AxiosError } from 'axios';
import { setTimeout as delay } from 'node:timers/promises';
import { SteamHttpClient } from '../build/http.js';
import { createHarness } from './helpers.mjs';

const response = config => ({ data: {}, status: 200, headers: {}, config });
const httpFailure = (config, status, headers = {}) => new AxiosError('upstream failure', 'ERR_BAD_RESPONSE', config, {}, { status, headers, data: {}, config });

test('requests share a concurrency limit, including across batches', async () => {
    let active = 0, peak = 0;
    const http = new SteamHttpClient(axios.create({ adapter: async config => {
        active++; peak = Math.max(active, peak);
        assert.ok(config.timeout > 0);
        assert.equal(config.maxContentLength, 2 * 1024 * 1024);
        await delay(5);
        active--;
        return response(config);
    } }));
    await Promise.all(Array.from({ length: 30 }, () => http.get('/test')));
    assert.equal(peak, 4);
});

test('a stalled adapter cannot outlive the request deadline', async () => {
    const http = new SteamHttpClient(axios.create({ adapter: () => new Promise(() => {}) }), { timeoutMs: 20 });
    await assert.rejects(http.get('/test'), { code: 'ETIMEDOUT' });
});

test('cancellation removes queued work and aborts active work', async () => {
    let calls = 0;
    const http = new SteamHttpClient(axios.create({ adapter: () => { calls++; return new Promise(() => {}); } }), { concurrency: 1 });
    const first = new AbortController(), second = new AbortController();
    const running = http.get('/first', { signal: first.signal });
    const queued = http.get('/second', { signal: second.signal });
    const checked = Promise.all([
        assert.rejects(running, { code: 'ERR_CANCELED' }),
        assert.rejects(queued, { code: 'ERR_CANCELED' }),
    ]);
    await delay(5);
    second.abort(); first.abort();
    await checked;
    assert.equal(calls, 1);
});

test('transient failures retry within a fixed attempt budget', async () => {
    let calls = 0;
    const http = new SteamHttpClient(axios.create({ adapter: async config => {
        calls++;
        if (calls < 3) throw httpFailure(config, 503);
        return response(config);
    } }), { backoffMs: 0 });
    await http.get('/test');
    assert.equal(calls, 3);
    const failing = new SteamHttpClient(axios.create({ adapter: async config => { calls++; throw httpFailure(config, 503); } }), { backoffMs: 0 });
    await assert.rejects(failing.get('/test'));
    assert.equal(calls, 6);
});

test('permanent failures and Retry-After beyond the deadline do not retry', async () => {
    for (const status of [403, 404, 429]) {
        let calls = 0;
        const http = new SteamHttpClient(axios.create({ adapter: async config => {
            calls++;
            throw httpFailure(config, status, { 'retry-after': '60' });
        } }), { timeoutMs: 100, backoffMs: 0 });
        await assert.rejects(http.get('/test'));
        assert.equal(calls, 1);
    }
});

test('Retry-After is honored before a retry', async () => {
    const starts = [];
    const http = new SteamHttpClient(axios.create({ adapter: async config => {
        starts.push(Date.now());
        if (starts.length === 1) throw httpFailure(config, 429, { 'retry-after': '0.03' });
        return response(config);
    } }), { backoffMs: 0 });
    await http.get('/test');
    assert.ok(starts[1] - starts[0] >= 25);
});

test('store batches deduplicate IDs and reject oversized requests', async t => {
    t.mock.method(console, 'error', () => {});
    const { call, requests } = await createHarness(t, config => ({ [config.params.appids]: { success: true, data: {} } }));
    await call('getAppDetails', { appids: [570, 570, 730] });
    assert.equal(requests.length, 2);
    const result = await call('getAppDetails', { appids: Array.from({ length: 21 }, (_, i) => i + 1) });
    assert.equal(result.isError, true);
    assert.equal(requests.length, 2);
});

test('MCP cancellation reaches the Steam request signal', async t => {
    t.mock.method(console, 'error', () => {});
    const { call, requests } = await createHarness(t, () => new Promise(() => {}));
    const controller = new AbortController();
    const pending = call('getCurrentPlayers', { appid: 570 }, { signal: controller.signal });
    const rejected = assert.rejects(pending);
    await delay(5);
    assert.equal(requests.length, 1);
    controller.abort();
    await rejected;
    await delay(0);
    assert.equal(requests[0].signal.aborted, true);
});
