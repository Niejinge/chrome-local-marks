import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { groupRecords } = require('./record-groups.js');

const records = [
  { id: 'old', url: 'https://example.com/a#first', title: '旧标题', createdAt: '2026-09-01' },
  { id: 'new', url: 'https://example.com/a#second', title: '新标题', updatedAt: '2026-09-29' },
  { id: 'query1', url: 'https://example.com/a?q=1', title: '查询一', createdAt: '2026-09-20' },
  { id: 'query2', url: 'https://example.com/a?q=2', title: '查询二', createdAt: '2026-09-21' },
  { id: 'other', url: 'https://other.example/a', title: '另一网站', createdAt: '2026-09-23' },
  { id: 'file', url: 'file:///tmp/a.html', title: '本地页面' },
];
const before = JSON.stringify(records);
const pages = groupRecords(records);
assert.equal(pages.length, 5, 'Fragments merge; query parameters remain separate pages');
assert.equal(pages[0].title, '新标题');
assert.deepEqual(pages[0].items.map(item => item.id), ['new', 'old']);
assert.equal(groupRecords(records, 'site').length, 3);
assert.equal(groupRecords(records, 'site')[0].items.length, 4);
assert.equal(groupRecords(records, 'site')[2].title, '本地文件');
assert.equal(JSON.stringify(records), before, 'Grouping must not mutate stored records');
assert.deepEqual(groupRecords([]), []);
assert.equal(groupRecords([{ url: 'invalid', title: '旧数据' }])[0].title, '旧数据');
console.log('Grouping checks passed: fragments, query parameters, sorting, sites, local files, immutability.');
