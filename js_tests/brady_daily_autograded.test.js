const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('daily training uses auto-graded quizzes and stores attempts', () => {
  const filePath = path.join(__dirname, '..', 'static_auth', 'js', 'brady_daily.js');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(code.includes('brady_practice_attempts'), 'Expected daily training to store attempts in brady_practice_attempts');
  assert.ok(code.includes('daily_warmup'), 'Expected daily training to reference daily_warmup practice kind');
  assert.ok(code.includes('daily_target'), 'Expected daily training to reference daily_target practice kind');
  assert.ok(code.includes('daily_mixed'), 'Expected daily training to reference daily_mixed practice kind');
  assert.ok(code.includes('daily_ai'), 'Expected daily training to reference daily_ai practice kind');

  assert.ok(code.includes('BRADY_QUIZ.buildDailyWarmupQuiz'), 'Expected daily training to build warmup quiz from BRADY_QUIZ');
  assert.ok(code.includes('BRADY_QUIZ.buildPracticeQuiz'), 'Expected daily training to build target/mixed practice quizzes');
  assert.ok(code.includes('BRADY_QUIZ.buildDailyAiQuiz'), 'Expected daily training to build AI quiz from BRADY_QUIZ');
});
