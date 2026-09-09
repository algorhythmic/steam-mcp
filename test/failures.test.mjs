import assert from 'node:assert/strict';
import test from 'node:test';
import { AxiosError } from 'axios';
import { createHarness } from './helpers.mjs';

test('a wholly failed store batch is a tool error with per-app reasons', async t => {
    const { call } = await createHarness(t, config => ({ [config.params.appids]: { success: false } }));
    const result = await call('getAppDetails', { appids: [570, 730] });
    assert.equal(result.isError, true);
    assert.deepEqual(result.structuredContent.summary, { requested: 2, succeeded: 0, failed: 2 });
    assert.equal(result.structuredContent['570'].success, false);
    assert.match(result.structuredContent['730'].error, /730/);
});

test('a partially failed batch retains successes and counts each distinct ID once', async t => {
    const { call } = await createHarness(t, config => ({ [config.params.appids]: config.params.appids === 570
        ? { success: true, data: { name: 'Dota 2' } } : { success: false } }));
    const result = await call('getAppDetails', { appids: [570, 730, 570] });
    assert.notEqual(result.isError, true);
    assert.deepEqual(result.structuredContent.summary, { requested: 2, succeeded: 1, failed: 1 });
    assert.equal(result.structuredContent['570'].data.name, 'Dota 2');
    assert.equal(result.structuredContent['730'].success, false);
});

test('network failures and malformed store successes are represented as failed entries', async t => {
    t.mock.method(console, 'error', () => {});
    const { call } = await createHarness(t, config => {
        if (config.params.appids === 570) throw new AxiosError('failed', 'ENOTFOUND', config);
        return { 730: { success: true } };
    });
    const result = await call('getAppDetails', { appids: [570, 730] });
    assert.equal(result.isError, true);
    assert.deepEqual(result.structuredContent.summary, { requested: 2, succeeded: 0, failed: 2 });
});

test('user stats containing success:false are tool errors', async t => {
    t.mock.method(console, 'error', () => {});
    const { call } = await createHarness(t, () => ({ playerstats: { success: false, error: 'Profile is private' } }));
    const result = await call('getUserStatsForGame', { appid: 570, steamid: '76561198000000000' });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /private/);
});

test('malformed upstream success becomes a useful tool error, not a client schema exception', async t => {
    t.mock.method(console, 'error', () => {});
    const { call } = await createHarness(t, () => ({ response: { result: 1 } }));
    const result = await call('getCurrentPlayers', { appid: 570 });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /incomplete or unexpected/);
    assert.equal(result.structuredContent, undefined);
});
