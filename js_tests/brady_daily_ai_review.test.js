const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('daily training supports AI review for uploaded artifacts', () => {
  const filePath = path.join(__dirname, '..', 'static_auth', 'js', 'brady_daily.js');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(code.includes(".from('brady_ai_reviews')"), 'Expected daily training to read stored AI reviews from brady_ai_reviews');
  assert.ok(code.includes('/api/brady/review-artifact'), 'Expected daily training to call server endpoint for AI review');
  assert.ok(code.includes('data-review-artifact'), 'Expected uploaded artifact rows to include an AI Check button');
});
