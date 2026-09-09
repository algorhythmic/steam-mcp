import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';
import { Catalog } from '../build/catalog.js';
import { createHarness } from './helpers.mjs';

test('catalog pages use the Store API, filters, and a continuation cursor', async t => {
    const { call, requests } = await createHarness(t, config => ({ response: {
        apps: config.params.last_appid ? [{ appid: 730, name: 'Counter-Strike 2' }] : [{ appid: 570, name: 'Dota 2' }],
        have_more_results: !config.params.last_appid,
    } }));
    const first = (await call('getAppList', { limit: 1, include_dlc: true })).structuredContent;
    assert.equal(requests[0].url, '/IStoreService/GetAppList/v1/');
    assert.equal(requests[0].params.max_results, 1);
    assert.equal(requests[0].params.include_dlc, true);
    assert.equal(first.next_cursor, 570);
    const second = (await call('getAppList', { limit: 1, cursor: first.next_cursor, include_dlc: true })).structuredContent;
    assert.equal(second.has_more, false);
    assert.equal(second.next_cursor, undefined);
    assert.equal(second.applist.apps[0].appid, 730);
    await call('getAppList', { limit: 1, include_dlc: true });
    assert.equal(requests.length, 2, 'repeat pages are cached');
});

test('catalog cache expires and separates filters', async () => {
    let now = 0;
    let count = 0;
    const catalog = new Catalog(axios.create({ adapter: async config => {
        count++;
        return { data: { response: { apps: [], have_more_results: false } }, status: 200, headers: {}, config };
    } }), () => now);
    await catalog.list({});
    await catalog.list({});
    assert.equal(count, 1);
    now = 300_001;
    await catalog.list({});
    await catalog.list({ include_dlc: true });
    assert.equal(count, 3);
    await assert.rejects(catalog.list({ limit: 101 }), /Invalid arguments for getAppList/);
    assert.equal(count, 3);
});

test('catalog failures are retried on the next call and never cached', async () => {
    let calls = 0;
    const catalog = new Catalog(axios.create({ adapter: async config => {
        calls++;
        return { data: calls === 1 ? {} : { response: { apps: [], have_more_results: false } }, status: 200, headers: {}, config };
    } }));
    await assert.rejects(catalog.list({}), /invalid app catalog page/);
    assert.equal((await catalog.list({})).has_more, false);
    assert.equal(calls, 2);
});

test('catalog caps oversized upstream pages without skipping apps', async t => {
    const { call } = await createHarness(t, () => ({ response: {
        apps: [{ appid: 570, name: 'Dota 2' }, { appid: 730, name: 'Counter-Strike 2' }], have_more_results: false,
    } }));
    const result = (await call('getAppList', { limit: 1 })).structuredContent;
    assert.equal(result.applist.apps.length, 1);
    assert.equal(result.next_cursor, 570);
    assert.equal(result.has_more, true);
});
