function todayLocalISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const BRADY_BOOKS = [
  { id: 'richest_man_babylon', title: 'The Richest Man in Babylon' },
  { id: 'alchemist', title: 'The Alchemist (Graphic Novel)' },
  { id: 'anthem', title: 'Anthem (Ayn Rand)' },
  { id: 'nineteen_eighty_four', title: '1984 (George Orwell)' },
  { id: 'animal_farm', title: 'Animal Farm (George Orwell)' },
  { id: 'meditations', title: 'Meditations (Marcus Aurelius)' },
  { id: 'as_a_man_thinketh', title: 'As a Man Thinketh (James Allen)' },
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

function safeHtml(text) {
  return String(text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

function worksheetTemplateForBook(bookId, dayISO) {
  const title = bookTitle(bookId);

  const common = [
    'BOOK WORKSHEET (Daily)',
    `Date: ${String(dayISO || '')}`,
    `Book: ${title}`,
    '',
    'How to use this:',
    '- First: answer WITHOUT looking back (retrieval practice).',
    '- Then: open the book and add 1 correction you missed.',
    '',
    '1) Pages/Chapters read today:',
    '',
    '2) Retrieval summary (3-5 sentences, no peeking):',
    '',
    '3) 3 important ideas (bullets):',
    '-',
    '-',
    '-',
    '',
    '4) 1 question you have (confusion, prediction, or curiosity):',
    '',
    '5) 1 action you will take today because of this reading:',
    '',
    '6) Correction after you re-open the book (what did you miss at first?):',
    '',
  ];

  const byBook = {
    richest_man_babylon: [
      'BOOK-SPECIFIC FOCUS (Richest Man in Babylon)',
      '- Write the financial principle in your own words.',
      '- Give one example of how you could apply it this week.',
      '',
      'Socratic check:',
      '- What would happen if you did the opposite of the principle for 30 days?',
      '',
    ],
    alchemist: [
      'BOOK-SPECIFIC FOCUS (The Alchemist)',
      '- What is the "Personal Legend" idea from what you read today?',
      '- What "omen" or sign did you notice (literal or symbolic)?',
      '',
      'Socratic check:',
      '- What did the main character WANT? What did they NEED?',
      '',
    ],
    anthem: [
      'BOOK-SPECIFIC FOCUS (Anthem)',
      '- Where do you see conformity or fear being used to control people?',
      '- What does the story suggest about the word "I" (and why it matters)?',
      '',
      'Socratic check:',
      '- If you could ask the Council one question, what would it be and why?',
      '',
    ],
    nineteen_eighty_four: [
      'BOOK-SPECIFIC FOCUS (1984)',
      '- Describe one example of control (information, language, fear, surveillance).',
      '- What effect does that control have on a person’s choices?',
      '',
      'Socratic check:',
      '- What is the warning the book is trying to give society?',
      '',
    ],
    animal_farm: [
      'BOOK-SPECIFIC FOCUS (Animal Farm)',
      '- Identify one way language/slogans/rules are used to shape what others believe.',
      '- What does the story show about power changing people over time?',
      '',
      'Socratic check:',
      '- What is one "lesson" this farm teaches about leadership?',
      '',
    ],
    meditations: [
      'BOOK-SPECIFIC FOCUS (Meditations)',
      '- Write one idea about what you can control vs what you cannot.',
      '- Give a real example from your life today.',
      '',
      'Socratic check:',
      '- What would a calm, disciplined version of you do next?',
      '',
    ],
    as_a_man_thinketh: [
      'BOOK-SPECIFIC FOCUS (As a Man Thinketh)',
      '- What thought pattern does the author say creates a bad outcome?',
      '- What thought will you replace it with (write the replacement thought)?',
      '',
      'Socratic check:',
      '- How would your week change if you practiced that replacement thought daily?',
      '',
    ],
  };

  const extra = byBook[bookId] || [
    'BOOK-SPECIFIC FOCUS',
    '- What is one big idea from today?',
    '- How does it connect to your life?',
    '',
  ];

  return common.concat(extra).join('\n');
}

function utf8ToBase64(text) {
  const enc = new TextEncoder();
  const bytes = enc.encode(String(text || ''));
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  return { base64: btoa(binary), sizeBytes: bytes.length };
}

async function upsertWorksheetArtifact(queryUserId, dayISO, bookId, minutes, pagesRead, rememberedNotes, journal) {
  const sb = MHA_Auth.getSupabase();
  const title = bookTitle(bookId);
  const assignmentId = `reading_worksheet_${String(bookId || '')}`;
  const filename = `worksheet_${String(bookId || '')}_${String(dayISO || '')}.txt`;
  const payloadText = [
    'MHA Reading Worksheet Submission',
    `Date: ${String(dayISO || '')}`,
    `Book: ${title}`,
    `Minutes: ${minutes ?? ''}`,
    `Pages read: ${String(pagesRead || '').trim()}`,
    `What I remember: ${String(rememberedNotes || '').trim()}`,
    '',
    'Student responses:',
    '---',
    String(journal || '').trim(),
    '---',
  ].join('\n');

  const { base64, sizeBytes } = utf8ToBase64(payloadText);
  if (sizeBytes > 8_000_000) {
    throw new Error('Worksheet is too large to save (max 8 MB).');
  }

  const { data: existingRows, error: findErr } = await sb
    .from('brady_artifacts')
    .select('id,created_at')
    .eq('user_id', queryUserId)
    .eq('day', dayISO)
    .eq('practice_kind', 'reading')
    .eq('assignment_id', assignmentId)
    .eq('filename', filename)
    .order('created_at', { ascending: false })
    .limit(1);
  if (findErr) throw findErr;
  const existing = Array.isArray(existingRows) && existingRows[0] ? existingRows[0] : null;

  if (existing?.id) {
    const { error: updateErr } = await sb
      .from('brady_artifacts')
      .update({
        mime_type: 'text/plain',
        size_bytes: sizeBytes,
        content_base64: base64,
      })
      .eq('id', existing.id);
    if (updateErr) throw updateErr;

    // If the worksheet content changed, force AI to regenerate feedback next time.
    try {
      await sb.from('brady_ai_reviews').delete().eq('user_id', queryUserId).eq('artifact_id', existing.id);
    } catch (_) {
      // ignore
    }
    return { id: existing.id, reusedArtifact: true };
  }

  const { data: insertedRows, error: insErr } = await sb.from('brady_artifacts').insert({
    user_id: queryUserId,
    day: dayISO,
    practice_kind: 'reading',
    assignment_id: assignmentId,
    filename,
    mime_type: 'text/plain',
    size_bytes: sizeBytes,
    content_base64: base64,
  }).select('id');
  if (insErr) throw insErr;
  const inserted = Array.isArray(insertedRows) && insertedRows[0] ? insertedRows[0] : null;
  if (!inserted?.id) throw new Error('Unable to save worksheet artifact.');
  return { id: inserted.id, reusedArtifact: false };
}

async function reviewArtifactById(artifactId, queryUserId) {
  const token = await MHA_Auth.getAccessToken();
  const resp = await fetch('/api/brady/review-artifact', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ artifactId, queryUserId }),
  });

  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(body?.error || `AI review failed (${resp.status}).`);
    err.statusCode = resp.status;
    err.errorCode = body?.error_code || body?.errorCode || '';
    throw err;
  }
  return body || {};
}

