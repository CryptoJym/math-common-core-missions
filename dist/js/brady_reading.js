function todayLocalISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const BRADY_BOOKS = [
  { id: 'richest_man_babylon', title: 'The Richest Man in Babylon' },
  { id: 'alchemist', title: 'The Alchemist' },
  { id: 'anthem', title: 'Anthem (Ayn Rand)' },
];

function setAlert(msg) {
  const el = document.getElementById('alert');
  if (!el) return;
  if (!msg) {
    el.style.display = 'none';
    el.textContent = '';
    return;
  }
  el.textContent = msg;
  el.style.display = 'block';
}

function setDraftMsg(msg) {
  const el = document.getElementById('draftMsg');
  if (!el) return;
  el.textContent = String(msg || '');
}

function bookTitle(bookId) {
  const match = BRADY_BOOKS.find((b) => b.id === bookId);
  return match ? match.title : String(bookId || '');
}

function readingDraftKey(dayISO, bookId) {
  // Local-only key on purpose: supports autosave even before auth/gate resolves.
  // Remote drafts are stored separately in Supabase (brady_reading_drafts).
  return `mha_reading_draft:${String(dayISO || '')}:${String(bookId || '')}`;
}

function readLocalDraft(dayISO, bookId) {
  try {
    const raw = localStorage.getItem(readingDraftKey(dayISO, bookId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function writeLocalDraft(dayISO, bookId, payload) {
  try {
    localStorage.setItem(readingDraftKey(dayISO, bookId), JSON.stringify(payload));
  } catch (_) {
    // ignore
  }
}

function clearLocalDraft(dayISO, bookId) {
  try {
    localStorage.removeItem(readingDraftKey(dayISO, bookId));
  } catch (_) {
    // ignore
  }
}

async function loadReadingDraftRow(session, queryUserId, dayISO, bookId) {
  void session;
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('brady_reading_drafts')
    .select('day,book_id,minutes,journal,updated_at')
    .eq('user_id', queryUserId)
    .eq('day', dayISO)
    .eq('book_id', bookId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function saveReadingDraftRow(session, queryUserId, dayISO, bookId, minutes, journal) {
  void session;
  const sb = MHA_Auth.getSupabase();
  const { error } = await sb
    .from('brady_reading_drafts')
    .upsert({
      user_id: queryUserId,
      day: dayISO,
      book_id: bookId,
      minutes,
      journal,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,day,book_id' });
  if (error) throw error;
}

async function clearReadingDraftRow(session, queryUserId, dayISO, bookId) {
  void session;
  const sb = MHA_Auth.getSupabase();
  const { error } = await sb
    .from('brady_reading_drafts')
    .delete()
    .eq('user_id', queryUserId)
    .eq('day', dayISO)
    .eq('book_id', bookId);
  if (error) throw error;
}

function setAiPrompts() {
  const day = document.getElementById('day')?.value || todayLocalISO();
  const bookId = document.getElementById('book')?.value || BRADY_BOOKS[0]?.id;
  const minutes = document.getElementById('minutes')?.value || '';
  const journal = document.getElementById('journal')?.value || '';
  const title = bookTitle(bookId);

  const chatgpt = [
    `I read "${title}" on ${day} for ${minutes || '?'} minutes.`,
    '',
    'Ask me 6 reflection questions that connect the reading to my real life.',
    'Then help me write a journal entry in my voice (keep it honest, not cheesy).',
    'Finally, give me 3 specific actions I can take today based on what I read.',
    '',
    'Here are my rough notes (optional):',
    journal ? journal : '(no notes yet)',
  ].join('\n');

  const codex = [
    'Help me build a tiny local "reading tracker" script.',
    '- Input: date, book, minutes, journal',
    '- Output: weekly minutes totals, streaks, and a simple report',
    '- Save data in a local JSON file',
    '',
    `Seed today: ${day}, ${title}, ${minutes || 0} minutes`,
  ].join('\n');

  const claude = [
    'Review my reading tracker script and improve it:',
    '- Make the data format stable and human-readable',
    '- Add basic tests',
    '- Add a "weekly reflection" that summarizes my journal entries (no hallucinations; only use what I wrote)',
  ].join('\n');

  const setVal = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  };
  setVal('chatgptPrompt', chatgpt);
  setVal('codexPrompt', codex);
  setVal('claudePrompt', claude);
}

function bindPromptControls() {
  const marker = document.body?.dataset?.mhaReadingBound;
  if (marker === '1') return;
  if (document.body && document.body.dataset) document.body.dataset.mhaReadingBound = '1';

  const fillPromptBtn = document.getElementById('fillPrompt');
  const aiBox = document.getElementById('aiBox');
  if (fillPromptBtn && aiBox) {
    fillPromptBtn.addEventListener('click', () => {
      setAiPrompts();
      aiBox.style.display = (aiBox.style.display === 'none') ? 'block' : 'none';
    });
  }

  const maybeUpdatePrompts = () => {
    if (aiBox && aiBox.style.display !== 'none') setAiPrompts();
  };
  ['day', 'book', 'minutes', 'journal'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', maybeUpdatePrompts);
    el.addEventListener('change', maybeUpdatePrompts);
  });

  Array.from(document.querySelectorAll('button[data-copy]')).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-copy');
      try {
        await MHA_Brady.copyTextFromEl(id);
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = 'Copy'; }, 900);
      } catch (_) {
        setAlert('Copy failed. Your browser may block clipboard access here.');
      }
    });
  });
}

