/* global BRADY_ASSIGNMENTS */

// Deterministic pseudo-random generator for repeatable quizzes.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pickOne(rng, arr) {
  return arr[randInt(rng, 0, arr.length - 1)];
}

function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

function reduceFrac(num, den) {
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

function makeMc(questionId, prompt, choices, correctChoice, explanation) {
  return {
    id: questionId,
    type: 'mc',
    prompt,
    choices,
    answer: correctChoice,
    explanation: explanation || '',
  };
}

function makeNumber(questionId, prompt, answer, explanation) {
  return {
    id: questionId,
    type: 'number',
    prompt,
    answer: Number(answer),
    explanation: explanation || '',
  };
}

function makeFraction(questionId, prompt, num, den, explanation) {
  const reduced = reduceFrac(num, den);
  return {
    id: questionId,
    type: 'fraction',
    prompt,
    answer: { num: reduced.num, den: reduced.den },
    explanation: explanation || '',
  };
}

function makeSetNumbers(questionId, prompt, numbers, explanation) {
  const unique = Array.from(new Set((numbers || []).map((n) => Number(n)).filter((n) => Number.isFinite(n)))).sort((a, b) => a - b);
  return {
    id: questionId,
    type: 'set_numbers',
    prompt,
    answer: unique,
    explanation: explanation || '',
  };
}

function makeExpandedSum(questionId, prompt, answerNumber, explanation) {
  return {
    id: questionId,
    type: 'expanded_sum',
    prompt,
    answer: Number(answerNumber),
    explanation: explanation || '',
  };
}

// ---------------------------------------------------------------------------
// Quiz generators
// ---------------------------------------------------------------------------

function quiz_math_fractions_number_line(seed) {
  const rng = mulberry32(seed);
  const questions = [];

  for (let i = 1; i <= 10; i++) {
    const den = randInt(rng, 3, 12);
    const num = randInt(rng, 1, den - 1);
    const qid = `q${i}`;
    const prompt = `On a number line from 0 to 1, split into ${den} equal parts. Which tick number (0 to ${den}) is ${num}/${den}?`;
    questions.push(makeNumber(qid, prompt, num, `If you split into ${den} equal parts, the ticks are 0/${den}, 1/${den}, 2/${den} ... so ${num}/${den} is tick ${num}.`));
  }

  return {
    passPercent: 80,
    title: 'Fractions on a Number Line',
    questions,
  };
}

function quiz_math_equivalent_fractions(seed) {
  const rng = mulberry32(seed);
  const questions = [];

  for (let i = 1; i <= 6; i++) {
    const baseDen = randInt(rng, 2, 12);
    const baseNum = randInt(rng, 1, baseDen - 1);
    const k = randInt(rng, 2, 6);
    const n2 = baseNum * k;
    const d2 = baseDen * k;
    const reduced = reduceFrac(n2, d2);
    questions.push(makeFraction(`q${i}`, `Simplify the fraction ${n2}/${d2} to simplest form (type like 3/4).`, reduced.num, reduced.den, `Divide numerator and denominator by their greatest common factor.`));
  }

  for (let i = 7; i <= 10; i++) {
    const den = randInt(rng, 2, 12);
    const num = randInt(rng, 1, den - 1);
    const k = randInt(rng, 2, 6);
    const a = { num, den };
    const b = rng() < 0.6 ? { num: num * k, den: den * k } : { num: num * k + 1, den: den * k }; // often non-equivalent
    const equivalent = a.num * b.den === b.num * a.den;
    const choices = ['Equivalent', 'Not equivalent'];
    questions.push(makeMc(`q${i}`, `Are ${a.num}/${a.den} and ${b.num}/${b.den} equivalent?`, choices, equivalent ? 'Equivalent' : 'Not equivalent', `Two fractions are equivalent if cross-products match: a*d == b*c.`));
  }

  return { passPercent: 80, title: 'Equivalent Fractions', questions };
}

function quiz_math_place_value_expanded_form(seed) {
  const rng = mulberry32(seed);
  const questions = [];

  for (let i = 1; i <= 4; i++) {
    const n = randInt(rng, 120000, 999999);
    const digits = String(n).split('').map((d) => Number(d));
    const pos = randInt(rng, 0, digits.length - 1);
    const placeValues = [100000, 10000, 1000, 100, 10, 1];
    const value = digits[pos] * placeValues[pos];
    questions.push(makeNumber(`q${i}`, `In the number ${n}, what is the value of the digit ${digits[pos]} in position ${pos + 1} from the left? (Type the value as a number.)`, value, `Multiply the digit by its place value (hundred-thousands, ten-thousands, etc.).`));
  }

  for (let i = 5; i <= 8; i++) {
    const a = randInt(rng, 10000, 999999);
    const b = randInt(rng, 10000, 999999);
    const correct = a > b ? '>' : (a < b ? '<' : '=');
    questions.push(makeMc(`q${i}`, `Compare: ${a} __ ${b} (choose the correct symbol).`, ['<', '>', '='], correct, `Compare digits from left to right until one differs.`));
  }

  for (let i = 9; i <= 10; i++) {
    const n = randInt(rng, 10000, 999999);
    const digits = String(n).split('').map((d) => Number(d));
    const placeValues = [100000, 10000, 1000, 100, 10, 1];
    const parts = digits.map((d, idx) => d * placeValues[idx]).filter((v) => v !== 0);
    const prompt = `Type an expanded form (sum) that equals ${n}. Example format: 500000 + 7000 + 400 + 30 + 2`;
    questions.push(makeExpandedSum(`q${i}`, prompt, n, `One correct answer is: ${parts.join(' + ')}`));
  }

  return { passPercent: 80, title: 'Place Value + Expanded Form', questions };
}

function factorsOf(n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    if (n % i === 0) out.push(i);
  }
  return out;
}

