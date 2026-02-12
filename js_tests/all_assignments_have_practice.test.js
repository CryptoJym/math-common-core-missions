const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadAssignmentsAndQuizBank() {
  const assignmentsPath = path.join(__dirname, '..', 'static_auth', 'js', 'brady_assignments.js');
  const quizBankPath = path.join(__dirname, '..', 'static_auth', 'js', 'brady_quiz_bank.js');

  const assignmentsCode = fs.readFileSync(assignmentsPath, 'utf8');
  const quizBankCode = fs.readFileSync(quizBankPath, 'utf8');

  const context = vm.createContext({ window: {} });
  vm.runInContext(assignmentsCode, context, { filename: assignmentsPath });
  vm.runInContext(quizBankCode, context, { filename: quizBankPath });

  const assignments = context.window.BRADY_ASSIGNMENTS;
  const quizBank = context.window.BRADY_QUIZ;
  assert.ok(Array.isArray(assignments), 'Expected window.BRADY_ASSIGNMENTS to be an array');
  assert.ok(quizBank && typeof quizBank.buildPracticeQuiz === 'function', 'Expected window.BRADY_QUIZ.buildPracticeQuiz to exist');
  return { assignments, quizBank };
}

test('every assignment has a non-empty practice problem set', () => {
  const { assignments, quizBank } = loadAssignmentsAndQuizBank();

  const failures = [];
  for (const a of assignments) {
    const quiz = quizBank.buildPracticeQuiz(a, 123456789);
    const len = Array.isArray(quiz?.questions) ? quiz.questions.length : 0;
    if (len < 10) failures.push(`${a.id || a.title || 'unknown'} => ${len} questions`);
  }

  assert.equal(failures.length, 0, `Some assignments have no practice problems:\n${failures.join('\n')}`);
});