async function loadReadingLogs(session, queryUserId) {
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('brady_reading_log')
    .select('day,book_id,minutes,journal,created_at')
    .eq('user_id', queryUserId)
    .order('day', { ascending: false })
    .limit(60);
  if (error) throw error;
  return data || [];
}

function renderReadingLogs(rows) {
  const tbody = document.getElementById('readingRows');
  if (!tbody) return;

  tbody.innerHTML = (rows || []).map((r) => {
    const day = r.day || '';
    const book = bookTitle(r.book_id);
    const minutes = r.minutes ?? '';
    const journal = (r.journal || '').trim();
    const safe = (s) => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `
      <tr>
        <td class="mono">${safe(day)}</td>
        <td>${safe(book)}</td>
        <td class="mono">${safe(minutes)}</td>
        <td>${safe(journal)}</td>
      </tr>
    `;
  }).join('');

  const summaryEl = document.getElementById('readingSummary');
  if (summaryEl) {
    const total = (rows || []).reduce((acc, r) => acc + (Number(r.minutes) || 0), 0);
    summaryEl.textContent = `Last ${Math.min((rows || []).length, 60)} entries loaded. Total minutes in this list: ${total}.`;
  }
}

async function saveReading(session, queryUserId) {
  const sb = MHA_Auth.getSupabase();
  const day = document.getElementById('day')?.value || todayLocalISO();
  const bookId = document.getElementById('book')?.value;
  const minutesRaw = document.getElementById('minutes')?.value;
  const minutes = Number(minutesRaw);
  const journal = document.getElementById('journal')?.value || null;

  if (!bookId) throw new Error('Select a book.');
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 600) {
    throw new Error('Minutes must be a number between 0 and 600.');
  }

  const { error } = await sb.from('brady_reading_log').upsert({
    user_id: queryUserId,
    day,
    book_id: bookId,
    minutes,
    journal,
  }, { onConflict: 'user_id,day,book_id' });
  if (error) throw error;
}