function isPrime(n) {
  if (n <= 1) return false;
  if (n <= 3) return true;
  if (n % 2 === 0 || n % 3 === 0) return false;
  for (let i = 5; i * i <= n; i += 6) {
    if (n % i === 0 || n % (i + 2) === 0) return false;
  }
  return true;
}

function quiz_math_factors_primes_multiples(seed) {
  const rng = mulberry32(seed);
  const questions = [];

  for (let i = 1; i <= 5; i++) {
    const n = randInt(rng, 12, 60);
    questions.push(makeSetNumbers(`q${i}`, `List ALL factors of ${n}. Type numbers separated by commas (example: 1,2,3,6).`, factorsOf(n), `Factors divide the number evenly (remainder 0).`));
  }

  for (let i = 6; i <= 8; i++) {
    const n = randInt(rng, 2, 97);
    const correct = isPrime(n) ? 'Prime' : 'Composite';
    questions.push(makeMc(`q${i}`, `Is ${n} prime or composite?`, ['Prime', 'Composite'], correct, `Prime has exactly 2 factors: 1 and itself.`));
  }

  for (let i = 9; i <= 10; i++) {
    const base = randInt(rng, 12, 96);
    const d = pickOne(rng, [2, 3, 4, 5, 6, 8, 9]);
    const n = rng() < 0.6 ? base - (base % d) : base - (base % d) + 1;
    const correct = (n % d === 0) ? 'Yes' : 'No';
    questions.push(makeMc(`q${i}`, `Is ${n} a multiple of ${d}?`, ['Yes', 'No'], correct, `A multiple of ${d} has remainder 0 when divided by ${d}.`));
  }

  return { passPercent: 80, title: 'Factors + Prime vs Composite + Multiples', questions };
}

