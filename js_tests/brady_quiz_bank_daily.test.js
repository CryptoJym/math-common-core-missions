const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadQuizBank() {
  const filePath = path.join(__dirname, '..', 'static_auth', 'js', 'brady_quiz_bank.js');
  const code = fs.readFileSync(filePath, 'utf8');
  const context = vm.createContext({ window: {} });
  vm.runInContext(code, context, { filename: filePath });
  assert.ok(context.window.BRADY_QUIZ, 'Expected window.BRADY_QUIZ to exist');
  return context.window.BRADY_QUIZ;
}

test('buildDailyWarmupQuiz returns a stable daily warmup quiz', () => {
  const quizBank = loadQuizBank();
  assert.equal(typeof quizBank.buildDailyWarmupQuiz, 'function');

  const quizA = quizBank.buildDailyWarmupQuiz(123);
  const quizB = quizBank.buildDailyWarmupQuiz(123);

  assert.equal(quizA.passPercent, 80);
  assert.ok(Array.isArray(quizA.questions));
  assert.equal(quizA.questions.length, 8);
  assert.deepEqual(
    quizA.questions.map((q) => q.prompt),
    quizB.questions.map((q) => q.prompt),
    'Expected warmup quiz to be deterministic for a fixed seed'
  );
});

test('buildDailyAiQuiz returns an auto-graded AI quiz', () => {
  const quizBank = loadQuizBank();
  assert.equal(typeof quizBank.buildDailyAiQuiz, 'function');

  const quiz = quizBank.buildDailyAiQuiz(456);
  assert.equal(quiz.passPercent, 80);
  assert.ok(Array.isArray(quiz.questions));
  assert.equal(quiz.questions.length, 6);

  for (const q of quiz.questions) {
    assert.ok(q.id);
    assert.ok(q.prompt);
    assert.ok(q.type);
    assert.ok(q.answer !== undefined);
  }
});
