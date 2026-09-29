import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const backup = require('./backup.js');
const selection = {
  id: 'one', kind: 'selection', url: 'https://example.com/article', title: 'Example',
  quote: 'sample', prefix: 'before ', suffix: ' after', start: 10, end: 16,
  isBookmark: false, highlightColor: '#f2bd55', highlightThickness: 15,
  highlightOpacity: 80, note: 'My note', createdAt: '2026-09-28T00:00:00Z'
};
const page = { id: 'two', kind: 'page', url: 'https://example.com/', title: 'Example' };
const styles = {
  bookmark: { color: '#ef6a5b', thickness: 4, opacity: 100 },
  highlight: { color: '#f2bd55', thickness: 15, opacity: 80 },
  underline: { color: '#6f91e8', thickness: 2, opacity: 100, lineStyle: 'wavy' }
};

const parsed = backup.parse(backup.create([selection, page], styles));
assert.equal(parsed.records.length, 2);
assert.equal(parsed.records[0].note, 'My note');
assert.equal(parsed.styles.underline.lineStyle, 'wavy');
assert.equal(backup.parse(backup.create([], null, { color: '#ef6a5b', thickness: 22 })).styles.highlight.thickness, 22);
const merged = backup.merge([selection], parsed.records);
assert.equal(merged.added, 1);
assert.equal(merged.skipped, 1);
assert.equal(backup.merge(merged.records, parsed.records).added, 0);
assert.equal(backup.merge([selection], [{ ...selection, id: 'other-id' }]).skipped, 1);
assert.throws(() => backup.parse('{'), /JSON/);
assert.throws(() => backup.parse(JSON.stringify({ format: 'wrong', schemaVersion: 1, records: [] })), /兼容/);
assert.throws(() => backup.parse(backup.create([{ ...selection, url: 'javascript:alert(1)' }], styles)), /网址/);
assert.throws(() => backup.parse(backup.create([selection, selection], styles)), /重复/);
assert.throws(() => backup.parse(backup.create([{ ...selection, start: -1 }], styles)), /位置/);
assert.throws(() => backup.parse(backup.create([{ ...selection, note: 'x'.repeat(10001) }], styles)), /长度/);
assert.equal(backup.parse(backup.create([{ ...selection, note: '<script>test</script>' }], styles)).records[0].note, '<script>test</script>');
console.log('Backup round-trip, merge, and invalid-file checks passed.');
