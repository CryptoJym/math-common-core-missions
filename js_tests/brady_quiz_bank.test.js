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

test('buildQuiz overrides passPercent from assignment', () => {
  const quizBank = loadQuizBank();
  const assignment = {
    quizId: 'math_equivalent_fractions',
    passPercent: 90,
    title: 'Equivalent Fractions',
  };
  const quiz = quizBank.buildQuiz(assignment, 123);
  assert.equal(quiz.passPercent, 90);
  assert.equal(quiz.questions.length, 10);
});

test('equivalent fractions adapts toward simplify when simplify is missed more', () => {
  const quizBank = loadQuizBank();
  const assignment = {
    quizId: 'math_equivalent_fractions',
    passPercent: 80,
    title: 'Equivalent Fractions',
  };
  const quiz = quizBank.buildQuiz(assignment, 123, { focusTags: { simplify: 10, equivalence: 0 } });
  const simplifyCount = quiz.questions.filter((q) => Array.isArray(q.tags) && q.tags.includes('simplify')).length;
  const eqCount = quiz.questions.filter((q) => Array.isArray(q.tags) && q.tags.includes('equivalence')).length;
  assert.equal(quiz.questions.length, 10);
  assert.ok(simplifyCount > eqCount, `expected simplifyCount > eqCount, got ${simplifyCount} vs ${eqCount}`);
});

test('proportions + slope adapts toward unit_rate when unit_rate is missed more', () => {
  const quizBank = loadQuizBank();
  const assignment = {
    quizId: 'math_proportions_and_slope',
    passPercent: 80,
    title: 'Proportions + Slope',
  };
  const quiz = quizBank.buildQuiz(assignment, 123, { focusTags: { unit_rate: 10, evaluate_y: 0 } });
  const unitRateCount = quiz.questions.filter((q) => Array.isArray(q.tags) && q.tags.includes('unit_rate')).length;
  const evalYCount = quiz.questions.filter((q) => Array.isArray(q.tags) && q.tags.includes('evaluate_y')).length;
  assert.equal(quiz.questions.length, 10);
  assert.ok(unitRateCount > evalYCount, `expected unitRateCount > evalYCount, got ${unitRateCount} vs ${evalYCount}`);
});

