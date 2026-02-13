/* global MHA_Auth, MHA_Brady */

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setAlert(msg) {
  const el = document.getElementById('alert');
  if (!el) return;
  if (!msg) {
    el.style.display = 'none';
    el.textContent = '';
    return;
  }
  el.style.display = 'block';
  el.textContent = msg;
}

function renderPlan(plan, meta) {
  const holder = document.getElementById('planContainer');
  const metaEl = document.getElementById('coachMeta');
  if (metaEl) {
    const reused = meta?.reused ? 'Reused cached plan' : 'Generated new plan';
    const provider = meta?.provider ? String(meta.provider) : 'unknown';
    const model = meta?.model ? String(meta.model) : '';
    const day = plan?.day ? String(plan.day) : '';
    metaEl.textContent = `${reused}. Provider: ${provider}${model ? ` (${model})` : ''}. Day: ${day || '—'}.`;
  }
  if (!holder) return;

  if (!plan || typeof plan !== 'object') {
    holder.innerHTML = '<div class="small">No plan available.</div>';
    return;
  }

  const steps = Array.isArray(plan.steps) ? plan.steps : [];
  const headline = String(plan.headline || '').trim() || 'Daily plan';
  const stepsHtml = steps.map((s) => {
    const title = escapeHtml(s?.title || 'Step');
    const minutes = Number.isFinite(Number(s?.minutes)) ? Number(s.minutes) : null;
    const instructions = escapeHtml(s?.instructions || '');
    return `
      <div class="section" style="margin: 12px 0; padding: 14px 14px;">
        <div class="pill-row">
          <span class="pill">${title}</span>
          ${minutes ? `<span class="pill mono">${escapeHtml(minutes)} min</span>` : ''}
        </div>
        <div class="small" style="margin-top:10px; white-space: pre-wrap;">${instructions}</div>
      </div>
    `;
  }).join('');

  const cfu = Array.isArray(plan.check_for_understanding) ? plan.check_for_understanding : [];
  const cfuHtml = cfu.length
    ? `
      <div class="ai-box" style="margin-top:10px;">
        <h4>Check For Understanding</h4>
        <ul style="padding-left:18px;">
          ${cfu.slice(0, 6).map((q) => {
            const question = escapeHtml(q?.question || '');
            const expected = escapeHtml(q?.expected || '');
            return `<li class="small"><span class="mono">Q:</span> ${question}<br><span class="mono">Expected:</span> ${expected}</li>`;
          }).join('')}
        </ul>
      </div>
    `
    : '';

  holder.innerHTML = `
    <div class="pill-row">
      <span class="pill">${escapeHtml(headline)}</span>
    </div>
    ${stepsHtml || '<div class="small" style="margin-top:10px;">No steps provided yet.</div>'}
    ${cfuHtml}
  `;
}

function normalizeManualPayload({ goal, sessionMinutes, tone, notes }) {
  const out = {
    goal: String(goal || '').trim(),
    session_minutes: Number.isFinite(Number(sessionMinutes)) ? Number(sessionMinutes) : null,
    tone: String(tone || '').trim() || 'direct',
    notes: String(notes || '').trim(),
  };
  if (!out.goal) delete out.goal;
  if (!out.notes) delete out.notes;
  if (!out.session_minutes) delete out.session_minutes;
  return out;
}

function applyManualToForm(manual) {
  const goalEl = document.getElementById('manualGoal');
  const minsEl = document.getElementById('manualSessionMinutes');
  const toneEl = document.getElementById('manualTone');
  const notesEl = document.getElementById('manualNotes');

  if (goalEl) goalEl.value = String(manual?.goal || '');
  if (minsEl) minsEl.value = manual?.session_minutes != null ? String(manual.session_minutes) : '';
  if (toneEl) toneEl.value = String(manual?.tone || 'direct');
  if (notesEl) notesEl.value = String(manual?.notes || '');
}