async function main() {
  try {
    // Bind prompt controls immediately so early clicks (and E2E tests) work even
    // while async Supabase loads are still in-flight.
    bindPromptControls();

    // Set up defaults early so autosave works immediately.
    const dayEl = document.getElementById('day');
    if (dayEl && !dayEl.value) dayEl.value = todayLocalISO();

    const bookEl = document.getElementById('book');
    if (bookEl && bookEl.options.length === 0) {
      bookEl.innerHTML = BRADY_BOOKS.map((b) => `<option value="${b.id}">${b.title}</option>`).join('');
    }

    // Drafts: local autosave always works; remote autosave begins once auth + learner context resolves.
    let gateSession = null;
    let queryUserId = null;
    let draftSaveTimer = null;
    let draftFlushTimer = null;

    const getCurrentKey = () => {
      const day = document.getElementById('day')?.value || todayLocalISO();
      const bookId = document.getElementById('book')?.value || BRADY_BOOKS[0]?.id;
      return { day, bookId };
    };

    const applyDraftToForm = (draft) => {
      const minutesEl = document.getElementById('minutes');
      const journalEl = document.getElementById('journal');
      if (minutesEl) minutesEl.value = draft?.minutes != null ? String(draft.minutes) : '';
      if (journalEl) journalEl.value = String(draft?.journal || '');
    };

    const clearFormFields = () => {
      const minutesEl = document.getElementById('minutes');
      const journalEl = document.getElementById('journal');
      if (minutesEl) minutesEl.value = '';
      if (journalEl) journalEl.value = '';
    };

    const captureDraftPayload = () => {
      const { day, bookId } = getCurrentKey();
      const minutesRaw = document.getElementById('minutes')?.value;
      const journal = document.getElementById('journal')?.value || '';
      const minutesNum = minutesRaw === '' ? null : Number(minutesRaw);
      const minutes = Number.isFinite(minutesNum) ? Number(minutesNum) : null;
      return {
        day,
        book_id: bookId,
        minutes,
        journal,
        updated_at: new Date().toISOString(),
      };
    };

    const writeLocalNow = () => {
      const payload = captureDraftPayload();
      writeLocalDraft(payload.day, payload.book_id, payload);
      return payload;
    };

    const scheduleRemoteSave = () => {
      if (!gateSession || !queryUserId) return;
      if (draftSaveTimer) window.clearTimeout(draftSaveTimer);
      draftSaveTimer = window.setTimeout(async () => {
        const payload = captureDraftPayload();
        try {
          await saveReadingDraftRow(gateSession, queryUserId, payload.day, payload.book_id, payload.minutes, payload.journal || null);
          setDraftMsg('Draft saved.');
        } catch (_) {
          setDraftMsg('Draft saved locally (offline).');
        }
      }, 650);
    };

    const restoreDraftForCurrentSelection = async (reason) => {
      void reason;
      const { day, bookId } = getCurrentKey();

      const local = readLocalDraft(day, bookId);
      let remote = null;
      if (gateSession && queryUserId) {
        try {
          remote = await loadReadingDraftRow(gateSession, queryUserId, day, bookId);
        } catch (_) {
          remote = null;
        }
      }

      const localAt = local?.updated_at ? new Date(local.updated_at).getTime() : NaN;
      const remoteAt = remote?.updated_at ? new Date(remote.updated_at).getTime() : NaN;
      const useRemote = Number.isFinite(remoteAt) && (!Number.isFinite(localAt) || remoteAt >= localAt);
      const draft = useRemote ? remote : local;

      if (draft) {
        applyDraftToForm(draft);
        setDraftMsg('Draft restored.');
      } else {
        clearFormFields();
        setDraftMsg('');
      }
      setAiPrompts();
    };

    const onInput = () => {
      setDraftMsg('Saving…');
      writeLocalNow();
      scheduleRemoteSave();
      if (draftFlushTimer) window.clearTimeout(draftFlushTimer);
      draftFlushTimer = window.setTimeout(() => setAiPrompts(), 250);
    };

    // Bind drafts immediately (so refresh/page changes don't lose work even if auth is still loading).
    ['minutes', 'journal'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', onInput);
      el.addEventListener('change', onInput);
    });

    ['day', 'book'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        setAlert('');
        void restoreDraftForCurrentSelection('selection_change');
      });
    });

    // Restore local draft as early as possible.
    await restoreDraftForCurrentSelection('init');

    // Gate access + learn which learner we're saving for (supports admin delegation).
    const gate = await MHA_Brady.requireBrady({ nextPath: 'brady/reading.html' });
    if (!gate) return;
    gateSession = gate.session;
    queryUserId = MHA_Brady.getBradyQueryUser(gate.session, gate.context).userId;

    await MHA_Auth.initAuthUI(false);
    document.body.classList.add('has-user-nav');

    // Now that auth resolved, prefer remote drafts if they are newer than local.
    await restoreDraftForCurrentSelection('post_auth');

    const rows = await loadReadingLogs(gateSession, queryUserId);
    renderReadingLogs(rows);

    const saveBtn = document.getElementById('saveReading');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        setAlert('');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
        try {
          await saveReading(gateSession, queryUserId);
          // Clear the draft for this entry after the real save succeeds.
          const { day, bookId } = getCurrentKey();
          clearLocalDraft(day, bookId);
          try { await clearReadingDraftRow(gateSession, queryUserId, day, bookId); } catch (_) { /* ignore */ }
          setDraftMsg('');

          const nextRows = await loadReadingLogs(gateSession, queryUserId);
          renderReadingLogs(nextRows);
          setAiPrompts();
          setAlert('Saved.');
          setTimeout(() => setAlert(''), 1200);
        } catch (e) {
          setAlert(e?.message || 'Save failed.');
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save';
        }
      });
    }

  } catch (e) {
    setAlert(e?.message || 'Unable to load reading page.');
  }
}

document.addEventListener('DOMContentLoaded', main);
