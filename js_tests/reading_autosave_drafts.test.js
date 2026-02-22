const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('reading page supports autosave drafts UI + table', () => {
  const htmlPath = path.join(__dirname, '..', 'static_auth', 'brady', 'reading.html');
  const jsPath = path.join(__dirname, '..', 'static_auth', 'js', 'brady_reading.js');

  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');

  assert.ok(html.includes('id="draftMsg"'), 'Expected reading page to have draft status element');
  assert.ok(html.includes('id="pagesRead"'), 'Expected reading page to include pages-read field');
  assert.ok(html.includes('id="rememberedNotes"'), 'Expected reading page to include remembered-notes field');
  assert.ok(html.includes('id="generateQuestions"'), 'Expected reading page to include AI questions button');
  assert.ok(js.includes("from('brady_reading_drafts')"), 'Expected reading script to use brady_reading_drafts');
  assert.ok(js.includes('mha_reading_draft:'), 'Expected reading script to use a localStorage draft key prefix');
  assert.ok(js.includes('/api/brady/reading-questions'), 'Expected reading script to call reading questions endpoint');
});
