const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

test('student-facing Brady shell uses Level Up naming, not legacy Brady labels', () => {
  const hq = read('static_auth/brady/index.html');
  const admin = read('static_auth/brady/admin.html');
  const avatar = read('static_auth/brady/avatar.html');

  assert.ok(hq.includes('Level Up HQ'), 'HQ heading should be Level Up HQ');
  assert.ok(!hq.includes('Brady Training HQ'), 'Legacy HQ naming should be removed');

  assert.ok(admin.includes('Level Up Admin'), 'Admin heading should be Level Up Admin');
  assert.ok(!admin.includes('Brady Admin Portal'), 'Legacy admin naming should be removed');

  assert.ok(avatar.includes('Progress Dashboard'), 'Avatar page heading should be Progress Dashboard');
  assert.ok(!avatar.includes('Brady Avatar Dashboard'), 'Legacy avatar naming should be removed');
});

test('auth copy avoids legacy jargon and matches Level Up voice', () => {
  const signup = read('static_auth/signup.html');
  const login = read('static_auth/login.html');

  assert.ok(signup.includes('Create Your Account'), 'Signup title should be explicit and plain language');
  assert.ok(!signup.includes('Neural Link Registration'), 'Legacy signup jargon should be removed');

  assert.ok(login.includes('Account Access Required'), 'Login subtitle should be plain language');
});
