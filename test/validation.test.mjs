import assert from 'node:assert/strict';
import test from 'node:test';
import { createHarness } from './helpers.mjs';

test('invalid inputs produce field-specific errors before any Steam request', async t => {
    t.mock.method(console, 'error', () => {});
    const { call, requests } = await createHarness(t, () => { throw new Error('Invalid input reached Steam'); });
    const invalid = [
        ['getCurrentPlayers', { appid: -1 }, 'appid'],
        ['getGameSchema', { appid: 1.5 }, 'appid'],
        ['getCurrentPlayers', { appid: 0 }, 'appid'],
        ['getGlobalAchievementPercentages', { appid: 4294967296 }, 'appid'],
        ['getGameSchema', { appid: '570' }, 'appid'],
        ['getPlayerAchievements', { appid: 570, steamid: '' }, 'steamid'],
        ['getUserStatsForGame', { appid: 570, steamid: 76561198000000000 }, 'steamid'],
        ['getAppDetails', { appids: [] }, 'appids'],
        ['getAppDetails', { appids: [570, -1] }, 'appids.1'],
        ['getAppDetails', { appids: [570], country: 'USA' }, 'country'],
        ['getGameNews', { appid: 570, count: -1 }, 'count'],
        ['getGameNews', { appid: 570, count: 101 }, 'count'],
        ['getGameNews', { appid: 570, maxlength: -1 }, 'maxlength'],
        ['getGameNews', { appid: 570, maxlength: 10001 }, 'maxlength'],
        ['getGlobalStatsForGame', { appid: 570, stat_names: [] }, 'stat_names'],
        ['getGlobalStatsForGame', { appid: 570, stat_names: [' '] }, 'stat_names.0'],
        ['getGlobalStatsForGame', { appid: 570, stat_names: ['wins'], start_date: 200, end_date: 100 }, 'end_date'],
        ['getGlobalStatsForGame', { appid: 570, stat_names: ['wins'], start_date: 1700000000000 }, 'start_date'],
        ['getAppList', { limit: 101 }, 'limit'],
        ['getAppList', { cursor: -1 }, 'cursor'],
        ['getAppList', { include_dlc: 'true' }, 'include_dlc'],
        ['getSupportedApiList', { unused: true }, 'arguments'],
        ['getCurrentPlayers', {}, 'appid'],
    ];
    for (const [tool, args, field] of invalid) {
        const result = await call(tool, args);
        assert.equal(result.isError, true, `${tool}: ${JSON.stringify(args)}`);
        assert.ok(result.content[0].text.includes(field), result.content[0].text);
    }
    assert.equal(requests.length, 0);
});

test('validated defaults and normalized values reach Steam', async t => {
    const { call, requests } = await createHarness(t, config => config.url.includes('appdetails')
        ? { 570: { success: true, data: {} } }
        : { appnews: { newsitems: [] } });
    await call('getGameNews', { appid: 570 });
    assert.equal(requests[0].params.count, 10);
    assert.equal(requests[0].params.maxlength, 300);
    await call('getAppDetails', { appids: [570], country: 'gb' });
    assert.equal(requests[1].params.cc, 'GB');
});

test('unknown tools return a protocol error', async t => {
    const { call, requests } = await createHarness(t, () => ({}));
    await assert.rejects(call('missingTool'), /Unknown tool/);
    assert.equal(requests.length, 0);
});
