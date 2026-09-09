import assert from 'node:assert/strict';
import test from 'node:test';
import { createHarness } from './helpers.mjs';

const steamid = '76561198000000000';
const cases = [
    ['getCurrentPlayers', { appid: 570 }, { response: { player_count: 42, result: 1 } }],
    ['getAppList', {}, { applist: { apps: [{ appid: 570, name: 'Dota 2' }] }, has_more: false }],
    ['getGameSchema', { appid: 570 }, { game: { gameName: 'Dota 2', gameVersion: '1', availableGameStats: {} } }],
    ['getAppDetails', { appids: [570] }, { 570: { success: true, data: { name: 'Dota 2' } }, summary: { requested: 1, succeeded: 1, failed: 0 } }],
    ['getGameNews', { appid: 570 }, { appnews: { appid: 570, newsitems: [], count: 0 } }],
    ['getPlayerAchievements', { appid: 570, steamid }, { playerstats: { steamID: steamid, gameName: 'Dota 2', success: true, achievements: [] } }],
    ['getUserStatsForGame', { appid: 570, steamid }, { playerstats: { steamID: steamid, gameName: 'Dota 2', stats: [] } }],
    ['getGlobalStatsForGame', { appid: 570, stat_names: ['wins'] }, { response: { result: 1, globalstats: { wins: { total: '123' } } } }],
    ['getSupportedApiList', {}, { apilist: { interfaces: [] } }],
    ['getGlobalAchievementPercentages', { appid: 570 }, { achievementpercentages: { achievements: [{ name: 'win', percent: 15.5 }] } }],
];

for (const [name, args, data] of cases) {
    test(`${name} returns structured output accepted by a current MCP client`, async t => {
        const { call, tools, client } = await createHarness(t, () => name === 'getAppList' ? { response: { apps: data.applist.apps, have_more_results: false } } : data);
        assert.equal(tools.length, 10);
        assert.equal(client.getServerCapabilities().resources, undefined);
        const result = await call(name, args);
        assert.notEqual(result.isError, true);
        assert.deepEqual(result.structuredContent, data);
        assert.deepEqual(JSON.parse(result.content[0].text), data);
    });
}
