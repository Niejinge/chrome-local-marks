import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const styles = require('./mark-styles.js');

const fresh = styles.normalize();
assert.equal(fresh.highlight.thickness, 30);
assert.equal(styles.meta.highlight.presets.at(-1)[1], '粗');
assert.equal(fresh['underline-solid'].thickness, 3);
assert.equal(fresh['underline-wavy'].thickness, 3);

const legacy = {
  bookmark: { color: '#ef6a5b', thickness: 4, opacity: 100 },
  highlight: { color: '#f2bd55', thickness: 7, opacity: 55 },
  underline: { color: '#a78bfa', thickness: 6, opacity: 35, lineStyle: 'wavy' }
};
const migrated = styles.migrate(legacy);
assert.equal(migrated.highlight.thickness, 30);
assert.equal(migrated.highlight.color, '#f2bd55');
assert.equal(migrated.highlight.opacity, 55);
assert.deepEqual(migrated['underline-solid'], fresh['underline-solid']);
assert.equal(migrated['underline-wavy'].thickness, 3);
assert.equal(migrated['underline-wavy'].color, '#a78bfa');
assert.equal(migrated['underline-wavy'].opacity, 35);

const changed = styles.normalize({
  ...migrated,
  'underline-wavy': { color: '#65b883', thickness: 6, opacity: 70 }
});
assert.equal(changed['underline-solid'].thickness, 3);
assert.equal(changed['underline-wavy'].thickness, 6);
assert.equal(styles.normalize(changed)['underline-wavy'].thickness, 6);
assert.equal(styles.migrate(legacy, null, false).highlight.thickness, 7);
console.log('Independent style defaults, migration, and persistence checks passed.');