function evalOrderOfOps(expr) {
  // We only generate safe numeric expressions (no user-supplied eval).
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${expr});`)();
}

function quiz_math_order_of_operations_exponents(seed) {
  const rng = mulberry32(seed);
  const questions = [];
  const ops = [' + ', ' - ', ' * '];

  for (let i = 1; i <= 10; i++) {
    const a = randInt(rng, 2, 12);
    const b = randInt(rng, 2, 12);
    const c = randInt(rng, 2, 12);
    const d = randInt(rng, 1, 4);
    const hasExp = rng() < 0.5;
    const op1 = pickOne(rng, ops);
    const op2 = pickOne(rng, ops);
    const left = hasExp ? `(${a} ** ${d})` : `${a}`;
    const expr = `(${left}${op1}${b})${op2}${c}`;
    const ans = evalOrderOfOps(expr);
    questions.push(makeNumber(`q${i}`, `Compute: ${expr.replaceAll('**', '^')}`, ans, `Follow parentheses first, then exponents, then multiply/divide, then add/subtract.`));
  }

  return { passPercent: 80, title: 'Order of Operations', questions };
}

function quiz_math_translate_and_parts_of_expression(seed) {
  const rng = mulberry32(seed);
  const questions = [];

  const translationItems = [
    { prompt: '“3 more than 2x”', choices: ['2x + 3', '3x + 2', '2(x + 3)', 'x/2 + 3'], answer: '2x + 3' },
    { prompt: '“5 less than x”', choices: ['x - 5', '5 - x', 'x + 5', '5x'], answer: 'x - 5' },
    { prompt: '“Half of (x + 8)”', choices: ['(x + 8)/2', 'x/2 + 8', '2(x + 8)', '(x + 8) - 2'], answer: '(x + 8)/2' },
    { prompt: '“The product of 7 and (x - 1)”', choices: ['7(x - 1)', '7x - 1', 'x(7 - 1)', '7 + (x - 1)'], answer: '7(x - 1)' },
  ];

  const picked = shuffle(rng, translationItems).slice(0, 6);
  picked.forEach((it, idx) => {
    questions.push(makeMc(`q${idx + 1}`, `Translate to an algebraic expression: ${it.prompt}`, it.choices, it.answer, `Look for keywords: “more than” means +, “less than” means -, “product” means multiply.`));
  });

  const partsItems = [
    { expr: '5x + 3', correct: '5', question: 'What is the coefficient of x?' },
    { expr: '7x - 12', correct: '7', question: 'What is the coefficient of x?' },
    { expr: '2x + 9 + 4x', correct: '3', question: 'How many terms are in the expression (after simplifying)?' },
    { expr: '8 + 6x - x', correct: '5', question: 'What is the coefficient of x after simplifying?' },
  ];
  const pickedParts = shuffle(rng, partsItems).slice(0, 4);
  pickedParts.forEach((it, i) => {
    questions.push(makeNumber(`q${7 + i}`, `${it.expr}: ${it.question}`, Number(it.correct), `Coefficient is the number multiplying x.`));
  });

  return { passPercent: 80, title: 'Translate + Parts of an Expression', questions };
}

function quiz_math_evaluate_expressions_and_combine_like_terms(seed) {
  const rng = mulberry32(seed);
  const questions = [];

  // Combine like terms by asking for x-coefficient and constant term.
  for (let i = 1; i <= 5; i++) {
    const a = randInt(rng, 1, 9);
    const b = randInt(rng, 1, 9);
    const c = randInt(rng, -9, 9);
    const d = randInt(rng, -9, 9);
    const coef = a + b;
    const constant = c + d;
    const expr = `${a}x + ${b}x ${c >= 0 ? '+ ' + c : '- ' + Math.abs(c)} ${d >= 0 ? '+ ' + d : '- ' + Math.abs(d)}`;
    questions.push(makeNumber(`q${i}`, `Simplify: ${expr}. What is the coefficient of x in the simplified expression?`, coef, `Combine x terms: ${a}x + ${b}x = ${coef}x.`));
    questions.push(makeNumber(`q${i}_b`, `Same expression: What is the constant term in the simplified expression?`, constant, `Combine constants: ${c} + ${d} = ${constant}.`));
  }

  // Evaluate expressions.
  for (let i = 1; i <= 5; i++) {
    const m = randInt(rng, -6, 6) || 2;
    const b = randInt(rng, -10, 10);
    const x = randInt(rng, -5, 5);
    const ans = m * x + b;
    questions.push(makeNumber(`eval${i}`, `Evaluate: ${m}x ${b >= 0 ? '+ ' + b : '- ' + Math.abs(b)} when x = ${x}.`, ans, `Substitute x=${x} then compute.`));
  }

  return { passPercent: 80, title: 'Evaluate + Combine Like Terms', questions: questions.slice(0, 10) };
}

function quiz_math_one_step_two_step_equations(seed) {
  const rng = mulberry32(seed);
  const questions = [];

  // One-step: x + a = b
  for (let i = 1; i <= 4; i++) {
    const x = randInt(rng, -10, 10);
    const a = randInt(rng, -12, 12);
    const b = x + a;
    questions.push(makeNumber(`q${i}`, `Solve for x: x ${a >= 0 ? '+ ' + a : '- ' + Math.abs(a)} = ${b}`, x, `Undo ${a >= 0 ? 'adding' : 'subtracting'} ${Math.abs(a)}.`));
  }

  // One-step: ax = b
  for (let i = 5; i <= 7; i++) {
    const a = pickOne(rng, [2, 3, 4, 5, 6, 7, 8, 9]);
    const x = randInt(rng, -10, 10);
    const b = a * x;
    questions.push(makeNumber(`q${i}`, `Solve for x: ${a}x = ${b}`, x, `Divide both sides by ${a}.`));
  }

  // Two-step: px + q = r
  for (let i = 8; i <= 10; i++) {
    const p = pickOne(rng, [2, 3, 4, 5, 6, 7, 8]);
    const x = randInt(rng, -10, 10);
    const q = randInt(rng, -12, 12);
    const r = p * x + q;
    questions.push(makeNumber(`q${i}`, `Solve for x: ${p}x ${q >= 0 ? '+ ' + q : '- ' + Math.abs(q)} = ${r}`, x, `Undo +/-, then divide by ${p}.`));
  }

  return { passPercent: 80, title: 'One-Step + Two-Step Equations', questions };
}

function quiz_math_proportions_and_slope(seed) {
  const rng = mulberry32(seed);
  const questions = [];

  for (let i = 1; i <= 5; i++) {
    const m = pickOne(rng, [1, 2, 3, 4, 5, 6, 0.5, 1.5, 2.5]);
    const x1 = randInt(rng, 1, 6);
    const x2 = x1 + randInt(rng, 1, 4);
    const y1 = m * x1;
    const y2 = m * x2;
    questions.push(makeNumber(`q${i}`, `A proportional relationship has points (${x1}, ${y1}) and (${x2}, ${y2}). What is the unit rate (slope) m in y = mx?`, m, `For proportional relationships through 0, m = y/x.`));
  }

  for (let i = 6; i <= 10; i++) {
    const m = pickOne(rng, [1, 2, 3, 4, 5, 0.5, 1.5, 2.5]);
    const x = randInt(rng, 2, 10);
    const y = m * x;
    questions.push(makeNumber(`q${i}`, `For y = ${m}x, what is y when x = ${x}?`, y, `Multiply x by m.`));
  }

  return { passPercent: 80, title: 'Proportions + Slope', questions };
}

function quiz_math_solutions_of_linear_equations(seed) {
  const rng = mulberry32(seed);
  const questions = [];

  // Classification: one / none / infinite.
  const templates = [
    { kind: 'one', make: () => {
      const a = pickOne(rng, [2, 3, 4, 5]);
      const x = randInt(rng, -10, 10);
      const b = a * x;
      return { eq: `${a}x = ${b}`, kind: 'One solution', x };
    }},
    { kind: 'none', make: () => {
      const a = pickOne(rng, [2, 3, 4, 5]);
      const b = randInt(rng, 1, 10);
      const c = b + randInt(rng, 1, 6);
      return { eq: `${a}x + ${b} = ${a}x + ${c}`, kind: 'No solution', x: null };
    }},
    { kind: 'inf', make: () => {
      const a = pickOne(rng, [2, 3, 4, 5]);
      const b = randInt(rng, 1, 10);
      return { eq: `${a}x + ${b} = ${a}x + ${b}`, kind: 'Infinitely many', x: null };
    }},
  ];

  for (let i = 1; i <= 6; i++) {
    const t = pickOne(rng, templates).make();
    const choices = ['One solution', 'No solution', 'Infinitely many'];
    questions.push(makeMc(`q${i}`, `Classify: ${t.eq}`, choices, t.kind, `Simplify both sides. If you get x=a -> one solution. If you get a=b (a≠b) -> none. If you get a=a -> infinitely many.`));
  }

  // Solve multi-step linear equation.
  for (let i = 7; i <= 10; i++) {
    const x = randInt(rng, -10, 10);
    const a = pickOne(rng, [2, 3, 4, 5, 6]);
    const b = randInt(rng, -10, 10);
    const c = a * x + b;
    questions.push(makeNumber(`q${i}`, `Solve: ${a}x ${b >= 0 ? '+ ' + b : '- ' + Math.abs(b)} = ${c}`, x, `Undo +/-, then divide by ${a}.`));
  }

  return { passPercent: 80, title: 'Solutions of Linear Equations', questions };
}

// Reading/language: we use authored mini-passages to allow automatic grading.
const PASSAGES = {
  pov_1: {
    text: [
      'I pushed the old gate open and stepped into the empty gym.',
      'The lights were off, but the scoreboard still blinked 00:00.',
      'I could hear my own footsteps and the nervous tapping of my pencil.',
      'I told myself, “Start with the easy problems. Don’t rush.”',
    ].join(' '),
    pov: 'First person',
    structure: 'A short scene',
  },
  pov_2: {
    text: [
      'Marcus opened the notebook and counted the lines on the page.',
      'He checked the directions twice before writing anything down.',
      'When the timer beeped, he stayed calm and moved to the next question.',
    ].join(' '),
    pov: 'Third person',
    structure: 'A short scene',
  },
};

function quiz_reading_literary_structure_pov(seed) {
  const rng = mulberry32(seed);
  const passage = pickOne(rng, Object.values(PASSAGES));
  const questions = [];

  questions.push(makeMc('q1', `Read this passage:\n\n"${passage.text}"\n\nWhat point of view is it written in?`, ['First person', 'Third person'], passage.pov, 'First person uses I/me/my. Third person uses he/she/they.'));

  questions.push(makeMc('q2', 'Which word is a strong clue for first-person point of view?', ['I', 'he', 'Marcus', 'they'], passage.pov === 'First person' ? 'I' : 'he', 'Pronouns are strong clues: I/me/my = first person, he/she/they = third person.'));

  questions.push(makeMc('q3', 'What is the best description of the structure?', ['A short scene', 'A poem with stanzas', 'A compare/contrast article', 'A list of steps'], 'A short scene', 'This passage reads like a short scene (events happening in time).'));

  questions.push(makeMc('q4', 'Which sentence best shows the character’s feelings or thoughts?', [
    'The lights were off, but the scoreboard still blinked 00:00.',
    'I told myself, “Start with the easy problems. Don’t rush.”',
    'Marcus opened the notebook and counted the lines on the page.',
    'He checked the directions twice before writing anything down.',
  ], passage.pov === 'First person'
    ? 'I told myself, “Start with the easy problems. Don’t rush.”'
    : 'He checked the directions twice before writing anything down.',
  'Look for thoughts (inner talk) or nervous/calm behavior.'));

  // Theme-like: choose best summary
  questions.push(makeMc('q5', 'Which is the most objective summary?', [
    'The character is awesome and will definitely win.',
    'The character enters a quiet place and prepares to work carefully.',
    'This is boring and nothing happens.',
    'The author is trying to trick us.',
  ], 'The character enters a quiet place and prepares to work carefully.', 'Objective summaries state what happens without opinions.'));

  return { passPercent: 80, title: 'Literary Structure + Point of View', questions };
}

function quiz_reading_theme_and_summary(seed) {
  const rng = mulberry32(seed);
  const questions = [];

  // Topic vs theme
  questions.push(makeMc('q1', 'Which one is a THEME (a lesson/message), not just a topic?', [
    'Friendship',
    'Hard work can build confidence over time.',
    'A boy and his dog',
    'Basketball practice',
  ], 'Hard work can build confidence over time.', 'A theme is a message/lesson, usually a full sentence.'));

  questions.push(makeMc('q2', 'Which summary is MOST objective?', [
    'The author is wrong and the story is dumb.',
    'The text explains a main idea and supports it with details.',
    'This is the best story ever written.',
    'I feel sad reading this.',
  ], 'The text explains a main idea and supports it with details.', 'Objective = no opinions, just facts.'));

  // Evidence support
  const detailSets = [
    { main: 'Plants need sunlight to grow.', supports: ['The text says leaves absorb light.', 'The text describes growth slowing in darkness.'], not: ['The author likes plants.'] },
    { main: 'Practice improves skill.', supports: ['He made fewer mistakes after training.', 'She learned a faster strategy over time.'], not: ['Practice is fun.'] },
  ];
  const ds = pickOne(rng, detailSets);
  const choices = shuffle(rng, ds.supports.concat(ds.not));
  questions.push(makeMc('q3', `Which detail best supports the main idea: "${ds.main}"`, choices, ds.supports[0], 'Supporting details are facts/examples that prove the main idea.'));

  questions.push(makeMc('q4', 'Which of these is a topic sentence (main idea of a paragraph)?', [
    'For example, the temperature dropped 5 degrees.',
    'In conclusion, everyone agreed.',
    'The paragraph explains why teamwork matters during hard tasks.',
    'However, this happened yesterday.',
  ], 'The paragraph explains why teamwork matters during hard tasks.', 'A main idea sentence states what the paragraph is about.'));

  questions.push(makeMc('q5', 'Which statement is an opinion?', [
    'The character walked home after school.',
    'The article lists three reasons.',
    'The best solution is obvious.',
    'The passage includes a quotation.',
  ], 'The best solution is obvious.', 'Opinions use judgment words like best/worst/obvious.'));

  return { passPercent: 80, title: 'Theme + Objective Summary', questions };
}

function quiz_reading_informational_text_claims_structure(seed) {
  const rng = mulberry32(seed);
  const questions = [];

  const passage = [
    'School should start later in the morning.',
    'When students sleep more, they pay attention longer and make fewer mistakes.',
    'A district that moved start time by 45 minutes reported higher attendance.',
    'Because of these benefits, a later start time is a practical change.',
  ].join(' ');

  questions.push(makeMc('q1', `Read this passage:\n\n"${passage}"\n\nWhat is the main claim?`, [
    'Students should sleep less.',
    'School should start later in the morning.',
    'Attendance never matters.',
    'Mistakes are helpful.',
  ], 'School should start later in the morning.', 'A claim is what the author wants you to believe/do.'));

  questions.push(makeMc('q2', 'Which sentence is evidence (a supporting fact/example)?', [
    'School should start later in the morning.',
    'Because of these benefits, a later start time is a practical change.',
    'A district that moved start time by 45 minutes reported higher attendance.',
    'Later starts feel nicer.',
  ], 'A district that moved start time by 45 minutes reported higher attendance.', 'Evidence is a fact/example that supports the claim.'));

  questions.push(makeMc('q3', 'What is the author’s purpose?', [
    'To entertain with a joke',
    'To persuade the reader to support later start times',
    'To describe a fantasy world',
    'To list random facts',
  ], 'To persuade the reader to support later start times', 'Purpose = what the author is trying to do.'));

  questions.push(makeMc('q4', 'What structure best fits this passage?', [
    'Problem/Solution',
    'Chronological order',
    'Compare/Contrast',
    'Poem',
  ], 'Problem/Solution', 'It presents a change (solution) and reasons/benefits for it.'));

  questions.push(makeMc('q5', 'Which is the best example of relevant evidence?', [
    '“I like mornings.”',
    'A study shows sleep affects attention.',
    'The author uses strong adjectives.',
    'The passage has four sentences.',
  ], 'A study shows sleep affects attention.', 'Relevant evidence directly supports the claim.'));

  return { passPercent: 80, title: 'Informational Text: Claims + Evidence + Structure', questions };
}

function quiz_reading_vocabulary_context_roots(seed) {
  const rng = mulberry32(seed);
  const questions = [];

  const items = [
    {
      sentence: 'After the long run, he was exhausted, so he sat down to rest.',
      word: 'exhausted',
      choices: ['very tired', 'very excited', 'confused', 'hungry'],
      answer: 'very tired',
    },
    {
      sentence: 'The hallway was silent; even footsteps sounded like thunder.',
      word: 'silent',
      choices: ['noisy', 'quiet', 'bright', 'crowded'],
      answer: 'quiet',
    },
    {
      sentence: 'Her smile was a lighthouse in the storm, guiding everyone forward.',
      word: 'lighthouse',
      choices: ['a real building on the ocean', 'figurative language meaning her smile gave hope', 'a loud noise', 'a math tool'],
      answer: 'figurative language meaning her smile gave hope',
    },
  ];

  const picked = shuffle(rng, items).slice(0, 3);
  picked.forEach((it, idx) => {
    questions.push(makeMc(`q${idx + 1}`, `In the sentence: "${it.sentence}"\n\nWhat does "${it.word}" mean here?`, it.choices, it.answer, 'Use context clues (the rest of the sentence) to decide.'));
  });

  questions.push(makeMc('q4', 'Which strategy is best to confirm a word meaning after you guess from context?', [
    'Ignore it',
    'Look it up in a dictionary/glossary',
    'Change the word',
    'Skip the sentence',
  ], 'Look it up in a dictionary/glossary', 'Context helps you guess; references confirm.'));

  questions.push(makeMc('q5', 'Which sentence uses figurative language?', [
    'The backpack is on the chair.',
    'Time crawled as the test continued.',
    'She wrote her name at the top.',
    'The clock is digital.',
  ], 'Time crawled as the test continued.', 'Figurative language compares or exaggerates for effect.'));

  return { passPercent: 80, title: 'Vocabulary + Context + Figurative Language', questions };
}

function quiz_language_pronouns_possessives(seed) {
  const rng = mulberry32(seed);
  const questions = [];

  questions.push(makeMc('q1', 'Choose the correct sentence:', [
    'Someone left their book on the desk.',
    'Someone left there book on the desk.',
    'Someone left they book on the desk.',
    'Someone left books on the desk.',
  ], 'Someone left their book on the desk.', 'Indefinite pronouns like "someone" use correct possessive forms.'));

  questions.push(makeMc('q2', 'Choose the correct singular possessive:', [
    'the boys hat',
    "the boy's hat",
    "the boys' hat",
    'the boy hat',
  ], "the boy's hat", 'Singular possessive: add apostrophe + s.'));

  questions.push(makeMc('q3', 'Which sentence uses an indefinite pronoun correctly?', [
    'Anybody are welcome.',
    'Anybody is welcome.',
    'Anybodys welcome.',
    'Anybody were welcome.',
  ], 'Anybody is welcome.', 'Anybody/anyone/someone is singular here.'));

  questions.push(makeMc('q4', 'Fix the error: "Each of the players forgot there water." Choose the best correction:', [
    'Each of the players forgot their water.',
    'Each of the players forgot there water.',
    'Each of the players forgot they water.',
    'Each of the players forgot the water.',
  ], 'Each of the players forgot their water.', '"There" is a place. "Their" shows ownership.'));

  questions.push(makeMc('q5', 'Choose the correct possessive:', [
    "the dog's leash",
    "the dogs leash",
    "the dogs' leash",
    "the dog's' leash",
  ], "the dog's leash", 'Singular noun dog -> dog’s.'));

  return { passPercent: 80, title: 'Pronouns + Possessives', questions };
}

function quiz_language_sentence_combining_verb_tense(seed) {
  const rng = mulberry32(seed);
  const questions = [];

  questions.push(makeMc('q1', 'Combine these two sentences best:\n"I finished my work. I checked it twice."', [
    'I finished my work and checked it twice.',
    'I finished my work. I checked it twice.',
    'I finished my work because twice.',
    'Checked it twice and finished my work.',
  ], 'I finished my work and checked it twice.', 'Use a conjunction to combine without changing meaning.'));

  questions.push(makeMc('q2', 'Which sentence uses irregular past tense correctly?', [
    'He goed to the store.',
    'He went to the store.',
    'He goeded to the store.',
    'He go to the store yesterday.',
  ], 'He went to the store.', 'Irregular past tense of "go" is "went".'));

  questions.push(makeMc('q3', 'Combine for conciseness:\n"The test was hard. The test was long."', [
    'The test was hard and long.',
    'The test was hard. The test was long.',
    'Hard long test was.',
    'The test was and long hard.',
  ], 'The test was hard and long.', 'Remove repeated words and keep meaning.'));

  questions.push(makeMc('q4', 'Choose the correct past tense:', [
    'She run yesterday.',
    'She ran yesterday.',
    'She ranned yesterday.',
    'She running yesterday.',
  ], 'She ran yesterday.', 'Past tense of run is ran.'));

  questions.push(makeMc('q5', 'Which is the best combined sentence?\n"Marcus read the directions. Marcus followed them."', [
    'Marcus read the directions and followed them.',
    'Marcus read the directions. Marcus followed them.',
    'Marcus read the directions because followed them.',
    'Marcus read directions then Marcus then followed.',
  ], 'Marcus read the directions and followed them.', 'Combine and remove repetition.'));

  return { passPercent: 80, title: 'Sentence Combining + Verb Tense', questions };
}

function quiz_language_commas_transitions_formal_tone(seed) {
  const rng = mulberry32(seed);
  const questions = [];

  questions.push(makeMc('q1', 'Choose the sentence with correct commas in a series:', [
    'I bought apples oranges and bananas.',
    'I bought apples, oranges, and bananas.',
    'I bought, apples oranges and bananas.',
    'I bought apples oranges, and bananas.',
  ], 'I bought apples, oranges, and bananas.', 'Use commas to separate items in a list.'));

  questions.push(makeMc('q2', 'Which transition best shows an example?', [
    'However',
    'For example',
    'Therefore',
    'Meanwhile',
  ], 'For example', 'For example introduces an example.'));

  questions.push(makeMc('q3', 'Which sentence is more formal/objective?', [
    'This proves the author is totally right.',
    'This evidence supports the author’s claim.',
    'This is super obvious.',
    'I love this argument!',
  ], 'This evidence supports the author’s claim.', 'Formal/objective avoids emotional/judgment words.'));

  questions.push(makeMc('q4', 'Where should the comma go? "After the test we went home."', [
    'After, the test we went home.',
    'After the test, we went home.',
    'After the, test we went home.',
    'No comma needed.',
  ], 'After the test, we went home.', 'Introductory phrase -> comma after it.'));

  questions.push(makeMc('q5', 'Choose the best transition showing contrast:', [
    'Similarly',
    'However',
    'For instance',
    'As a result',
  ], 'However', 'However signals contrast.'));

  return { passPercent: 80, title: 'Commas + Transitions + Formal Tone', questions };
}

const QUIZ_BUILDERS = {
  math_fractions_number_line: quiz_math_fractions_number_line,
  math_equivalent_fractions: quiz_math_equivalent_fractions,
  math_place_value_expanded_form: quiz_math_place_value_expanded_form,
  math_factors_primes_multiples: quiz_math_factors_primes_multiples,
  math_order_of_operations_exponents: quiz_math_order_of_operations_exponents,
  math_translate_and_parts_of_expression: quiz_math_translate_and_parts_of_expression,
  math_evaluate_expressions_and_combine_like_terms: quiz_math_evaluate_expressions_and_combine_like_terms,
  math_one_step_two_step_equations: quiz_math_one_step_two_step_equations,
  math_proportions_and_slope: quiz_math_proportions_and_slope,
  math_solutions_of_linear_equations: quiz_math_solutions_of_linear_equations,
  reading_literary_structure_pov: quiz_reading_literary_structure_pov,
  reading_theme_and_summary: quiz_reading_theme_and_summary,
  reading_informational_text_claims_structure: quiz_reading_informational_text_claims_structure,
  reading_vocabulary_context_roots: quiz_reading_vocabulary_context_roots,
  language_pronouns_possessives: quiz_language_pronouns_possessives,
  language_sentence_combining_verb_tense: quiz_language_sentence_combining_verb_tense,
  language_commas_transitions_formal_tone: quiz_language_commas_transitions_formal_tone,
};

function buildQuiz(assignment, seed) {
  const quizId = assignment?.quizId;
  const builder = QUIZ_BUILDERS[quizId];
  if (!builder) {
    return { passPercent: assignment?.passPercent || 80, title: assignment?.title || 'Assignment', questions: [] };
  }
  const quiz = builder(seed);
  // Allow assignment to override pass percent.
  quiz.passPercent = Number(assignment?.passPercent || quiz.passPercent || 80);
  return quiz;
}

window.BRADY_QUIZ = {
  buildQuiz,
  mulberry32,
};