function renderProfile(profile) {
  const holder = document.getElementById('profileContainer');
  if (!holder) return;

  if (!profile || typeof profile !== 'object') {
    holder.textContent = 'No profile loaded yet.';
    return;
  }

  const manual = profile.manual && typeof profile.manual === 'object' ? profile.manual : {};
  const memory = profile.memory && typeof profile.memory === 'object' ? profile.memory : {};
  const updatedAt = profile.updated_at ? new Date(profile.updated_at).toLocaleString() : '—';

  const strengths = Array.isArray(memory?.strengths) ? memory.strengths : [];
  const weaknesses = Array.isArray(memory?.weaknesses) ? memory.weaknesses : [];
  const next = memory?.next_focus && typeof memory.next_focus === 'object' ? memory.next_focus : null;

  const strengthsHtml = strengths.length
    ? `<ul style="padding-left:18px;">${strengths.slice(0, 8).map((s) => `<li class="small">${escapeHtml(s)}</li>`).join('')}</ul>`
    : '<div class="small">No strengths saved yet.</div>';

  const weaknessesHtml = weaknesses.length
    ? `<ul style="padding-left:18px;">${weaknesses.slice(0, 8).map((w) => {
      const area = escapeHtml(w?.area || '');
      const evidence = escapeHtml(w?.evidence || '');
      return `<li class="small"><span class="mono">${area || 'Weak area'}:</span> ${evidence}</li>`;
    }).join('')}</ul>`
    : '<div class="small">No weaknesses saved yet.</div>';

  const nextHtml = next
    ? `<div class="small"><span class="mono">Next focus:</span> ${escapeHtml(next.type || '')} ${escapeHtml(next.id || '')} (${escapeHtml(next.why || '')})</div>`
    : '<div class="small">No next focus saved yet.</div>';

  holder.innerHTML = `
    <div class="pill-row">
      <span class="pill mono">Last updated: ${escapeHtml(updatedAt)}</span>
    </div>
    <div class="section" style="margin-top:12px;">
      <h2 style="margin-bottom:8px;">Manual</h2>
      <pre class="mono" style="white-space: pre-wrap;">${escapeHtml(JSON.stringify(manual, null, 2))}</pre>
    </div>
    <div class="section" style="margin-top:12px;">
      <h2 style="margin-bottom:8px;">Memory</h2>
      ${nextHtml}
      <div style="margin-top:10px;">
        <div class="small" style="margin-bottom:6px;"><span class="mono">Strengths</span></div>
        ${strengthsHtml}
      </div>
      <div style="margin-top:10px;">
        <div class="small" style="margin-bottom:6px;"><span class="mono">Weaknesses</span></div>
        ${weaknessesHtml}
      </div>
    </div>
  `;
}

async function loadProfileRow(queryUserId) {
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('brady_ai_learner_profile')
    .select('user_id,schema_version,manual,memory,updated_at,created_at')
    .eq('user_id', queryUserId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function upsertManual(queryUserId, manualPatch) {
  const sb = MHA_Auth.getSupabase();
  const row = {
    user_id: queryUserId,
    manual: manualPatch || {},
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from('brady_ai_learner_profile')
    .upsert(row, { onConflict: 'user_id' })
    .select('user_id,schema_version,manual,memory,updated_at,created_at')
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function fetchCoachPlan(session, queryUserId, force = false) {
  const resp = await fetch('/api/brady/coach', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      queryUserId,
      force: Boolean(force),
    }),
  });

  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(payload?.error || `Coach request failed (${resp.status}).`);
  }
  return payload;
}

async function main() {
  try {
    const gate = await MHA_Brady.requireBrady({ nextPath: 'brady/coach.html' });
    if (!gate) return;

    await MHA_Auth.initAuthUI(false);
    document.body.classList.add('has-user-nav');

    const { userId: queryUserId } = MHA_Brady.getBradyQueryUser(gate.session, gate.context);

    // Load profile row if present (manual inputs can be saved even before the first AI plan run).
    let profile = null;
    try {
      profile = await loadProfileRow(queryUserId);
    } catch (_) {
      profile = null;
    }

    const manual = profile?.manual && typeof profile.manual === 'object' ? profile.manual : {};
    applyManualToForm(manual);
    renderProfile(profile);

    const manualMsg = document.getElementById('manualSaveMsg');
    const saveManualBtn = document.getElementById('saveManualBtn');
    if (saveManualBtn) {
      saveManualBtn.addEventListener('click', async () => {
        if (manualMsg) manualMsg.textContent = '';
        setAlert('');
        saveManualBtn.disabled = true;
        saveManualBtn.textContent = 'Saving…';
        try {
          const goal = document.getElementById('manualGoal')?.value;
          const mins = document.getElementById('manualSessionMinutes')?.value;
          const tone = document.getElementById('manualTone')?.value;
          const notes = document.getElementById('manualNotes')?.value;
          const patch = normalizeManualPayload({
            goal,
            sessionMinutes: mins,
            tone,
            notes,
          });

          const saved = await upsertManual(queryUserId, patch);
          if (manualMsg) manualMsg.textContent = 'Saved.';
          renderProfile(saved);
          setTimeout(() => { if (manualMsg) manualMsg.textContent = ''; }, 1200);
        } catch (e) {
          setAlert(e?.message || 'Save failed.');
        } finally {
          saveManualBtn.disabled = false;
          saveManualBtn.textContent = 'Save Manual Inputs';
        }
      });
    }

    const refreshBtn = document.getElementById('refreshPlanBtn');
    const forceBtn = document.getElementById('forcePlanBtn');
    const run = async (force) => {
      setAlert('');
      if (refreshBtn) refreshBtn.disabled = true;
      if (forceBtn) forceBtn.disabled = true;
      try {
        const out = await fetchCoachPlan(gate.session, queryUserId, force);
        renderPlan(out.daily_plan, { reused: out.reused, provider: out.provider, model: out.model });
        renderProfile(out.profile);
      } catch (e) {
        setAlert(e?.message || 'Coach failed.');
      } finally {
        if (refreshBtn) refreshBtn.disabled = false;
        if (forceBtn) forceBtn.disabled = false;
      }
    };

    if (refreshBtn) refreshBtn.addEventListener('click', () => { void run(false); });
    if (forceBtn) forceBtn.addEventListener('click', () => { void run(true); });

    // Default: auto-generate on load (daily caching prevents repeated spend).
    await run(false);
  } catch (e) {
    setAlert(e?.message || 'Unable to load coach page.');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  void main();
});

