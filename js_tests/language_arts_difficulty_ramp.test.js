const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

test('language arts quizzes ramp difficulty from easier to harder (reading + language)', () => {
  global.window = global;
  require(path.join(process.cwd(), 'static_auth/js/brady_assignments.js'));
  require(path.join(process.cwd(), 'static_auth/js/brady_quiz_bank.js'));

  const assignments = global.BRADY_ASSIGNMENTS || [];
  const quizApi = global.BRADY_QUIZ;
  assert.ok(quizApi && typeof quizApi.buildQuiz === 'function', 'Expected BRADY_QUIZ.buildQuiz to exist');

  const la = assignments.filter((a) => a && (a.subject === 'reading' || a.subject === 'language'));
  assert.ok(la.length > 0, 'Expected at least one reading/language assignment');

  for (const a of la) {
    const quiz = quizApi.buildQuiz(a, 13579, {});
    const qs = Array.isArray(quiz?.questions) ? quiz.questions : [];
    assert.ok(qs.length > 0, `Expected ${a.id} to generate at least one question`);

    const diffs = qs.map((q) => Number(q?.meta?.difficulty));
    diffs.forEach((d, idx) => {
      assert.ok(Number.isFinite(d), `Expected ${a.id} question ${idx + 1} to have numeric meta.difficulty`);
      assert.ok(d >= 1 && d <= 5, `Expected ${a.id} question ${idx + 1} meta.difficulty to be in 1..5`);
    });

    for (let i = 1; i < diffs.length; i++) {
      assert.ok(
        diffs[i] >= diffs[i - 1],
        `Expected ${a.id} difficulty to be non-decreasing. Got: ${diffs.join(', ')}`
      );
    }
  }
});