function renderWorksheetReview(result) {
  const box = document.getElementById('worksheetReviewBox');
  const metaEl = document.getElementById('worksheetReviewMeta');
  const feedbackEl = document.getElementById('worksheetReviewFeedback');
  const stepsEl = document.getElementById('worksheetReviewNextSteps');

  const review = result?.review && typeof result.review === 'object' ? result.review : null;
  if (!box || !review) return;

  const score = (review.score_percent !== null && review.score_percent !== undefined) ? Number(review.score_percent) : null;
  const provider = String(review.provider || '');
  const model = String(review.model || '');
  const reused = result?.reused ? 'Reused cached review.' : 'Generated new review.';

  if (metaEl) {
    metaEl.textContent = `${reused} Score: ${Number.isFinite(score) ? `${score}%` : '—'}. Provider: ${provider}${model ? ` (${model})` : ''}.`;
  }
  if (feedbackEl) feedbackEl.textContent = String(review.feedback || '');

  const next = Array.isArray(review.next_steps) ? review.next_steps : [];
  if (stepsEl) {
    const safe = (s) => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    stepsEl.innerHTML = next.length
      ? `<div><span class="mono">Next steps:</span></div><ul style="padding-left:18px; margin-top:6px;">${next.slice(0, 6).map((s) => `<li>${safe(s)}</li>`).join('')}</ul>`
      : '';
  }

  box.style.display = 'block';
}

