const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadAvatarModule() {
  const filePath = path.join(__dirname, '..', 'static_auth', 'js', 'brady_avatar.js');
  const code = fs.readFileSync(filePath, 'utf8');
  const context = vm.createContext({
    window: {},
    document: {
      addEventListener: () => {},
      getElementById: () => ({ innerHTML: '' }),
    },
  });
  vm.runInContext(code, context, { filename: filePath });
  assert.ok(context.window?.BRADY_AVATAR, 'Expected BRADY_AVATAR global to exist');
  return context.window.BRADY_AVATAR;
}

test('chooseStandingLabel selects correct band thresholds', () => {
  const avatar = loadAvatarModule();

  assert.equal(avatar.chooseStandingLabel(0).label, 'Emerging Explorer');
  assert.equal(avatar.chooseStandingLabel(25).label, 'Explorer-in-Training');
  assert.equal(avatar.chooseStandingLabel(49).label, 'Explorer-in-Training');
  assert.equal(avatar.chooseStandingLabel(50).label, 'Steady Competitor');
  assert.equal(avatar.chooseStandingLabel(75).label, 'Core Operator');
  assert.equal(avatar.chooseStandingLabel(90).label, 'Mission-Ready');
  assert.equal(avatar.chooseStandingLabel(101).label, 'Mission-Ready');
  assert.equal(avatar.chooseStandingLabel(-10).label, 'Emerging Explorer');
});

test('summarizeAssignmentProgress counts states and completion rate', () => {
  const avatar = loadAvatarModule();
  const assignmentList = [
    { id: 'a1' },
    { id: 'a2' },
    { id: 'a3' },
    { id: 'a4' },
  ];
  const progressRows = [
    { assignment_id: 'a1', status: 'mastered' },
    { assignment_id: 'a2', status: 'in_progress' },
    { assignment_id: 'a3', status: 'mastered' },
  ];

  const summary = avatar.summarizeAssignmentProgress(progressRows, assignmentList, []);
  assert.equal(summary.total, 4);
  assert.equal(summary.mastered, 2);
  assert.equal(summary.in_progress, 1);
  assert.equal(summary.not_started, 1);
  assert.equal(summary.completionRate, 50);
});

test('computeConsecutiveStreakFromRows computes true run length from latest day', () => {
  const avatar = loadAvatarModule();
  const now = avatar.nowLocalDayISO();
  const rows = [
    { day: avatar.shiftDayISO(now, -1), done: true },
    { day: avatar.shiftDayISO(now, -2), done: true },
    { day: avatar.shiftDayISO(now, 0), done: true },
    { day: avatar.shiftDayISO(now, -3), done: false },
  ];

  const streak = avatar.computeConsecutiveStreakFromRows(
    rows,
    (row) => row.done,
    'day',
  );

  assert.equal(streak, 3);
});

test('summarizeReading sums minutes and recent 7-day window', () => {
  const avatar = loadAvatarModule();
  const now = avatar.nowLocalDayISO();
  const rows = [
    { day: now, minutes: 15 },
    { day: avatar.shiftDayISO(now, -1), minutes: 5 },
    { day: avatar.shiftDayISO(now, -8), minutes: 999 },
    { day: avatar.shiftDayISO(now, -6), minutes: 11 },
    { day: avatar.shiftDayISO(now, -100), minutes: 1000 },
  ];

  const summary = avatar.summarizeReading(rows);
  assert.equal(summary.totalMinutes, 2030);
  assert.equal(summary.minutesLast7, 31);
  assert.equal(summary.streak, 2);
  assert.equal(summary.totalEntries, 5);
});

test('summarizeDaily and aggregateAttempts compute completion and averages', () => {
  const avatar = loadAvatarModule();
  const now = avatar.nowLocalDayISO();
  const nowTs = Date.now();
  const oneHour = 60 * 60 * 1000;

  const dailyRows = [
    { day: now, completed: true, warmup_done: true, target_done: false, mixed_review_done: true, ai_task_done: true },
    { day: avatar.shiftDayISO(now, -1), completed: true, warmup_done: false, target_done: true, mixed_review_done: false, ai_task_done: false },
    { day: avatar.shiftDayISO(now, -2), completed: false, warmup_done: true, target_done: true, mixed_review_done: true, ai_task_done: true },
  ];

  const dailySummary = avatar.summarizeDaily(dailyRows);
  assert.equal(dailySummary.totalTrackedDays, 3);
  assert.equal(dailySummary.completedDays, 2);
  assert.equal(dailySummary.completedRate, 67);

  const attemptRows = [
    { attempted_at: new Date(nowTs - 1 * oneHour).toISOString(), score_percent: 84 },
    { attempted_at: new Date(nowTs - 5 * oneHour).toISOString(), score_percent: 66 },
    { attempted_at: new Date(nowTs - 30 * oneHour).toISOString(), score_percent: 90 },
    { attempted_at: new Date(nowTs - 20 * 24 * oneHour).toISOString(), score_percent: 60 },
  ];

  const attemptAgg = avatar.aggregateAttempts(attemptRows);
  assert.equal(attemptAgg.allAttemptCount, 4);
  assert.equal(attemptAgg.averageAllTime, 75);
  assert.equal(attemptAgg.lastAttemptAt, avatar.toLocalDayISO(new Date(attemptRows[0].attempted_at)));
  assert.ok(attemptAgg.averageLast14 >= 70);
  assert.ok(attemptAgg.averageLast14 <= 80);
});
