import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const json = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const brand = json('examples/acme/brand.json');

test('example brand basics', () => {
  assert.equal(brand.slug, 'acme');
  assert.equal(brand.cta.contact, null);
  assert.equal(brand.timezone, 'Asia/Jakarta');
});

test('referenced font and logo files exist', () => {
  const files = [brand.fonts.file, brand.logos.on_dark, brand.logos.on_light, brand.logos.on_accent];
  for (const f of files) assert.ok(existsSync(new URL(`examples/acme/${f}`, root)), f);
});

test('plugin manifest', () => {
  assert.equal(json('.claude-plugin/plugin.json').name, 'carousel');
});