async function generateReadingQuestions(queryUserId) {
  const token = await MHA_Auth.getAccessToken();
  const day = document.getElementById('day')?.value || todayLocalISO();
  const bookId = document.getElementById('book')?.value || '';
  const pagesRead = document.getElementById('pagesRead')?.value || '';
  const rememberedNotes = document.getElementById('rememberedNotes')?.value || '';
  const journal = document.getElementById('journal')?.value || '';

  const resp = await fetch('/api/brady/reading-questions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      day,
      bookId,
      pagesRead,
      rememberedNotes,
      journal,
      queryUserId,
    }),
  });

  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(body?.error || `AI questions failed (${resp.status}).`);
    err.statusCode = resp.status;
    err.errorCode = body?.error_code || body?.errorCode || '';
    throw err;
  }
  return body || {};
}

function renderReadingQuestions(result) {
  const box = document.getElementById('readingQuestionsBox');
  const metaEl = document.getElementById('readingQuestionsMeta');
  const listEl = document.getElementById('readingQuestionsList');
  if (!box || !listEl) return;

  const questions = Array.isArray(result?.questions) ? result.questions : [];
  if (!questions.length) {
    if (metaEl) metaEl.textContent = 'No questions generated yet.';
    listEl.innerHTML = '';
    box.style.display = 'block';
    return;
  }

  const provider = String(result?.provider || 'fallback');
  const model = String(result?.model || '');
  if (metaEl) {
    metaEl.textContent = `Generated ${questions.length} questions via ${provider}${model ? ` (${model})` : ''}.`;
  }

  listEl.innerHTML = questions.slice(0, 8).map((q) => {
    const question = safeHtml(q?.question || q?.prompt || '');
    const focus = safeHtml(String(q?.focus || 'comprehension').trim());
    const why = safeHtml(q?.why || '');
    return `<li style="margin-bottom:10px;">
      <div>${question}</div>
      <div class="small" style="margin-top:4px;">Focus: <span class="mono">${focus}</span>${why ? ` — ${why}` : ''}</div>
    </li>`;
  }).join('');

  box.style.display = 'block';
}

async function signOutLocalAndRedirectToLogin(nextPath) {
  try {
    await MHA_Auth.getSupabase().auth.signOut({ scope: 'local' });
  } catch (_) {
    // ignore
  }
  window.location.href = MHA_Brady.bradyLoginUrl(nextPath);
}

