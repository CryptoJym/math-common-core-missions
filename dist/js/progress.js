/**
 * Math Hunter Academy - Progress Tracking Module
 * Saves/loads checklist state and mission completion to Supabase
 * Falls back to localStorage for anonymous users
 */

/** Save checklist state for a mission */
async function saveChecklistState(missionNumber, checkboxStates) {
  const session = await MHA_Auth.getSession();

  if (!session) {
    // Fallback to localStorage for anonymous users
    localStorage.setItem(`mission_${missionNumber}_checklist`, JSON.stringify(checkboxStates));
    return;
  }

  const sb = MHA_Auth.getSupabase();
  const allChecked = Object.values(checkboxStates).every(v => v === true);

  // Check if mission was already completed before this save
  let wasAlreadyCompleted = false;
  if (allChecked) {
    const { data: existing } = await sb
      .from('mission_progress')
      .select('completed')
      .eq('user_id', session.user.id)
      .eq('mission_number', missionNumber)
      .single();
    wasAlreadyCompleted = existing?.completed === true;
  }

  await sb.from('mission_progress').upsert({
    user_id: session.user.id,
    mission_number: missionNumber,
    checklist_state: checkboxStates,
    completed: allChecked,
    completed_at: allChecked ? new Date().toISOString() : null
  }, {
    onConflict: 'user_id,mission_number'
  });

  // Award XP only on first completion (false → true transition)
  if (allChecked && !wasAlreadyCompleted) {
    const xpReward = getXPForMission(missionNumber);
    await updateXP(session.user.id, xpReward);
  }
}

/** Load checklist state for a mission */
async function loadChecklistState(missionNumber) {
  const session = await MHA_Auth.getSession();

  if (!session) {
    const stored = localStorage.getItem(`mission_${missionNumber}_checklist`);
    return stored ? JSON.parse(stored) : {};
  }

  const sb = MHA_Auth.getSupabase();
  const { data } = await sb
    .from('mission_progress')
    .select('checklist_state, completed')
    .eq('user_id', session.user.id)
    .eq('mission_number', missionNumber)
    .single();

  return data?.checklist_state || {};
}

/** Load all mission progress for the current user (for index page badges) */
async function loadAllProgress() {
  const session = await MHA_Auth.getSession();
  if (!session) return {};

  const sb = MHA_Auth.getSupabase();
  const { data } = await sb
    .from('mission_progress')
    .select('mission_number, completed')
    .eq('user_id', session.user.id);

  const progress = {};
  if (data) {
    data.forEach(row => {
      progress[row.mission_number] = row.completed;
    });
  }
  return progress;
}

/** Get XP reward for a mission based on rank */
function getXPForMission(missionNumber) {
  if (missionNumber <= 3) return 50;       // E-Rank
  if (missionNumber <= 6) return 100;      // D-Rank
  if (missionNumber <= 9) return 200;      // C-Rank
  if (missionNumber <= 12) return 350;     // B-Rank
  return 500;                               // A-Rank
}

/** Update user XP total */
async function updateXP(userId, xpToAdd) {
  const sb = MHA_Auth.getSupabase();
  const { data: profile } = await sb
    .from('profiles')
    .select('xp_total')
    .eq('id', userId)
    .single();

  const newXP = (profile?.xp_total || 0) + xpToAdd;

  // Determine rank based on total XP
  let rank = 'E-Rank';
  if (newXP >= 2000) rank = 'S-Rank';
  else if (newXP >= 1500) rank = 'A-Rank';
  else if (newXP >= 1000) rank = 'B-Rank';
  else if (newXP >= 500) rank = 'C-Rank';
  else if (newXP >= 200) rank = 'D-Rank';

  await sb.from('profiles').update({
    xp_total: newXP,
    hunter_rank: rank
  }).eq('id', userId);
}

/** Initialize checklist tracking on a mission page */
async function initMissionProgress(missionNumber) {
  const checkboxes = document.querySelectorAll('.checklist-item input[type="checkbox"], .checklist-box input[type="checkbox"]');
  if (checkboxes.length === 0) return;

  // Load saved state
  const savedState = await loadChecklistState(missionNumber);

  // Apply saved state
  checkboxes.forEach((checkbox, index) => {
    const key = `check_${index}`;
    if (savedState[key]) {
      checkbox.checked = true;
    }

    // Save on change
    checkbox.addEventListener('change', async () => {
      const currentState = {};
      checkboxes.forEach((cb, i) => {
        currentState[`check_${i}`] = cb.checked;
      });
      await saveChecklistState(missionNumber, currentState);
    });
  });
}

/** Show completion badges on index page gate cards */
async function initIndexProgress() {
  const progress = await loadAllProgress();

  document.querySelectorAll('.gate-card').forEach(card => {
    const href = card.getAttribute('href');
    if (!href) return;

    const match = href.match(/mission_(\d+)/);
    if (!match) return;

    const missionNum = parseInt(match[1], 10);
    if (progress[missionNum]) {
      const badge = document.createElement('span');
      badge.className = 'completion-badge';
      badge.textContent = 'CLEARED';
      card.appendChild(badge);
      card.classList.add('mission-cleared');
    }
  });
}

// Expose globally
window.MHA_Progress = {
  saveChecklistState, loadChecklistState, loadAllProgress,
  initMissionProgress, initIndexProgress
};
