const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

test('practice quizzes ramp difficulty from easier to harder (non-decreasing meta.difficulty)', () => {
  global.window = global;
  require(path.join(process.cwd(), 'static_auth/js/brady_assignments.js'));
  require(path.join(process.cwd(), 'static_auth/js/brady_quiz_bank.js'));

  const assignments = global.BRADY_ASSIGNMENTS || [];
  const quizApi = global.BRADY_QUIZ;
  assert.ok(quizApi && typeof quizApi.buildPracticeQuiz === 'function', 'Expected BRADY_QUIZ.buildPracticeQuiz to exist');

  assert.ok(assignments.length > 0, 'Expected at least one assignment');

  for (const a of assignments) {
    const quiz = quizApi.buildPracticeQuiz(a, 987654, {});
    const qs = Array.isArray(quiz?.questions) ? quiz.questions : [];
    assert.equal(qs.length, 10, `Expected practice for ${a.id} to generate 10 questions`);

    const diffs = qs.map((q) => Number(q?.meta?.difficulty));
    diffs.forEach((d, idx) => {
      assert.ok(Number.isFinite(d), `Expected practice ${a.id} question ${idx + 1} to have numeric meta.difficulty`);
      assert.ok(d >= 1 && d <= 5, `Expected practice ${a.id} question ${idx + 1} meta.difficulty to be in 1..5`);
    });

    for (let i = 1; i < diffs.length; i++) {
      assert.ok(
        diffs[i] >= diffs[i - 1],
        `Expected practice ${a.id} difficulty to be non-decreasing. Got: ${diffs.join(', ')}`
      );
    }
  }
});

