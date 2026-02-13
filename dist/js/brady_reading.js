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

function bookTitle(bookId) {
  const match = BRADY_BOOKS.find((b) => b.id === bookId);
  return match ? match.title : String(bookId || '');
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

    const gate = await MHA_Brady.requireBrady({ nextPath: 'brady/reading.html' });
    if (!gate) return;
    const { userId: queryUserId } = MHA_Brady.getBradyQueryUser(gate.session, gate.context);

    await MHA_Auth.initAuthUI(false);
    document.body.classList.add('has-user-nav');

    const dayEl = document.getElementById('day');
    if (dayEl) dayEl.value = todayLocalISO();

    const bookEl = document.getElementById('book');
    if (bookEl) {
      bookEl.innerHTML = BRADY_BOOKS.map((b) => `<option value="${b.id}">${b.title}</option>`).join('');
    }

    const rows = await loadReadingLogs(gate.session, queryUserId);
    renderReadingLogs(rows);

    const saveBtn = document.getElementById('saveReading');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        setAlert('');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
        try {
          await saveReading(gate.session, queryUserId);
          const nextRows = await loadReadingLogs(gate.session, queryUserId);
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
