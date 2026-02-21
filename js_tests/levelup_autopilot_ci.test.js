const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'levelup-autopilot.yml');

test('autopilot CI workflow verifies build, tests, and dist sync', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.ok(workflow.includes('python build_solo_leveling_site.py'), 'Workflow should rebuild dist');
  assert.ok(workflow.includes('node --test js_tests/*.test.js'), 'Workflow should run js tests');
  assert.ok(workflow.includes('pytest tests/test_build_output.py'), 'Workflow should run build output checks');
  assert.ok(workflow.includes('git diff --exit-code -- dist'), 'Workflow should fail on dist drift');
});