async function loadReadingDraftRow(session, queryUserId, dayISO, bookId) {
  void session;
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('brady_reading_drafts')
    .select('day,book_id,minutes,pages_read,remembered_notes,journal,updated_at')
    .eq('user_id', queryUserId)
    .eq('day', dayISO)
    .eq('book_id', bookId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function saveReadingDraftRow(session, queryUserId, dayISO, bookId, minutes, pagesRead, rememberedNotes, journal) {
  void session;
  const sb = MHA_Auth.getSupabase();
  const { error } = await sb
    .from('brady_reading_drafts')
    .upsert({
      user_id: queryUserId,
      day: dayISO,
      book_id: bookId,
      minutes,
      pages_read: pagesRead,
      remembered_notes: rememberedNotes,
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
  const pagesRead = document.getElementById('pagesRead')?.value || '';
  const rememberedNotes = document.getElementById('rememberedNotes')?.value || '';
  const journal = document.getElementById('journal')?.value || '';
  const title = bookTitle(bookId);

  const chatgpt = [
    `I read "${title}" on ${day} for ${minutes || '?'} minutes.`,
    `Pages: ${pagesRead || '(not provided)'}`,
    '',
    'Ask me 6 simple comprehension questions to test understanding and the message I am gleaning.',
    'Then ask for evidence from the text for at least 2 answers.',
    'Then help me write a short workbook entry in my voice (clear and honest).',
    'Finally, give me 3 specific actions I can take today based on what I read.',
    '',
    'What I remember:',
    rememberedNotes || '(none yet)',
    '',
    'Workbook notes:',
    journal || '(none yet)',
  ].join('\n');

  const codex = [
    'Help me build a tiny local "reading tracker" script.',
    '- Input: date, book, pages_read, minutes, remembered_notes, workbook_notes',
    '- Output: weekly minutes totals, streaks, and a simple report',
    '- Save data in a local JSON file',
    '',
    `Seed today: ${day}, ${title}, pages ${pagesRead || '?'}, ${minutes || 0} minutes`,
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

  const fillWorksheetBtn = document.getElementById('fillWorksheet');
  if (fillWorksheetBtn) {
    fillWorksheetBtn.addEventListener('click', () => {
      setAlert('');
      const day = document.getElementById('day')?.value || todayLocalISO();
      const bookId = document.getElementById('book')?.value || BRADY_BOOKS[0]?.id;
      const journalEl = document.getElementById('journal');
      if (!journalEl) return;

      const current = String(journalEl.value || '').trim();
      if (current && !current.startsWith('BOOK WORKSHEET')) {
        const ok = window.confirm('Replace your current journal text with the worksheet template?');
        if (!ok) return;
      }
      journalEl.value = worksheetTemplateForBook(bookId, day);
      journalEl.dispatchEvent(new Event('input', { bubbles: true }));
      setAlert('Worksheet template loaded. Fill it out, then click "AI check my worksheet".');
      setTimeout(() => setAlert(''), 1400);
    });
  }

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
  ['day', 'book', 'minutes', 'pagesRead', 'rememberedNotes', 'journal'].forEach((id) => {
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
    .select('day,book_id,pages_read,minutes,remembered_notes,journal,created_at')
    .eq('user_id', queryUserId)
    .order('day', { ascending: false })
    .limit(60);
  if (error) throw error;
  return data || [];
}

function renderReadingLogs(rows) {
  const tbody = document.getElementById('readingRows');
  if (!tbody) return;

  const safeRows = Array.isArray(rows) ? rows : [];
  const summaryEl = document.getElementById('readingSummary');

  if (!safeRows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="small">No reading entries yet.</td></tr>';
    if (summaryEl) {
      summaryEl.textContent = 'No reading entries yet. Save one to start building a history.';
    }
    return;
  }

  const clip = (value, maxLen = 240) => {
    const s = String(value || '').trim();
    if (!s) return '';
    return s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
  };

  tbody.innerHTML = safeRows.map((r) => {
    const day = r.day || '';
    const book = bookTitle(r.book_id);
    const pages = r.pages_read || '';
    const minutes = r.minutes ?? '';
    const remembered = clip(r.remembered_notes || '', 260);
    const journal = (r.journal || '').trim();
    const workbook = clip(journal, 260);
    return `
      <tr>
        <td class="mono">${safeHtml(day)}</td>
        <td>${safeHtml(book)}</td>
        <td class="mono">${safeHtml(pages)}</td>
        <td class="mono">${safeHtml(minutes)}</td>
        <td>${safeHtml(remembered)}</td>
        <td>${safeHtml(workbook)}</td>
      </tr>
    `;
  }).join('');

  const total = safeRows.reduce((acc, r) => acc + (Number(r.minutes) || 0), 0);
  if (summaryEl) {
    summaryEl.textContent = `Showing ${safeRows.length} recent entries. Total minutes: ${total}.`;
  }
}

async function saveReading(session, queryUserId) {
  const sb = MHA_Auth.getSupabase();
  const day = document.getElementById('day')?.value || todayLocalISO();
  const bookId = document.getElementById('book')?.value;
  const minutesRaw = document.getElementById('minutes')?.value;
  const minutes = Number(minutesRaw);
  const pagesRead = String(document.getElementById('pagesRead')?.value || '').trim();
  const rememberedNotes = String(document.getElementById('rememberedNotes')?.value || '').trim();
  const journal = document.getElementById('journal')?.value || null;

  if (!bookId) throw new Error('Select a book.');
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 600) {
    throw new Error('Minutes must be a number between 0 and 600.');
  }
  if (pagesRead.length > 120) throw new Error('Pages Read is too long.');
  if (rememberedNotes.length > 4000) throw new Error('What I Remember is too long.');

  const { error } = await sb.from('brady_reading_log').upsert({
    user_id: queryUserId,
    day,
    book_id: bookId,
    minutes,
    pages_read: pagesRead || null,
    remembered_notes: rememberedNotes || null,
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
    let savePending = false;
    let saveInFlight = false;

    const runReadingSave = async () => {
      const saveBtn = document.getElementById('saveReading');
      if (saveInFlight) return;
      if (!gateSession || !queryUserId) {
        savePending = true;
        setAlert('Preparing account context. Please wait and retry.');
        return;
      }

      savePending = false;
      saveInFlight = true;
      setAlert('');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
      }

      try {
        await saveReading(gateSession, queryUserId);
        const { day, bookId } = getCurrentKey();
        clearLocalDraft(day, bookId);
        try { await clearReadingDraftRow(gateSession, queryUserId, day, bookId); } catch (_) { /* ignore */ }
        setDraftMsg('');

        const nextRows = await loadReadingLogs(gateSession, queryUserId);
        renderReadingLogs(nextRows);
        const bookName = bookTitle(bookId);
        const statusEl = document.getElementById('worksheetStatus');
        if (statusEl) statusEl.textContent = `Saved ${day} • ${bookName}`;
        setAiPrompts();
        setAlert('Saved.');
        setTimeout(() => setAlert(''), 1200);
      } catch (e) {
        setAlert(e?.message || 'Save failed.');
      } finally {
        saveInFlight = false;
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save';
        }
      }
    };

    const bindSaveControls = () => {
      const saveBtn = document.getElementById('saveReading');
      if (!saveBtn || saveBtn.dataset && saveBtn.dataset.mhaReadingSaveBound === '1') return;
      if (saveBtn) saveBtn.dataset.mhaReadingSaveBound = '1';
      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          void runReadingSave();
        });
      }
    };

    const getCurrentKey = () => {
      const day = document.getElementById('day')?.value || todayLocalISO();
      const bookId = document.getElementById('book')?.value || BRADY_BOOKS[0]?.id;
      return { day, bookId };
    };

    const applyDraftToForm = (draft) => {
      const minutesEl = document.getElementById('minutes');
      const pagesEl = document.getElementById('pagesRead');
      const rememberedEl = document.getElementById('rememberedNotes');
      const journalEl = document.getElementById('journal');
      if (minutesEl) minutesEl.value = draft?.minutes != null ? String(draft.minutes) : '';
      if (pagesEl) pagesEl.value = String(draft?.pages_read || '');
      if (rememberedEl) rememberedEl.value = String(draft?.remembered_notes || '');
      if (journalEl) journalEl.value = String(draft?.journal || '');
    };

    const clearFormFields = () => {
      const minutesEl = document.getElementById('minutes');
      const pagesEl = document.getElementById('pagesRead');
      const rememberedEl = document.getElementById('rememberedNotes');
      const journalEl = document.getElementById('journal');
      if (minutesEl) minutesEl.value = '';
      if (pagesEl) pagesEl.value = '';
      if (rememberedEl) rememberedEl.value = '';
      if (journalEl) journalEl.value = '';
    };

    const captureDraftPayload = () => {
      const { day, bookId } = getCurrentKey();
      const minutesRaw = document.getElementById('minutes')?.value;
      const pagesRead = String(document.getElementById('pagesRead')?.value || '').trim();
      const rememberedNotes = String(document.getElementById('rememberedNotes')?.value || '').trim();
      const journal = document.getElementById('journal')?.value || '';
      const minutesNum = minutesRaw === '' ? null : Number(minutesRaw);
      const minutes = Number.isFinite(minutesNum) ? Number(minutesNum) : null;
      return {
        day,
        book_id: bookId,
        minutes,
        pages_read: pagesRead || null,
        remembered_notes: rememberedNotes || null,
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
          await saveReadingDraftRow(
            gateSession,
            queryUserId,
            payload.day,
            payload.book_id,
            payload.minutes,
            payload.pages_read || null,
            payload.remembered_notes || null,
            payload.journal || null,
          );
          setDraftMsg('Draft saved.');
          const statusEl = document.getElementById('worksheetStatus');
          if (statusEl) statusEl.textContent = 'Draft saved.';
        } catch (_) {
          setDraftMsg('Draft saved locally (offline).');
          const statusEl = document.getElementById('worksheetStatus');
          if (statusEl) statusEl.textContent = 'Draft saved locally (offline).';
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

      const statusEl = document.getElementById('worksheetStatus');
      if (draft) {
        applyDraftToForm(draft);
        setDraftMsg('Draft restored.');
        if (statusEl) statusEl.textContent = 'Draft restored.';
      } else {
        clearFormFields();
        setDraftMsg('');
        if (statusEl) statusEl.textContent = '';
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
    ['minutes', 'pagesRead', 'rememberedNotes', 'journal'].forEach((id) => {
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

    // Bind save immediately so early clicks are not dropped while auth/session resolves.
    bindSaveControls();

    // Restore local draft as early as possible.
    await restoreDraftForCurrentSelection('init');

    // Gate access + learn which learner we're saving for (supports admin delegation).
    const gate = await MHA_Brady.requireBrady({ nextPath: 'brady/reading.html' });
    if (!gate) return;
    gateSession = gate.session;
    queryUserId = MHA_Brady.getBradyQueryUser(gate.session, gate.context).userId;

    if (window.MHA_BradyNav && typeof window.MHA_BradyNav.setContext === 'function') {
      window.MHA_BradyNav.setContext(gate.context);
    }

    await MHA_Auth.initAuthUI(false);
    document.body.classList.add('has-user-nav');
    bindSaveControls();

    if (savePending) {
      void runReadingSave();
    }

    // Now that auth resolved, prefer remote drafts if they are newer than local.
    await restoreDraftForCurrentSelection('post_auth');

    const flushDraft = async () => {
      try {
        const payload = writeLocalNow();
        if (!gateSession || !queryUserId) return;
        await saveReadingDraftRow(
          gateSession,
          queryUserId,
          payload.day,
          payload.book_id,
          payload.minutes,
          payload.pages_read || null,
          payload.remembered_notes || null,
          payload.journal || null,
        );
      } catch (_) {
        // best effort
      }
    };
    window.addEventListener('pagehide', () => { void flushDraft(); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flushDraft();
    });

    const rows = await loadReadingLogs(gateSession, queryUserId);
    renderReadingLogs(rows);
    const summaryEl = document.getElementById('readingSummary');
    if (summaryEl && rows && rows.length) {
      const totalMinutes = rows.reduce((acc, r) => acc + (Number(r.minutes) || 0), 0);
      summaryEl.textContent = `Showing ${rows.length} recent entries. Total minutes: ${totalMinutes}.`;
    }


    const questionsBtn = document.getElementById('generateQuestions');
    if (questionsBtn) {
      questionsBtn.addEventListener('click', async () => {
        setAlert('');
        questionsBtn.disabled = true;
        const originalText = questionsBtn.textContent;
        questionsBtn.textContent = 'Generating…';
        try {
          const out = await generateReadingQuestions(queryUserId);
          renderReadingQuestions(out);
          setAlert('Questions ready.');
          setTimeout(() => setAlert(''), 1200);
        } catch (e) {
          const status = Number(e?.statusCode || e?.status || 0);
          const code = String(e?.errorCode || e?.error_code || '');
          const msg = String(e?.message || '').toLowerCase();
          const looksLikeMissingSession = status === 401
            || code === 'session_not_found'
            || msg.includes('session_not_found')
            || msg.includes('session_id claim');
          if (looksLikeMissingSession) {
            await signOutLocalAndRedirectToLogin('brady/reading.html');
            return;
          }
          setAlert(e?.message || 'Unable to generate questions.');
        } finally {
          questionsBtn.disabled = false;
          questionsBtn.textContent = originalText || 'AI questions';
        }
      });
    }

    const aiCheckBtn = document.getElementById('aiCheckWorksheet');
    if (aiCheckBtn) {
      aiCheckBtn.addEventListener('click', async () => {
        setAlert('');
        aiCheckBtn.disabled = true;
        const originalText = aiCheckBtn.textContent;
        aiCheckBtn.textContent = 'Checking…';
        try {
          // Save the reading log first so the work is recorded even if AI is down.
          await saveReading(gateSession, queryUserId);

          const day = document.getElementById('day')?.value || todayLocalISO();
          const bookId = document.getElementById('book')?.value;
          const minutesRaw = document.getElementById('minutes')?.value;
          const minutesNum = minutesRaw === '' ? null : Number(minutesRaw);
          const minutes = Number.isFinite(minutesNum) ? Number(minutesNum) : null;
          const pagesRead = String(document.getElementById('pagesRead')?.value || '').trim();
          const rememberedNotes = String(document.getElementById('rememberedNotes')?.value || '').trim();
          const journal = document.getElementById('journal')?.value || '';

          if (!bookId) throw new Error('Select a book first.');
          if (minutes === null) throw new Error('Enter minutes before AI check.');
          if (!String(journal || '').trim()) throw new Error('Write your worksheet/journal before AI check.');

          const artifact = await upsertWorksheetArtifact(
            queryUserId,
            day,
            bookId,
            minutes,
            pagesRead,
            rememberedNotes,
            journal,
          );
          const out = await reviewArtifactById(artifact.id, queryUserId);
          renderWorksheetReview(out);
          setAlert(out?.reused ? 'AI review loaded.' : 'AI review saved.');
          setTimeout(() => setAlert(''), 1400);
        } catch (e) {
          const status = Number(e?.statusCode || e?.status || 0);
          const code = String(e?.errorCode || e?.error_code || '');
          const msg = String(e?.message || '').toLowerCase();
          const looksLikeMissingSession = status === 401
            || code === 'session_not_found'
            || msg.includes('session_not_found')
            || msg.includes('session_id claim');
          if (looksLikeMissingSession) {
            await signOutLocalAndRedirectToLogin('brady/reading.html');
            return;
          }
          setAlert(e?.message || 'AI check failed.');
        } finally {
          aiCheckBtn.disabled = false;
          aiCheckBtn.textContent = originalText || 'AI Check Worksheet';
        }
      });
    }

  } catch (e) {
    setAlert(e?.message || 'Unable to load reading page.');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  void main();
}
