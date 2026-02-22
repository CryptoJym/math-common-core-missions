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

  return {
    assignments: context.window.BRADY_ASSIGNMENTS || [],
    quizBank: context.window.BRADY_QUIZ || {},
  };
}

test('teacher-guided reading assignments exist and generate practice sets', () => {
  const { assignments, quizBank } = loadAssignmentsAndQuizBank();
  const ids = new Set(assignments.map((a) => String(a?.id || '')));

  const expectedIds = [
    'reading_comprehension_recall_and_evidence',
    'reading_messages_and_life_application',
  ];

  for (const id of expectedIds) {
    assert.ok(ids.has(id), `Expected assignment "${id}" to exist`);
    const assignment = assignments.find((a) => a.id === id);
    const quiz = quizBank.buildPracticeQuiz(assignment, 123);
    const count = Array.isArray(quiz?.questions) ? quiz.questions.length : 0;
    assert.ok(count >= 10, `Expected ${id} to produce >= 10 practice questions`);
  }
});
