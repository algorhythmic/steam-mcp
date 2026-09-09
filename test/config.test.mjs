import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../build/config.js';

test('configuration accepts client environment without a .env file', t => {
    const dir = mkdtempSync(join(tmpdir(), 'steam-mcp-config-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const envPath = join(dir, '.env');
    assert.deepEqual(loadConfig({ envPath, environment: { STEAM_API_KEY: 'client-key' } }), { apiKey: 'client-key' });
    assert.throws(() => loadConfig({ envPath, environment: {} }), /STEAM_API_KEY is required/);
    assert.throws(() => loadConfig({ envPath, environment: { STEAM_API_KEY: '  ' } }), /STEAM_API_KEY is required/);
});

test('dotenv provides a fallback while explicit environment takes precedence', t => {
    const dir = mkdtempSync(join(tmpdir(), 'steam-mcp-config-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const envPath = join(dir, '.env');
    writeFileSync(envPath, 'STEAM_API_KEY=file-key\n');
    assert.equal(loadConfig({ envPath, environment: {} }).apiKey, 'file-key');
    assert.equal(loadConfig({ envPath, environment: { STEAM_API_KEY: 'client-key' } }).apiKey, 'client-key');
    assert.throws(() => loadConfig({ envPath: dir, environment: { STEAM_API_KEY: 'client-key' } }), /Could not read configuration file/);
});
