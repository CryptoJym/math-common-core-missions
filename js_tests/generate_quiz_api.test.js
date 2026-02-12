const test = require('node:test');
const assert = require('node:assert/strict');

const api = require('../api/brady/generate-quiz.js');
const { safeJsonParse, validateGeneratedQuiz, buildQuizPrompt } = api._internal;

test('safeJsonParse parses pure JSON', () => {
  const obj = safeJsonParse('{"a":1,"b":[2,3]}');
  assert.deepEqual(obj, { a: 1, b: [2, 3] });
});

test('safeJsonParse extracts JSON from wrapped text', () => {
  const obj = safeJsonParse('Here:\n{"ok":true}\nThanks');
  assert.deepEqual(obj, { ok: true });
});

test('validateGeneratedQuiz accepts a valid quiz', () => {
  const quiz = {
    passPercent: 80,
    title: 'Test Quiz',
    questions: Array.from({ length: 10 }, (_, i) => ({
      id: `q${i + 1}`,
      type: 'mc',
      prompt: `Question ${i + 1}`,
      choices: ['A', 'B', 'C'],
      answer: 'B',
      explanation: 'Because.',
      tags: ['tag_one'],
    })),
  };
  const v = validateGeneratedQuiz(quiz);
  assert.equal(v.ok, true, `expected ok, got errors: ${(v.errors || []).join(', ')}`);
});

test('validateGeneratedQuiz rejects wrong answer type', () => {
  const quiz = {
    passPercent: 80,
    title: 'Bad Quiz',
    questions: Array.from({ length: 10 }, (_, i) => ({
      id: `q${i + 1}`,
      type: 'number',
      prompt: `Question ${i + 1}`,
      answer: 'not a number',
      explanation: 'Because.',
      tags: ['tag_one'],
    })),
  };
  const v = validateGeneratedQuiz(quiz);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('answer must be a number')));
});

test('buildQuizPrompt includes focus tags and targets', () => {
  const prompt = buildQuizPrompt({
    assignment: {
      id: 'math_equivalent_fractions',
      title: 'Equivalent Fractions',
      standards: ['3.NF.3.a'],
      learningTargets: ['Simplify fractions', 'Decide equivalence'],
    },
    passPercent: 80,
    focusTags: { simplify: 3, equivalence: 1 },
    latestScorePercent: 60,
  });
  assert.ok(prompt.includes('Equivalent Fractions'));
  assert.ok(prompt.includes('simplify'));
  assert.ok(prompt.includes('Simplify fractions'));
  assert.ok(prompt.includes('Most recent score: 60%'));
});

