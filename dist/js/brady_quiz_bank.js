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

function normalizeTags(tags) {
  return Array.from(new Set((tags || []).map((t) => String(t || '').trim()).filter(Boolean)));
}

function makeMc(questionId, prompt, choices, correctChoice, explanation, tags, meta) {
  return {
    id: questionId,
    type: 'mc',
    prompt,
    choices,
    answer: correctChoice,
    explanation: explanation || '',
    tags: normalizeTags(tags),
    meta: meta || {},
  };
}

function makeNumber(questionId, prompt, answer, explanation, tags, meta) {
  return {
    id: questionId,
    type: 'number',
    prompt,
    answer: Number(answer),
    explanation: explanation || '',
    tags: normalizeTags(tags),
    meta: meta || {},
  };
}

function makeFraction(questionId, prompt, num, den, explanation, tags, meta) {
  const reduced = reduceFrac(num, den);
  return {
    id: questionId,
    type: 'fraction',
    prompt,
    answer: { num: reduced.num, den: reduced.den },
    explanation: explanation || '',
    tags: normalizeTags(tags),
    meta: meta || {},
  };
}

function makeSetNumbers(questionId, prompt, numbers, explanation, tags, meta) {
  const unique = Array.from(new Set((numbers || []).map((n) => Number(n)).filter((n) => Number.isFinite(n)))).sort((a, b) => a - b);
  return {
    id: questionId,
    type: 'set_numbers',
    prompt,
    answer: unique,
    explanation: explanation || '',
    tags: normalizeTags(tags),
    meta: meta || {},
  };
}

function makeExpandedSum(questionId, prompt, answerNumber, explanation, tags, meta) {
  return {
    id: questionId,
    type: 'expanded_sum',
    prompt,
    answer: Number(answerNumber),
    explanation: explanation || '',
    tags: normalizeTags(tags),
    meta: meta || {},
  };
}

function difficultyForIndex(idx, total) {
  const t = Math.max(1, Math.floor(Number(total) || 1));
  const pos = Math.min(t, Math.max(1, Math.floor(Number(idx) || 0) + 1));
  const level = Math.ceil((pos / t) * 5);
  return Math.max(1, Math.min(5, level));
}

function withDifficulty(meta, difficulty) {
  const base = meta && typeof meta === 'object' ? meta : {};
  return { ...base, difficulty: Number(difficulty) || 1 };
}

// ---------------------------------------------------------------------------
// Quiz generators
// ---------------------------------------------------------------------------

function quiz_math_fractions_number_line(seed, options) {
  const rng = mulberry32(seed);
  const questions = [];

  const focus = options?.focusTags || {};
  const missTick = Number(focus.tick_from_fraction || 0);
  const missReverse = Number(focus.fraction_from_tick || 0);
  const reverseCount = missReverse > missTick ? 5 : 3;
  const tickCount = 10 - reverseCount;

  const denRangeForDifficulty = (difficulty) => {
    const d = Number(difficulty);
    if (d <= 1) return [2, 6];
    if (d === 2) return [3, 8];
    if (d === 3) return [4, 10];
    if (d === 4) return [6, 12];
    return [8, 12];
  };

  for (let i = 0; i < tickCount; i++) {
    const qIndex = i;
    const difficulty = difficultyForIndex(qIndex, 10);
    const [denMin, denMax] = denRangeForDifficulty(difficulty);
    const den = randInt(rng, denMin, denMax);

    let num = 1;
    for (let t = 0; t < 25; t++) {
      let candidate = 1;
      if (difficulty <= 1) candidate = 1;
      else if (difficulty === 2) candidate = randInt(rng, 1, Math.min(2, den - 1));
      else if (difficulty === 3) candidate = randInt(rng, 1, den - 1);
      else if (difficulty === 4) candidate = (den >= 5) ? randInt(rng, 2, den - 2) : 1;
      else candidate = (den >= 7) ? randInt(rng, 3, den - 3) : randInt(rng, 2, den - 2);

      if (candidate > 0 && candidate < den && gcd(candidate, den) === 1) {
        num = candidate;
        break;
      }
    }

    const qid = `q${i + 1}`;
    const prompt = `On a number line from 0 to 1, split into ${den} equal parts. Which tick number (0 to ${den}) is ${num}/${den}?`;
    questions.push(
      makeNumber(
        qid,
        prompt,
        num,
        `If you split into ${den} equal parts, the ticks are 0/${den}, 1/${den}, 2/${den} ... so ${num}/${den} is tick ${num}.`,
        ['tick_from_fraction'],
        withDifficulty({ num, den }, difficulty)
      )
    );
  }

  for (let j = 0; j < reverseCount; j++) {
    const qIndex = tickCount + j;
    const difficulty = difficultyForIndex(qIndex, 10);
    const [denMin, denMax] = denRangeForDifficulty(Math.max(2, difficulty));
    const den = randInt(rng, denMin, denMax);
    const tickMin = (difficulty >= 5 && den >= 4) ? 2 : 1;
    const tickMax = (difficulty >= 5 && den >= 4) ? (den - 2) : (den - 1);
    const tick = randInt(rng, tickMin, tickMax);

    const qid = `q${tickCount + j + 1}`;
    const prompt = `On a number line from 0 to 1, split into ${den} equal parts. What fraction is at tick ${tick}? (type like 3/8)`;
    questions.push(
      makeFraction(
        qid,
        prompt,
        tick,
        den,
        `Tick ${tick} means ${tick} parts of size 1/${den}, so the fraction is ${tick}/${den}.`,
        ['fraction_from_tick'],
        withDifficulty({ num: tick, den }, difficulty)
      )
    );
  }

  return {
    passPercent: 80,
    title: 'Fractions on a Number Line',
    questions,
  };
}

function quiz_math_equivalent_fractions(seed, options) {
  const rng = mulberry32(seed);
  const questions = [];

  const focus = options?.focusTags || {};
  const missSimplify = Number(focus.simplify || 0);
  const missEquivalence = Number(focus.equivalence || 0);
  const simplifyCount = missSimplify > missEquivalence ? 8 : 6;
  const eqCount = 10 - simplifyCount;

  const denRangeForDifficulty = (difficulty) => {
    const d = Number(difficulty);
    if (d <= 1) return [2, 6];
    if (d === 2) return [3, 8];
    if (d === 3) return [4, 10];
    if (d === 4) return [5, 12];
    return [6, 12];
  };

  const kRangeForDifficulty = (difficulty) => {
    const d = Number(difficulty);
    if (d <= 1) return [2, 3];
    if (d === 2) return [2, 4];
    if (d === 3) return [2, 6];
    if (d === 4) return [3, 8];
    return [4, 10];
  };

  for (let i = 1; i <= simplifyCount; i++) {
    const qIndex = i - 1;
    const difficulty = difficultyForIndex(qIndex, 10);
    const [denMin, denMax] = denRangeForDifficulty(difficulty);
    const baseDen = randInt(rng, denMin, denMax);

    let baseNum = randInt(rng, 1, baseDen - 1);
    if (difficulty <= 2) {
      // Make early problems cleaner: start with reduced fractions so the only
      // simplification step is "undo the multiplier".
      for (let t = 0; t < 25; t++) {
        const candidate = randInt(rng, 1, baseDen - 1);
        if (gcd(candidate, baseDen) === 1) {
          baseNum = candidate;
          break;
        }
      }
    }

    const [kMin, kMax] = kRangeForDifficulty(difficulty);
    const k = randInt(rng, kMin, kMax);
    const n2 = baseNum * k;
    const d2 = baseDen * k;
    const reduced = reduceFrac(n2, d2);
    questions.push(makeFraction(
      `q${i}`,
      `Simplify the fraction ${n2}/${d2} to simplest form (type like 3/4).`,
      reduced.num,
      reduced.den,
      `Divide numerator and denominator by their greatest common factor.`,
      ['simplify'],
      withDifficulty({ original: { num: n2, den: d2 }, base: { num: baseNum, den: baseDen }, k }, difficulty)
    ));
  }

  for (let i = 1; i <= eqCount; i++) {
    const qIndex = simplifyCount + i - 1;
    const difficulty = difficultyForIndex(qIndex, 10);
    const [denMin, denMax] = denRangeForDifficulty(difficulty);
    const den = randInt(rng, denMin, denMax);
    const num = randInt(rng, 1, den - 1);
    const [kMin, kMax] = kRangeForDifficulty(difficulty);
    const k = randInt(rng, kMin, kMax);
    const a = { num, den };
    const wantEquivalent = rng() < (difficulty <= 2 ? 0.7 : (difficulty === 3 ? 0.6 : 0.5));
    let b = { num: num * k, den: den * k };
    if (!wantEquivalent) {
      // Near-miss fractions get harder later (sometimes tweak denominator too).
      const deltaNumPool = difficulty >= 4 ? [-2, -1, 1, 2] : [-1, 1];
      const deltaDenPool = difficulty >= 4 ? [-1, 1] : [0];
      const deltaNum = pickOne(rng, deltaNumPool);
      const deltaDen = pickOne(rng, deltaDenPool);
      b = { num: b.num + deltaNum, den: Math.max(2, b.den + deltaDen) };
      b.num = Math.max(1, Math.min(b.den - 1, b.num));
      // Ensure we didn't accidentally create an equivalent fraction.
      if (a.num * b.den === b.num * a.den) {
        b.num = Math.max(1, Math.min(b.den - 1, b.num + 1));
        if (a.num * b.den === b.num * a.den) b.num = Math.max(1, Math.min(b.den - 1, b.num - 2));
      }
    }

    const equivalent = a.num * b.den === b.num * a.den;
    const choices = ['Equivalent', 'Not equivalent'];
    const qid = `q${simplifyCount + i}`;
    questions.push(makeMc(
      qid,
      `Are ${a.num}/${a.den} and ${b.num}/${b.den} equivalent?`,
      choices,
      equivalent ? 'Equivalent' : 'Not equivalent',
      `Two fractions are equivalent if cross-products match: a*d == b*c.`,
      ['equivalence'],
      withDifficulty({ a, b }, difficulty)
    ));
  }

  return { passPercent: 80, title: 'Equivalent Fractions', questions };
}

function quiz_math_place_value_expanded_form(seed, options) {
  const rng = mulberry32(seed);
  const questions = [];

  const focus = options?.focusTags || {};
  const missDigit = Number(focus.digit_value || 0);
  const missCompare = Number(focus.compare || 0);
  const missExpanded = Number(focus.expanded_form || 0);
  const top = (missExpanded >= missDigit && missExpanded >= missCompare) ? 'expanded'
    : (missDigit >= missCompare ? 'digit' : 'compare');

  let digitCount = 4;
  let compareCount = 4;
  let expandedCount = 2;
  if (top === 'expanded') {
    digitCount = 3; compareCount = 3; expandedCount = 4;
  } else if (top === 'digit') {
    digitCount = 6; compareCount = 3; expandedCount = 1;
  } else if (top === 'compare') {
    digitCount = 3; compareCount = 6; expandedCount = 1;
  }

  const placeValuesForLength = (len) => {
    const out = [];
    for (let i = 0; i < len; i++) out.push(10 ** (len - i - 1));
    return out;
  };

  const PLACE_NAMES = {
    1: 'ones',
    10: 'tens',
    100: 'hundreds',
    1000: 'thousands',
    10000: 'ten-thousands',
    100000: 'hundred-thousands',
    1000000: 'millions',
  };

  const lengthForDifficulty = (difficulty) => {
    const d = Number(difficulty);
    if (d <= 1) return 4;
    if (d === 2) return 5;
    if (d === 3) return 6;
    return 7;
  };

  const makeDigits = (len, includeZeros) => {
    const digits = [];
    for (let i = 0; i < len; i++) {
      if (i === 0) {
        digits.push(randInt(rng, 1, 9));
        continue;
      }
      if (includeZeros && rng() < 0.28) digits.push(0);
      else digits.push(randInt(rng, 1, 9));
    }
    return digits;
  };

  const numberFromDigits = (digits) => Number(digits.join(''));

  const pickNonZeroPos = (digits, preferred) => {
    const len = digits.length;
    const prefs = Array.isArray(preferred) ? preferred.slice() : [];
    for (const p of prefs) {
      const pos = Number(p);
      if (Number.isFinite(pos) && pos >= 0 && pos < len && digits[pos] !== 0) return pos;
    }
    const candidates = [];
    for (let i = 0; i < len; i++) if (digits[i] !== 0) candidates.push(i);
    return candidates.length ? pickOne(rng, candidates) : 0;
  };

  for (let i = 1; i <= digitCount; i++) {
    const qIndex = i - 1;
    const difficulty = difficultyForIndex(qIndex, 10);
    const len = lengthForDifficulty(difficulty);
    const includeZeros = difficulty >= 5;

    const digits = makeDigits(len, includeZeros);
    const n = numberFromDigits(digits);
    const placeValues = placeValuesForLength(len);

    const preferred =
      difficulty <= 1 ? [len - 1, len - 2] :
      difficulty === 2 ? [len - 2, len - 3, len - 1] :
      difficulty === 3 ? [len - 3, len - 2, len - 4] :
      [0, 1, 2, 3, len - 1];
    const pos = pickNonZeroPos(digits, preferred);

    const value = digits[pos] * placeValues[pos];
    const placeName = PLACE_NAMES[placeValues[pos]] || 'place';
    questions.push(makeNumber(
      `q${i}`,
      `In the number ${n}, what is the value of the digit ${digits[pos]} in the ${placeName} place? (Type the value as a number.)`,
      value,
      `Multiply the digit by its place value (hundred-thousands, ten-thousands, etc.).`,
      ['digit_value'],
      withDifficulty({ n, digit: digits[pos], pos, placeValue: placeValues[pos] }, difficulty)
    ));
  }

  for (let i = 1; i <= compareCount; i++) {
    const qIndex = digitCount + i - 1;
    const difficulty = difficultyForIndex(qIndex, 10);
    const len = lengthForDifficulty(difficulty);
    const includeZeros = difficulty >= 5;

    const base = makeDigits(len, includeZeros);
    const other = base.slice();

    const posPool =
      difficulty <= 1 ? [len - 1] :
      difficulty === 2 ? [len - 2, len - 1] :
      difficulty === 3 ? [len - 3, len - 2] :
      difficulty === 4 ? [1, 2, 3] :
      [0, 1, 2];
    const pos = Math.max(0, Math.min(len - 1, pickOne(rng, posPool)));

    const delta = pickOne(rng, [-1, 1]) * randInt(rng, 1, difficulty >= 4 ? 3 : 1);
    other[pos] = Math.max(0, Math.min(9, other[pos] + delta));
    if (pos === 0 && other[pos] === 0) other[pos] = 1;

    const a = numberFromDigits(base);
    const b = numberFromDigits(other);
    const correct = a > b ? '>' : (a < b ? '<' : '=');
    const qid = `q${digitCount + i}`;
    questions.push(makeMc(
      qid,
      `Compare: ${a} __ ${b} (choose the correct symbol).`,
      ['<', '>', '='],
      correct,
      `Compare digits from left to right until one differs.`,
      ['compare'],
      withDifficulty({ a, b }, difficulty)
    ));
  }

  for (let i = 1; i <= expandedCount; i++) {
    const qIndex = digitCount + compareCount + i - 1;
    const difficulty = difficultyForIndex(qIndex, 10);
    const len = lengthForDifficulty(difficulty);
    const includeZeros = difficulty >= 4;

    const digits = makeDigits(len, includeZeros);
    const n = numberFromDigits(digits);
    const placeValues = placeValuesForLength(len);
    const parts = digits.map((d, idx) => d * placeValues[idx]).filter((v) => v !== 0);
    const prompt = `Type an expanded form (sum) that equals ${n}. Example format: 500000 + 7000 + 400 + 30 + 2`;
    const qid = `q${digitCount + compareCount + i}`;
    questions.push(makeExpandedSum(
      qid,
      prompt,
      n,
      `One correct answer is: ${parts.join(' + ')}`,
      ['expanded_form'],
      withDifficulty({ n, parts }, difficulty)
    ));
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

function quiz_math_factors_primes_multiples(seed, options) {
  const rng = mulberry32(seed);
  const questions = [];

  const focus = options?.focusTags || {};
  const missFactors = Number(focus.factors || 0);
  const missPrime = Number(focus.prime || 0);
  const missMultiple = Number(focus.multiple || 0);
  const top = (missFactors >= missPrime && missFactors >= missMultiple) ? 'factors'
    : (missPrime >= missMultiple ? 'prime' : 'multiple');

  let factorsCount = 5;
  let primeCount = 3;
  let multipleCount = 2;
  if (top === 'factors') {
    factorsCount = 7; primeCount = 2; multipleCount = 1;
  } else if (top === 'prime') {
    factorsCount = 4; primeCount = 5; multipleCount = 1;
  } else if (top === 'multiple') {
    factorsCount = 4; primeCount = 2; multipleCount = 4;
  }

  for (let i = 1; i <= factorsCount; i++) {
    const qIndex = i - 1;
    const difficulty = difficultyForIndex(qIndex, 10);
    const pools = {
      1: [12, 15, 16, 18, 20, 24, 25, 27, 28],
      2: [30, 32, 36, 40, 42, 45, 48],
      3: [50, 54, 56, 60, 63, 64, 66],
      4: [70, 72, 75, 80, 81, 84, 90],
      5: [84, 90, 96, 98, 99, 100],
    };
    const pool = pools[difficulty] || pools[3];
    const n = pickOne(rng, pool);
    questions.push(makeSetNumbers(
      `q${i}`,
      `List ALL factors of ${n}. Type numbers separated by commas (example: 1,2,3,6).`,
      factorsOf(n),
      `Factors divide the number evenly (remainder 0).`,
      ['factors'],
      withDifficulty({ n }, difficulty)
    ));
  }

  for (let i = 1; i <= primeCount; i++) {
    const qIndex = factorsCount + i - 1;
    const difficulty = difficultyForIndex(qIndex, 10);
    const min = difficulty <= 1 ? 2 : (difficulty === 2 ? 2 : (difficulty === 3 ? 10 : (difficulty === 4 ? 30 : 50)));
    const n = randInt(rng, min, 97);
    const correct = isPrime(n) ? 'Prime' : 'Composite';
    const qid = `q${factorsCount + i}`;
    questions.push(makeMc(
      qid,
      `Is ${n} prime or composite?`,
      ['Prime', 'Composite'],
      correct,
      `Prime has exactly 2 factors: 1 and itself.`,
      ['prime'],
      withDifficulty({ n }, difficulty)
    ));
  }

  for (let i = 1; i <= multipleCount; i++) {
    const qIndex = factorsCount + primeCount + i - 1;
    const difficulty = difficultyForIndex(qIndex, 10);
    const divisorPool =
      difficulty <= 1 ? [2, 3, 4, 5] :
      difficulty === 2 ? [2, 3, 4, 5, 6] :
      difficulty === 3 ? [3, 4, 5, 6, 8] :
      difficulty === 4 ? [4, 5, 6, 8, 9, 10] :
      [6, 7, 8, 9, 10, 12];
    const d = pickOne(rng, divisorPool);
    const baseMin = difficulty <= 2 ? 12 : (difficulty === 3 ? 24 : 40);
    const baseMax = difficulty >= 4 ? 144 : 96;
    const base = randInt(rng, baseMin, baseMax);
    const n = rng() < 0.6 ? base - (base % d) : base - (base % d) + 1;
    const correct = (n % d === 0) ? 'Yes' : 'No';
    const qid = `q${factorsCount + primeCount + i}`;
    questions.push(makeMc(
      qid,
      `Is ${n} a multiple of ${d}?`,
      ['Yes', 'No'],
      correct,
      `A multiple of ${d} has remainder 0 when divided by ${d}.`,
      ['multiple'],
      withDifficulty({ n, d }, difficulty)
    ));
  }

  return { passPercent: 80, title: 'Factors + Prime vs Composite + Multiples', questions };
}

function evalOrderOfOps(expr) {
  // We only generate safe numeric expressions (no user-supplied eval).
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${expr});`)();
}

function quiz_math_order_of_operations_exponents(seed, options) {
  const rng = mulberry32(seed);
  const questions = [];

  const focus = options?.focusTags || {};
  const missExponents = Number(focus.exponents || 0);
  const missOrder = Number(focus.order_ops || 0);
  const baseExpProb = missExponents > missOrder ? 0.8 : 0.5;

  for (let i = 1; i <= 10; i++) {
    const qIndex = i - 1;
    const difficulty = difficultyForIndex(qIndex, 10);

    const ops =
      difficulty <= 2 ? [' + ', ' - '] :
      difficulty === 3 ? [' + ', ' - ', ' * '] :
      [' + ', ' - ', ' * '];

    const max = difficulty <= 1 ? 9 : (difficulty === 2 ? 12 : (difficulty === 3 ? 14 : 16));
    const a = randInt(rng, 2, max);
    const b = randInt(rng, 2, max);
    const c = randInt(rng, 2, max);

    const expCurve = difficulty <= 1 ? 0
      : (difficulty === 2 ? 0.25 : (difficulty === 3 ? 0.5 : (difficulty === 4 ? 0.75 : 1)));
    const expProb = Math.min(0.95, baseExpProb * expCurve);
    const hasExp = rng() < expProb;
    const d = hasExp
      ? randInt(rng, 2, difficulty >= 5 ? 4 : (difficulty >= 4 ? 3 : 2))
      : 1;

    const op1 = pickOne(rng, ops);
    const op2 = pickOne(rng, ops);
    const left = hasExp ? `(${a} ** ${d})` : `${a}`;
    const expr = `(${left}${op1}${b})${op2}${c}`;
    const ans = evalOrderOfOps(expr);
    const tags = hasExp ? ['order_ops', 'exponents'] : ['order_ops'];
    questions.push(makeNumber(
      `q${i}`,
      `Compute: ${expr.replaceAll('**', '^')}`,
      ans,
      `Follow parentheses first, then exponents, then multiply/divide, then add/subtract.`,
      tags,
      withDifficulty({ expr, hasExp, ops, max }, difficulty)
    ));
  }

  return { passPercent: 80, title: 'Order of Operations', questions };
}

function quiz_math_translate_and_parts_of_expression(seed, options) {
  const rng = mulberry32(seed);
  const questions = [];

  const focus = options?.focusTags || {};
  const missTranslate = Number(focus.translate || 0);
  const missParts = Number(focus.parts || 0);

  const translationItems = [
    { difficulty: 1, prompt: '“5 less than x”', choices: ['x - 5', '5 - x', 'x + 5', '5x'], answer: 'x - 5' },
    { difficulty: 1, prompt: '“The quotient of x and 5”', choices: ['x/5', '5/x', 'x - 5', '5x'], answer: 'x/5' },
    { difficulty: 2, prompt: '“3 more than 2x”', choices: ['2x + 3', '3x + 2', '2(x + 3)', 'x/2 + 3'], answer: '2x + 3' },
    { difficulty: 2, prompt: '“Twice x, then subtract 4”', choices: ['2x - 4', '2(x - 4)', 'x/2 - 4', 'x - 8'], answer: '2x - 4' },
    { difficulty: 3, prompt: '“Half of (x + 8)”', choices: ['(x + 8)/2', 'x/2 + 8', '2(x + 8)', '(x + 8) - 2'], answer: '(x + 8)/2' },
    { difficulty: 3, prompt: '“Four less than 3x”', choices: ['3x - 4', '4x - 3', '4 - 3x', '3(x - 4)'], answer: '3x - 4' },
    { difficulty: 4, prompt: '“The product of 7 and (x - 1)”', choices: ['7(x - 1)', '7x - 1', 'x(7 - 1)', '7 + (x - 1)'], answer: '7(x - 1)' },
    { difficulty: 5, prompt: '“Three times the sum of x and 2”', choices: ['3x + 2', '3(x + 2)', '(x + 2)/3', 'x + 6'], answer: '3(x + 2)' },
  ];

  let translateCount = missTranslate > missParts ? 7 : 6;
  translateCount = Math.min(translateCount, translationItems.length);
  const partsCount = 10 - translateCount;

  const remaining = translationItems.slice();
  for (let idx = 0; idx < translateCount; idx++) {
    const qIndex = idx;
    const difficulty = difficultyForIndex(qIndex, 10);
    const candidates = remaining.filter((it) => Number(it.difficulty || 1) <= difficulty);
    const chosen = pickOne(rng, (candidates.length ? candidates : remaining));
    const removeAt = remaining.indexOf(chosen);
    if (removeAt >= 0) remaining.splice(removeAt, 1);

    questions.push(makeMc(
      `q${idx + 1}`,
      `Translate to an algebraic expression: ${chosen.prompt}`,
      chosen.choices,
      chosen.answer,
      `Look for keywords: “more than” means +, “less than” means -, “product” means multiply.`,
      ['translate'],
      withDifficulty({ prompt: chosen.prompt, expected: chosen.answer }, difficulty)
    ));
  }

  const fmtSigned = (n) => (n >= 0 ? `+ ${n}` : `- ${Math.abs(n)}`);

  const buildPartsItem = (difficulty) => {
    const d = Number(difficulty);
    if (d <= 1) {
      const a = randInt(rng, 2, 9);
      const b = randInt(rng, 1, 12);
      return { expr: `${a}x + ${b}`, answer: a, question: 'What is the coefficient of x?', explanation: 'The coefficient is the number multiplying x.' };
    }
    if (d === 2) {
      const a = randInt(rng, 2, 12);
      const b = randInt(rng, -12, 12);
      return { expr: `${a}x ${fmtSigned(b)}`, answer: a, question: 'What is the coefficient of x?', explanation: 'The coefficient is the number multiplying x (the sign matters).' };
    }
    if (d === 3) {
      const a = randInt(rng, 1, 9);
      const c = randInt(rng, 1, 9);
      const b = randInt(rng, -12, 12);
      return { expr: `${a}x + ${c}x ${fmtSigned(b)}`, answer: a + c, question: 'What is the coefficient of x after simplifying?', explanation: `Combine like terms: ${a}x + ${c}x = ${(a + c)}x.` };
    }
    if (d === 4) {
      const ax = randInt(rng, 1, 8);
      const by = randInt(rng, 2, 9);
      const cx = randInt(rng, 1, 8);
      const dy = randInt(rng, 1, 8);
      const k = randInt(rng, -10, 10);
      return { expr: `${ax}x + ${by}y + ${cx}x - ${dy}y ${fmtSigned(k)}`, answer: by - dy, question: 'What is the coefficient of y after simplifying?', explanation: `Combine y terms: ${by}y - ${dy}y = ${(by - dy)}y.` };
    }
    const ax = randInt(rng, 1, 8);
    const by = randInt(rng, 1, 8);
    const c = randInt(rng, 1, 12);
    const dx = randInt(rng, 1, 8);
    const ey = randInt(rng, 1, 8);
    const f = randInt(rng, 1, 12);
    const expr = `${ax}x + ${by}y - ${c} + ${dx}x - ${ey}y + ${f}`;
    return { expr, answer: 6, question: 'How many terms are in this expression?', explanation: 'A term is a part separated by + or - (including variable terms and constants).' };
  };

  for (let i = 0; i < partsCount; i++) {
    const qIndex = translateCount + i;
    const difficulty = difficultyForIndex(qIndex, 10);
    const it = buildPartsItem(difficulty);
    questions.push(makeNumber(
      `q${translateCount + 1 + i}`,
      `${it.expr}: ${it.question}`,
      Number(it.answer),
      it.explanation || `Coefficient is the number multiplying x.`,
      ['parts'],
      withDifficulty({ expr: it.expr, kind: it.question }, difficulty)
    ));
  }

  return { passPercent: 80, title: 'Translate + Parts of an Expression', questions };
}

function quiz_math_evaluate_expressions_and_combine_like_terms(seed, options) {
  const rng = mulberry32(seed);
  const questions = [];

  const focus = options?.focusTags || {};
  const missCombine = Number(focus.combine_like_terms || 0);
  const missEvaluate = Number(focus.evaluate || 0);
  const combineCount = missCombine > missEvaluate ? 6 : 5;
  const evalCount = 10 - combineCount;

  const fmtSigned = (n) => (n >= 0 ? `+ ${n}` : `- ${Math.abs(n)}`);

  // Combine like terms: ask for coefficient OR constant term (mixed).
  for (let i = 1; i <= combineCount; i++) {
    const qIndex = i - 1;
    const difficulty = difficultyForIndex(qIndex, 10);

    const xTermCount = difficulty >= 5 ? 3 : 2;
    const constCount = difficulty <= 1 ? 1 : 2;

    const xCoeffs = [];
    for (let t = 0; t < xTermCount; t++) {
      const mag = randInt(rng, 1, difficulty >= 4 ? 12 : 9);
      const sign = (difficulty >= 4 && rng() < 0.35) ? -1 : 1;
      xCoeffs.push(mag * sign);
    }

    const constants = [];
    for (let t = 0; t < constCount; t++) {
      const mag = randInt(rng, 0, difficulty >= 4 ? 15 : 9);
      const sign = (difficulty >= 3 && rng() < 0.45) ? -1 : 1;
      constants.push(mag * sign);
    }

    const coef = xCoeffs.reduce((acc, v) => acc + v, 0);
    const constant = constants.reduce((acc, v) => acc + v, 0);

    let expr = `${xCoeffs[0]}x`;
    if (xCoeffs[0] < 0) expr = `-${Math.abs(xCoeffs[0])}x`;
    for (let t = 1; t < xCoeffs.length; t++) {
      const c = xCoeffs[t];
      expr += c >= 0 ? ` + ${c}x` : ` - ${Math.abs(c)}x`;
    }
    for (const k of constants) {
      expr += ` ${fmtSigned(k)}`;
    }

    const askCoef = (i % 2 === 1);
    if (askCoef) {
      questions.push(makeNumber(
        `q${i}`,
        `Simplify: ${expr}. What is the coefficient of x in the simplified expression?`,
        coef,
        `Combine like x terms to get ${coef}x.`,
        ['combine_like_terms'],
        withDifficulty({ expr, coef, constant }, difficulty)
      ));
    } else {
      questions.push(makeNumber(
        `q${i}`,
        `Simplify: ${expr}. What is the constant term in the simplified expression?`,
        constant,
        `Combine constants to get ${constant}.`,
        ['combine_like_terms'],
        withDifficulty({ expr, coef, constant }, difficulty)
      ));
    }
  }

  // Evaluate expressions.
  for (let i = 1; i <= evalCount; i++) {
    const qIndex = combineCount + i - 1;
    const difficulty = difficultyForIndex(qIndex, 10);

    const mMax = difficulty <= 2 ? 6 : (difficulty === 3 ? 8 : 12);
    const bMax = difficulty <= 2 ? 12 : (difficulty === 3 ? 15 : 20);
    const xMax = difficulty <= 2 ? 8 : (difficulty === 3 ? 8 : 10);

    const m = randInt(rng, -mMax, mMax) || (difficulty <= 2 ? 2 : -3);
    const b = randInt(rng, -bMax, bMax);
    const x = randInt(rng, -xMax, xMax);
    const ans = m * x + b;
    const qid = `q${combineCount + i}`;
    questions.push(makeNumber(
      qid,
      `Evaluate: ${m}x ${b >= 0 ? '+ ' + b : '- ' + Math.abs(b)} when x = ${x}.`,
      ans,
      `Substitute x=${x} then compute.`,
      ['evaluate'],
      withDifficulty({ m, b, x }, difficulty)
    ));
  }

  return { passPercent: 80, title: 'Evaluate + Combine Like Terms', questions };
}

function quiz_math_one_step_two_step_equations(seed, options) {
  const rng = mulberry32(seed);
  const questions = [];

  const focus = options?.focusTags || {};
  const missOne = Number(focus.one_step || 0);
  const missTwo = Number(focus.two_step || 0);
  const wordCount = 2; // ensure we always include word-problem mastery checks
  const coreTotal = 10 - wordCount;
  const desiredTwoStep = missTwo > missOne ? 4 : 3;
  const twoStepCount = Math.max(2, Math.min(6, desiredTwoStep));
  const oneStepCount = coreTotal - twoStepCount;
  const oneAddCount = Math.min(oneStepCount, Math.max(2, Math.round(oneStepCount * 0.6)));
  const oneMulCount = Math.max(0, oneStepCount - oneAddCount);

  // One-step: x + a = b
  for (let i = 0; i < oneAddCount; i++) {
    const qIndex = i;
    const difficulty = difficultyForIndex(qIndex, 10);
    const x = difficulty <= 2 ? randInt(rng, 0, 12) : randInt(rng, -12, 12);
    const a = difficulty <= 2 ? randInt(rng, 1, 12) : randInt(rng, -12, 12);
    const b = x + a;
    questions.push(makeNumber(
      `q${i + 1}`,
      `Solve for x: x ${a >= 0 ? '+ ' + a : '- ' + Math.abs(a)} = ${b}`,
      x,
      `Undo ${a >= 0 ? 'adding' : 'subtracting'} ${Math.abs(a)}.`,
      ['one_step'],
      withDifficulty({ a, b }, difficulty)
    ));
  }

  // One-step: ax = b
  for (let i = 0; i < oneMulCount; i++) {
    const qIndex = oneAddCount + i;
    const difficulty = difficultyForIndex(qIndex, 10);
    const a = pickOne(rng, difficulty <= 2 ? [2, 3, 4, 5, 6] : [2, 3, 4, 5, 6, 7, 8, 9]);
    const x = difficulty <= 2 ? randInt(rng, 0, 12) : randInt(rng, -12, 12);
    const b = a * x;
    const qid = `q${oneAddCount + i + 1}`;
    questions.push(makeNumber(
      qid,
      `Solve for x: ${a}x = ${b}`,
      x,
      `Divide both sides by ${a}.`,
      ['one_step'],
      withDifficulty({ a, b }, difficulty)
    ));
  }

  // Two-step: px + q = r
  for (let i = 0; i < twoStepCount; i++) {
    const qIndex = oneAddCount + oneMulCount + i;
    const difficulty = difficultyForIndex(qIndex, 10);
    const p = pickOne(rng, difficulty <= 2 ? [2, 3, 4, 5, 6] : [2, 3, 4, 5, 6, 7, 8]);
    const x = difficulty <= 3 ? randInt(rng, 0, 12) : randInt(rng, -12, 12);
    const q = difficulty <= 3 ? randInt(rng, 0, 12) : randInt(rng, -12, 12);
    const r = p * x + q;
    const qid = `q${oneAddCount + oneMulCount + i + 1}`;
    questions.push(makeNumber(
      qid,
      `Solve for x: ${p}x ${q >= 0 ? '+ ' + q : '- ' + Math.abs(q)} = ${r}`,
      x,
      `Undo +/-, then divide by ${p}.`,
      ['two_step'],
      withDifficulty({ p, q, r }, difficulty)
    ));
  }

  // Word problems (harder, mastery-stretching, exam-like).
  for (let i = 0; i < wordCount; i++) {
    const qIndex = coreTotal + i;
    const difficulty = difficultyForIndex(qIndex, 10);
    const qid = `q${coreTotal + i + 1}`;

    if (i === 0) {
      // One-step word problem.
      const spent = randInt(rng, 3, 12);
      const remaining = randInt(rng, 1, 20);
      const start = remaining + spent;
      questions.push(makeNumber(
        qid,
        `Word problem: You had x points. You lost ${spent} points and now you have ${remaining} points. What is x?`,
        start,
        `If you lost ${spent} and ended with ${remaining}, you started with ${remaining} + ${spent}.`,
        ['one_step', 'word_problem'],
        withDifficulty({ spent, remaining }, difficulty)
      ));
      continue;
    }

    // Two-step word problem.
    const count = pickOne(rng, [3, 4, 5, 6, 7, 8]);
    const price = randInt(rng, 2, 15);
    const feeOrDiscount = difficulty >= 5 ? -randInt(rng, 1, 6) : randInt(rng, 0, 6);
    const total = count * price + feeOrDiscount;
    const feeText = feeOrDiscount >= 0
      ? `a fee of $${feeOrDiscount}`
      : `a discount of $${Math.abs(feeOrDiscount)}`;
    questions.push(makeNumber(
      qid,
      `Word problem: You buy ${count} items. Each item costs $x. You also have ${feeText}. Your total is $${total}. What is x?`,
      price,
      `Model it as ${count}x ${feeOrDiscount >= 0 ? '+ ' + feeOrDiscount : '- ' + Math.abs(feeOrDiscount)} = ${total}, then solve.`,
      ['two_step', 'word_problem'],
      withDifficulty({ count, feeOrDiscount, total }, difficulty)
    ));
  }

  return { passPercent: 80, title: 'One-Step + Two-Step Equations', questions };
}

function quiz_math_proportions_and_slope(seed, options) {
  const rng = mulberry32(seed);
  const questions = [];

  function pickSlopeByDifficulty(difficulty) {
    if (difficulty <= 2) return pickOne(rng, [1, 2, 3, 4, 5, 6]);
    if (difficulty === 3) return pickOne(rng, [0.5, 1.5, 2.5, 3.5, 4.5, 2, 3, 4, 5]);
    if (difficulty === 4) return pickOne(rng, [-1, -2, -3, -4, -5, -6, 2, 3, 4]);
    return pickOne(rng, [-0.5, -1.5, -2.5, -3.5, -4.5, -2, -3, -4, 0.5, 1.5, 2.5, 3.5, 4]);
  }

  const focus = options?.focusTags || {};
  const missUnitRate = Number(focus.unit_rate || 0);
  const missEvalY = Number(focus.evaluate_y || 0);
  const unitRateCount = missUnitRate > missEvalY ? 7 : 5;
  const evalYCount = 10 - unitRateCount;

  for (let i = 1; i <= unitRateCount; i++) {
    const qIndex = i - 1;
    const difficulty = difficultyForIndex(qIndex, 10);
    const m = pickSlopeByDifficulty(difficulty);
    const x1Max = difficulty <= 2 ? 6 : (difficulty === 3 ? 10 : 12);
    const x1 = randInt(rng, 1, x1Max);
    const x2 = x1 + randInt(rng, 1, difficulty <= 2 ? 4 : 8);
    const y1 = m * x1;
    const y2 = m * x2;
    questions.push(makeNumber(
      `q${i}`,
      `A proportional relationship has points (${x1}, ${y1}) and (${x2}, ${y2}). What is the unit rate (slope) m in y = mx?`,
      m,
      `For proportional relationships through 0, m = y/x.`,
      ['unit_rate'],
      withDifficulty({ m, x1, y1, x2, y2 }, difficulty)
    ));
  }

  for (let i = 1; i <= evalYCount; i++) {
    const qIndex = unitRateCount + i - 1;
    const difficulty = difficultyForIndex(qIndex, 10);
    const m = pickSlopeByDifficulty(difficulty);
    let x;
    if (difficulty <= 2) x = randInt(rng, 2, 10);
    else if (difficulty === 3) x = randInt(rng, 4, 12);
    else if (difficulty === 4) x = randInt(rng, 6, 15);
    else {
      x = randInt(rng, -15, 15);
      if (x === 0) x = 7;
    }
    const y = m * x;
    const qid = `q${unitRateCount + i}`;
    questions.push(makeNumber(
      qid,
      `For y = ${m}x, what is y when x = ${x}?`,
      y,
      `Multiply x by m.`,
      ['evaluate_y'],
      withDifficulty({ m, x, y }, difficulty)
    ));
  }

  return { passPercent: 80, title: 'Proportions + Slope', questions };
}

function quiz_math_solutions_of_linear_equations(seed, options) {
  const rng = mulberry32(seed);
  const questions = [];

  const focus = options?.focusTags || {};
  const missSolve = Number(focus.solve_linear || 0);
  const missClassify =
    Number(focus.classify || 0) +
    Number(focus.classify_one || 0) +
    Number(focus.classify_none || 0) +
    Number(focus.classify_infinite || 0);

  const solveCount = missSolve > missClassify ? 6 : 4;
  const classifyCount = 10 - solveCount;

  function formatLinearTerm(coef, variableName) {
    const c = Number(coef);
    if (c === 1) return variableName;
    if (c === -1) return `-${variableName}`;
    return `${c}${variableName}`;
  }

  function formatConst(n) {
    const v = Number(n);
    return v >= 0 ? `+ ${v}` : `- ${Math.abs(v)}`;
  }

  function buildClassificationQuestion(difficulty) {
    const kindPool = difficulty <= 1
      ? ['one', 'one', 'none']
      : (difficulty === 2 ? ['one', 'none', 'inf'] : ['one', 'none', 'inf', 'one']);
    const kind = pickOne(rng, kindPool);

    // Difficulty 1-2: simple patterns.
    if (difficulty <= 2) {
      if (kind === 'one') {
        const a = pickOne(rng, [2, 3, 4, 5]);
        const x = randInt(rng, -10, 10);
        const b = a * x;
        return { eq: `${a}x = ${b}`, kindText: 'One solution' };
      }
      if (kind === 'none') {
        const a = pickOne(rng, [2, 3, 4, 5]);
        const b = randInt(rng, 1, 12);
        const c = b + randInt(rng, 1, 6);
        return { eq: `${a}x + ${b} = ${a}x + ${c}`, kindText: 'No solution' };
      }
      const a = pickOne(rng, [2, 3, 4, 5]);
      const b = randInt(rng, 1, 12);
      return { eq: `${a}x + ${b} = ${a}x + ${b}`, kindText: 'Infinitely many' };
    }

    // Difficulty 3+: x on both sides (harder classification; requires simplifying).
    if (kind === 'one') {
      const x = randInt(rng, -10, 10);
      const a = pickOne(rng, [2, 3, 4, 5, 6]);
      const c = pickOne(rng, [1, 2, 3, 4, 5, 7]);
      const b = randInt(rng, -12, 12);
      const d = (a - c) * x + b;
      const eq = `${formatLinearTerm(a, 'x')} ${formatConst(b)} = ${formatLinearTerm(c, 'x')} ${formatConst(d)}`;
      return { eq, kindText: 'One solution' };
    }

    if (kind === 'none') {
      // Same x coefficient, different constant -> contradiction.
      const a = pickOne(rng, [2, 3, 4, 5, 6]);
      const b = randInt(rng, -12, 12);
      const c = b + pickOne(rng, [1, 2, 3, 4, 5, 6]);
      const eq = `${formatLinearTerm(a, 'x')} ${formatConst(b)} = ${formatLinearTerm(a, 'x')} ${formatConst(c)}`;
      return { eq, kindText: 'No solution' };
    }

    // Identical both sides -> identity.
    const a = pickOne(rng, [2, 3, 4, 5, 6]);
    const b = randInt(rng, -12, 12);
    const eq = `${formatLinearTerm(a, 'x')} ${formatConst(b)} = ${formatLinearTerm(a, 'x')} ${formatConst(b)}`;
    return { eq, kindText: 'Infinitely many' };
  }

  function buildSolveQuestion(difficulty) {
    const x = randInt(rng, -10, 10);

    // Difficulty 1-3: ax + b = c (two-step).
    if (difficulty <= 3) {
      const a = pickOne(rng, difficulty <= 2 ? [2, 3, 4, 5] : [2, 3, 4, 5, 6, 7]);
      const b = difficulty <= 2 ? randInt(rng, -9, 9) : randInt(rng, -12, 12);
      const c = a * x + b;
      const eq = `${a}x ${formatConst(b)} = ${c}`;
      return { x, eq, explanation: `Undo +/-, then divide by ${a}.`, meta: { a, b, c } };
    }

    // Difficulty 4: ax + b = cx + d (variables on both sides).
    if (difficulty === 4) {
      for (let tries = 0; tries < 30; tries++) {
        const a = pickOne(rng, [2, 3, 4, 5, 6, 7, 8]);
        const c = pickOne(rng, [1, 2, 3, 4, 5, 6, 7]);
        if (a === c) continue;
        const b = randInt(rng, -12, 12);
        const d = (a - c) * x + b;
        if (Math.abs(d) > 40) continue;
        const eq = `${formatLinearTerm(a, 'x')} ${formatConst(b)} = ${formatLinearTerm(c, 'x')} ${formatConst(d)}`;
        return { x, eq, explanation: 'Get x terms on one side, constants on the other, then divide.', meta: { a, b, c, d } };
      }
    }

    // Difficulty 5: p(ax + b) = cx + d (distribution + variables on both sides).
    for (let tries = 0; tries < 50; tries++) {
      const p = pickOne(rng, [2, 3, 4]);
      const a = pickOne(rng, [2, 3, 4, 5, 6]);
      const b = randInt(rng, -10, 10);
      const c = pickOne(rng, [1, 2, 3, 4, 5, 6, 7, 8]);
      const d = (p * a - c) * x + p * b;
      if (p * a === c) continue;
      if (Math.abs(d) > 60) continue;
      const inside = `${formatLinearTerm(a, 'x')} ${formatConst(b)}`;
      const eq = `${p}(${inside}) = ${formatLinearTerm(c, 'x')} ${formatConst(d)}`;
      return { x, eq, explanation: 'Distribute, combine like terms, then solve for x.', meta: { p, a, b, c, d } };
    }

    // Fallback (should be rare).
    const a = 3;
    const b = 4;
    const c = a * x + b;
    return { x, eq: `${a}x + ${b} = ${c}`, explanation: `Undo +/-, then divide by ${a}.`, meta: { a, b, c } };
  }

  // Classification: one / none / infinite.
  for (let i = 1; i <= classifyCount; i++) {
    const qIndex = i - 1;
    const difficulty = difficultyForIndex(qIndex, 10);
    const t = buildClassificationQuestion(difficulty);
    const choices = ['One solution', 'No solution', 'Infinitely many'];
    const subtype = t.kindText === 'One solution' ? 'classify_one'
      : (t.kindText === 'No solution' ? 'classify_none' : 'classify_infinite');
    questions.push(makeMc(
      `q${i}`,
      `Classify: ${t.eq}`,
      choices,
      t.kindText,
      `Simplify both sides. If you get x=a -> one solution. If you get a=b (a≠b) -> none. If you get a=a -> infinitely many.`,
      ['classify', subtype],
      withDifficulty({ eq: t.eq, kind: t.kindText }, difficulty)
    ));
  }

  // Solve multi-step linear equation.
  for (let i = 1; i <= solveCount; i++) {
    const qIndex = classifyCount + i - 1;
    const difficulty = difficultyForIndex(qIndex, 10);
    const built = buildSolveQuestion(difficulty);
    const qid = `q${classifyCount + i}`;
    questions.push(makeNumber(
      qid,
      `Solve: ${built.eq}`,
      built.x,
      built.explanation,
      ['solve_linear'],
      withDifficulty({ eq: built.eq, ...built.meta }, difficulty)
    ));
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
  const [passageId, passage] = pickOne(rng, Object.entries(PASSAGES));
  const questions = [];

  questions.push(makeMc('q1', `Read this passage:\n\n"${passage.text}"\n\nWhat point of view is it written in?`, ['First person', 'Third person'], passage.pov, 'First person uses I/me/my. Third person uses he/she/they.', ['pov'], { passageId }));

  questions.push(makeMc('q2', 'Which word is a strong clue for first-person point of view?', ['I', 'he', 'Marcus', 'they'], passage.pov === 'First person' ? 'I' : 'he', 'Pronouns are strong clues: I/me/my = first person, he/she/they = third person.', ['pov_clues'], { passageId }));

  questions.push(makeMc('q3', 'What is the best description of the structure?', ['A short scene', 'A poem with stanzas', 'A compare/contrast article', 'A list of steps'], 'A short scene', 'This passage reads like a short scene (events happening in time).', ['structure'], { passageId }));

  questions.push(makeMc('q4', 'Which sentence best shows the character’s feelings or thoughts?', [
    'The lights were off, but the scoreboard still blinked 00:00.',
    'I told myself, “Start with the easy problems. Don’t rush.”',
    'Marcus opened the notebook and counted the lines on the page.',
    'He checked the directions twice before writing anything down.',
  ], passage.pov === 'First person'
    ? 'I told myself, “Start with the easy problems. Don’t rush.”'
    : 'He checked the directions twice before writing anything down.',
  'Look for thoughts (inner talk) or nervous/calm behavior.', ['character_thoughts_feelings'], { passageId }));

  // Theme-like: choose best summary
  questions.push(makeMc('q5', 'Which is the most objective summary?', [
    'The character is awesome and will definitely win.',
    'The character enters a quiet place and prepares to work carefully.',
    'This is boring and nothing happens.',
    'The author is trying to trick us.',
  ], 'The character enters a quiet place and prepares to work carefully.', 'Objective summaries state what happens without opinions.', ['objective_summary'], { passageId }));

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
  ], 'Hard work can build confidence over time.', 'A theme is a message/lesson, usually a full sentence.', ['theme_vs_topic'], {}));

  questions.push(makeMc('q2', 'Which summary is MOST objective?', [
    'The author is wrong and the story is dumb.',
    'The text explains a main idea and supports it with details.',
    'This is the best story ever written.',
    'I feel sad reading this.',
  ], 'The text explains a main idea and supports it with details.', 'Objective = no opinions, just facts.', ['objective_summary'], {}));

  // Evidence support
  const detailSets = [
    { main: 'Plants need sunlight to grow.', supports: ['The text says leaves absorb light.', 'The text describes growth slowing in darkness.'], not: ['The author likes plants.'] },
    { main: 'Practice improves skill.', supports: ['He made fewer mistakes after training.', 'She learned a faster strategy over time.'], not: ['Practice is fun.'] },
  ];
  const ds = pickOne(rng, detailSets);
  const choices = shuffle(rng, ds.supports.concat(ds.not));
  questions.push(makeMc('q3', `Which detail best supports the main idea: "${ds.main}"`, choices, ds.supports[0], 'Supporting details are facts/examples that prove the main idea.', ['supporting_evidence'], { main: ds.main }));

  questions.push(makeMc('q4', 'Which of these is a topic sentence (main idea of a paragraph)?', [
    'For example, the temperature dropped 5 degrees.',
    'In conclusion, everyone agreed.',
    'The paragraph explains why teamwork matters during hard tasks.',
    'However, this happened yesterday.',
  ], 'The paragraph explains why teamwork matters during hard tasks.', 'A main idea sentence states what the paragraph is about.', ['main_idea'], {}));

  questions.push(makeMc('q5', 'Which statement is an opinion?', [
    'The character walked home after school.',
    'The article lists three reasons.',
    'The best solution is obvious.',
    'The passage includes a quotation.',
  ], 'The best solution is obvious.', 'Opinions use judgment words like best/worst/obvious.', ['opinion_vs_fact'], {}));

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
  ], 'School should start later in the morning.', 'A claim is what the author wants you to believe/do.', ['claim'], {}));

  questions.push(makeMc('q2', 'Which sentence is evidence (a supporting fact/example)?', [
    'School should start later in the morning.',
    'Because of these benefits, a later start time is a practical change.',
    'A district that moved start time by 45 minutes reported higher attendance.',
    'Later starts feel nicer.',
  ], 'A district that moved start time by 45 minutes reported higher attendance.', 'Evidence is a fact/example that supports the claim.', ['evidence'], {}));

  questions.push(makeMc('q3', 'What is the author’s purpose?', [
    'To entertain with a joke',
    'To persuade the reader to support later start times',
    'To describe a fantasy world',
    'To list random facts',
  ], 'To persuade the reader to support later start times', 'Purpose = what the author is trying to do.', ['author_purpose'], {}));

  questions.push(makeMc('q4', 'What structure best fits this passage?', [
    'Problem/Solution',
    'Chronological order',
    'Compare/Contrast',
    'Poem',
  ], 'Problem/Solution', 'It presents a change (solution) and reasons/benefits for it.', ['text_structure'], {}));

  questions.push(makeMc('q5', 'Which is the best example of relevant evidence?', [
    '“I like mornings.”',
    'A study shows sleep affects attention.',
    'The author uses strong adjectives.',
    'The passage has four sentences.',
  ], 'A study shows sleep affects attention.', 'Relevant evidence directly supports the claim.', ['relevant_evidence'], {}));

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
    const tags = it.answer.includes('figurative')
      ? ['context_clues', 'figurative_language']
      : ['context_clues'];
    questions.push(makeMc(
      `q${idx + 1}`,
      `In the sentence: "${it.sentence}"\n\nWhat does "${it.word}" mean here?`,
      it.choices,
      it.answer,
      'Use context clues (the rest of the sentence) to decide.',
      tags,
      { word: it.word }
    ));
  });

  questions.push(makeMc('q4', 'Which strategy is best to confirm a word meaning after you guess from context?', [
    'Ignore it',
    'Look it up in a dictionary/glossary',
    'Change the word',
    'Skip the sentence',
  ], 'Look it up in a dictionary/glossary', 'Context helps you guess; references confirm.', ['reference_tools'], {}));

  questions.push(makeMc('q5', 'Which sentence uses figurative language?', [
    'The backpack is on the chair.',
    'Time crawled as the test continued.',
    'She wrote her name at the top.',
    'The clock is digital.',
  ], 'Time crawled as the test continued.', 'Figurative language compares or exaggerates for effect.', ['figurative_language'], {}));

  return { passPercent: 80, title: 'Vocabulary + Context + Figurative Language', questions };
}

function quiz_book_1984_foundations(seed) {
  void seed;
  const questions = [];

  questions.push(makeMc('q1', 'What is a dystopia?', [
    'A perfect society with no problems',
    'A society with oppression, fear, and unfair control',
    'A story told only as a poem',
    'A place where everyone has the same hobby',
  ], 'A society with oppression, fear, and unfair control', 'A dystopia shows a harmful society to warn or teach.', ['dystopia'], {}));

  questions.push(makeMc('q2', 'What is propaganda?', [
    'A balanced report showing all sides equally',
    'Information designed to persuade people, often by controlling what facts they see',
    'A math formula',
    'A dictionary definition',
  ], 'Information designed to persuade people, often by controlling what facts they see', 'Propaganda pushes a message and may hide or twist facts.', ['propaganda'], {}));

  questions.push(makeMc('q3', 'What is surveillance?', [
    'Helping someone study',
    'Constantly watching or monitoring people',
    'A celebration',
    'A type of vacation',
  ], 'Constantly watching or monitoring people', 'Surveillance is monitoring behavior, often to control it.', ['surveillance'], {}));

  questions.push(makeMc('q4', 'Why might a government want to control language?', [
    'To make jokes funnier',
    'To limit what people can think, question, or communicate',
    'To teach everyone to sing',
    'To make books longer',
  ], 'To limit what people can think, question, or communicate', 'Language shapes how we describe ideas; controlling it can limit thought.', ['language_control'], {}));

  questions.push(makeMc('q5', 'Which best matches the idea of “doublethink”?', [
    'Learning two languages',
    'Holding two conflicting beliefs and accepting both as true',
    'Thinking carefully before speaking',
    'Changing your mind when you get new evidence',
  ], 'Holding two conflicting beliefs and accepting both as true', 'Doublethink is accepting contradictions without questioning.', ['doublethink'], {}));

  questions.push(makeMc('q6', 'If a society reduces vocabulary and removes words for certain ideas, what is a likely goal?', [
    'To help people write more poetry',
    'To make it harder for people to express and defend certain thoughts',
    'To make school easier for everyone',
    'To improve spelling contests',
  ], 'To make it harder for people to express and defend certain thoughts', 'Fewer words can mean fewer ways to explain or challenge ideas.', ['newspeak'], {}));

  questions.push(makeMc('q7', 'Which is a theme (message/lesson), not just a topic?', [
    'A city',
    'A man’s job',
    'Fear and information control can shape what people believe is real',
    'Telescreens',
  ], 'Fear and information control can shape what people believe is real', 'A theme is usually a full-sentence message.', ['theme'], {}));

  questions.push(makeMc('q8', 'Which statement is the MOST objective summary?', [
    'The story is scary and the author is obviously right.',
    'The text describes a society where control and fear affect people’s choices.',
    'This is the best book ever written.',
    'I felt angry reading this.',
  ], 'The text describes a society where control and fear affect people’s choices.', 'Objective summaries state what happens/what the text shows without opinions.', ['objective_summary'], {}));

  questions.push(makeMc('q9', 'What is a common effect of constant surveillance on behavior?', [
    'People share every thought freely',
    'People self-censor to avoid punishment',
    'People forget how to read',
    'People stop needing sleep',
  ], 'People self-censor to avoid punishment', 'When people feel watched, they often change behavior to avoid consequences.', ['surveillance_effect'], {}));

  questions.push(makeMc('q10', 'When you hear a strong claim online, what is the BEST next step?', [
    'Repeat it louder so it becomes true',
    'Check multiple independent sources and evidence',
    'Only trust the first post you saw',
    'Ignore all facts that disagree',
  ], 'Check multiple independent sources and evidence', 'Information literacy helps you resist manipulation.', ['information_literacy'], {}));

  return { passPercent: 80, title: '1984: Foundations', questions };
}

function quiz_book_animal_farm_foundations(seed) {
  void seed;
  const questions = [];

  questions.push(makeMc('q1', 'What is an allegory?', [
    'A story where characters and events represent deeper ideas',
    'A story that only uses facts and data tables',
    'A poem with a strict rhyme scheme',
    'A list of rules for grammar',
  ], 'A story where characters and events represent deeper ideas', 'Allegories use a story to communicate a message about real life.', ['allegory'], {}));

  questions.push(makeMc('q2', 'What is satire?', [
    'A serious scientific report',
    'Writing that uses humor/irony to criticize people or systems',
    'A biography of a famous person',
    'A dictionary entry',
  ], 'Writing that uses humor/irony to criticize people or systems', 'Satire points out problems by exaggerating or mocking them.', ['satire'], {}));

  questions.push(makeMc('q3', 'Which is an example of propaganda?', [
    '“Here are the facts and sources. Decide for yourself.”',
    '“Only our leaders are always right, and anyone who disagrees is an enemy.”',
    '“Let’s list pros and cons of both sides.”',
    '“Please check the evidence before believing this.”',
  ], '“Only our leaders are always right, and anyone who disagrees is an enemy.”', 'Propaganda pushes a message and discourages critical thinking.', ['propaganda'], {}));

  questions.push(makeMc('q4', 'How can changing rules help people in power?', [
    'It makes rules easier for everyone to follow',
    'It can make unfair actions seem “allowed”',
    'It always increases equality',
    'It forces everyone to tell the truth',
  ], 'It can make unfair actions seem “allowed”', 'If rules shift, leaders can justify selfish choices.', ['rule_manipulation'], {}));

  questions.push(makeMc('q5', 'Which is a theme (message/lesson)?', [
    'A barn',
    'Animals',
    'Power can corrupt leaders and harm fairness over time',
    'A windmill',
  ], 'Power can corrupt leaders and harm fairness over time', 'A theme is a full-sentence message, not a single topic.', ['theme'], {}));

  questions.push(makeMc('q6', 'Which statement is an opinion?', [
    'A leader changed the rules.',
    'The group worked longer hours.',
    'The leader was obviously the best and deserved everything.',
    'The story includes speeches and rules.',
  ], 'The leader was obviously the best and deserved everything.', 'Opinions use judgment words like “obviously best”.', ['opinion_vs_fact'], {}));

  questions.push(makeMc('q7', 'Why might a leader discourage education or questions?', [
    'To help everyone learn faster',
    'To reduce critical thinking and keep control',
    'To make books more exciting',
    'To improve art skills',
  ], 'To reduce critical thinking and keep control', 'If people can’t question, it’s easier to control beliefs.', ['control_information'], {}));

  questions.push(makeMc('q8', 'Which detail best supports the idea “propaganda can make people accept unfairness”?', [
    'People repeat a slogan even when it conflicts with what they see.',
    'The weather changed.',
    'The story has a setting on a farm.',
    'The characters eat food.',
  ], 'People repeat a slogan even when it conflicts with what they see.', 'Supporting details directly connect to the claim.', ['supporting_evidence'], {}));

  questions.push(makeMc('q9', 'When evaluating a leader’s message, which question is MOST useful?', [
    'Who benefits and who pays the cost?',
    'Is it written in all caps?',
    'Does it rhyme?',
    'Is it short?',
  ], 'Who benefits and who pays the cost?', 'This helps you test fairness and incentives.', ['critical_thinking'], {}));

  questions.push(makeMc('q10', 'Which word best matches “equality”?', [
    'Everyone gets the exact same outcomes no matter what',
    'Fair treatment and equal rights under the rules',
    'Only leaders have rights',
    'Changing rules whenever you want',
  ], 'Fair treatment and equal rights under the rules', 'Equality is about rights and fair treatment, not favoritism.', ['equality'], {}));

  return { passPercent: 80, title: 'Animal Farm: Foundations', questions };
}

function quiz_book_anthem_foundations(seed) {
  void seed;
  const questions = [];

  questions.push(makeMc('q1', 'What is individualism?', [
    'Believing the group is always right',
    'Valuing the individual’s rights, choices, and identity',
    'Never working with others',
    'Always doing what you are told',
  ], 'Valuing the individual’s rights, choices, and identity', 'Individualism focuses on the value and freedom of each person.', ['individualism'], {}));

  questions.push(makeMc('q2', 'What is collectivism (in the extreme)?', [
    'A belief that the group’s goals always come before individual rights',
    'A belief that everyone must live alone',
    'A belief that rules do not matter',
    'A belief that only art matters',
  ], 'A belief that the group’s goals always come before individual rights', 'In extreme collectivism, the individual is treated as less important than the group.', ['collectivism'], {}));

  questions.push(makeMc('q3', 'Why might a society discourage the word “I”?', [
    'To improve spelling',
    'To reduce individual identity and independence',
    'To make jokes funnier',
    'To increase creativity',
  ], 'To reduce individual identity and independence', 'Language can reinforce how people think about themselves.', ['language_identity'], {}));

  questions.push(makeMc('q4', 'Which is a theme (message/lesson)?', [
    'A city',
    'A group of people',
    'Freedom to think and choose can lead to growth and progress',
    'A rulebook',
  ], 'Freedom to think and choose can lead to growth and progress', 'Themes are usually full sentences that communicate a message.', ['theme'], {}));

  questions.push(makeMc('q5', 'Which is an example of conformity pressure?', [
    'A teacher asks students to show their work',
    'A group threatens someone for being different',
    'A friend asks for help with homework',
    'A store sells new shoes',
  ], 'A group threatens someone for being different', 'Conformity pressure often uses fear, shame, or punishment.', ['conformity'], {}));

  questions.push(makeMc('q6', 'Which action best shows healthy independent thinking?', [
    'Agreeing with the group without understanding',
    'Asking “What evidence supports this rule?”',
    'Copying answers to fit in',
    'Never listening to anyone',
  ], 'Asking “What evidence supports this rule?”', 'Independent thinking asks questions and looks for reasons/evidence.', ['critical_thinking'], {}));

  questions.push(makeMc('q7', 'Which is the best meaning of “identity”?', [
    'A random number',
    'Who you are: values, choices, and character',
    'A type of sandwich',
    'A school subject',
  ], 'Who you are: values, choices, and character', 'Identity includes beliefs, values, and choices.', ['identity'], {}));

  questions.push(makeMc('q8', 'Which statement is MOST objective?', [
    'The society is stupid and unfair.',
    'The text describes strict rules that limit individual choices.',
    'I hated this part.',
    'This is the best story.',
  ], 'The text describes strict rules that limit individual choices.', 'Objective summaries avoid judgment words.', ['objective_summary'], {}));

  questions.push(makeMc('q9', 'If a narrator uses “we” instead of “I,” what might that suggest about the society?', [
    'The society celebrates individuality',
    'The society expects people to think of themselves as part of a group first',
    'The story is about sports',
    'The story is a comedy',
  ], 'The society expects people to think of themselves as part of a group first', 'Pronouns can reveal how people are expected to think about identity.', ['inference'], {}));

  questions.push(makeMc('q10', 'If you disagree with the group, what is a strong next step?', [
    'Stay silent forever',
    'Ask a question and explain your reasoning respectfully',
    'Attack people personally',
    'Make up evidence',
  ], 'Ask a question and explain your reasoning respectfully', 'Good disagreement uses reasons and respect, not insults.', ['communication'], {}));

  return { passPercent: 80, title: 'Anthem: Foundations', questions };
}

function quiz_book_alchemist_foundations(seed) {
  void seed;
  const questions = [];

  questions.push(makeMc('q1', 'What is symbolism?', [
    'A list of dates in order',
    'When something stands for a deeper idea beyond itself',
    'A math equation',
    'A literal instruction manual',
  ], 'When something stands for a deeper idea beyond itself', 'Symbols can represent ideas like hope, fear, or growth.', ['symbolism'], {}));

  questions.push(makeMc('q2', 'In many journey stories, what is the main purpose of the journey?', [
    'To show the character getting stronger and learning a life lesson',
    'To list random events with no meaning',
    'To avoid any challenge',
    'To prove the character is perfect',
  ], 'To show the character getting stronger and learning a life lesson', 'A journey often represents growth and learning.', ['journey_story'], {}));

  questions.push(makeMc('q3', 'What is an “omen” in a story context?', [
    'A mistake in spelling',
    'A sign or clue that guides a decision',
    'A type of sandwich',
    'A math tool',
  ], 'A sign or clue that guides a decision', 'Omens are signs characters interpret to decide what to do next.', ['omens'], {}));

  questions.push(makeMc('q4', 'Which is a theme (message/lesson)?', [
    'A desert',
    'A treasure chest',
    'Pursuing a meaningful goal often requires courage and persistence',
    'A map',
  ], 'Pursuing a meaningful goal often requires courage and persistence', 'Themes are lessons/messages, usually full sentences.', ['theme'], {}));

  questions.push(makeMc('q5', 'What is the difference between a WANT and a NEED?', [
    'A want is optional; a need is necessary',
    'A want is always bad; a need is always good',
    'A need is never important',
    'They mean the same thing',
  ], 'A want is optional; a need is necessary', 'Needs are essential; wants are preferences.', ['want_vs_need'], {}));

  questions.push(makeMc('q6', 'Which is an example of a calculated risk?', [
    'Doing something dangerous with no plan',
    'Taking a step toward a goal after thinking about possible outcomes',
    'Never trying anything new',
    'Ignoring all consequences',
  ], 'Taking a step toward a goal after thinking about possible outcomes', 'Calculated risk means you consider consequences before acting.', ['risk'], {}));

  questions.push(makeMc('q7', 'Which statement is MOST objective?', [
    'This part was amazing and the character is awesome.',
    'The text follows a character who faces choices and continues traveling toward a goal.',
    'I felt bored reading this.',
    'The author is wrong.',
  ], 'The text follows a character who faces choices and continues traveling toward a goal.', 'Objective summaries avoid opinions.', ['objective_summary'], {}));

  questions.push(makeMc('q8', 'Which sentence uses figurative language?', [
    'The backpack is on the table.',
    'Hope was a candle in the darkness.',
    'She wrote her name.',
    'The door is open.',
  ], 'Hope was a candle in the darkness.', 'Figurative language compares for effect.', ['figurative_language'], {}));

  questions.push(makeMc('q9', 'Which is the BEST way to make progress toward a long-term goal?', [
    'Wait until you feel perfect motivation',
    'Break it into small steps and practice consistently',
    'Quit when it is hard',
    'Only talk about the goal',
  ], 'Break it into small steps and practice consistently', 'Small consistent steps make goals achievable.', ['goal_setting'], {}));

  questions.push(makeMc('q10', '“Alchemy” literally refers to:', [
    'Turning base metals into gold',
    'A type of sport',
    'A kind of weather',
    'A music style',
  ], 'Turning base metals into gold', 'The literal meaning helps you understand the metaphor of transformation.', ['vocabulary'], {}));

  return { passPercent: 80, title: 'The Alchemist: Foundations', questions };
}

function quiz_book_richest_man_babylon_foundations(seed) {
  void seed;
  const questions = [];

  questions.push(makeMc('q1', 'What does “pay yourself first” mean?', [
    'Spend your money immediately',
    'Save a portion of your income before spending on anything else',
    'Only buy expensive things',
    'Never save money',
  ], 'Save a portion of your income before spending on anything else', 'Pay yourself first means saving before spending.', ['pay_yourself_first'], {}));

  questions.push(makeMc('q2', 'Which is a NEED, not a WANT?', [
    'A new video game',
    'Food for the week',
    'A fancy phone upgrade',
    'Designer shoes',
  ], 'Food for the week', 'Needs are necessary for health/safety; wants are optional.', ['needs_vs_wants'], {}));

  questions.push(makeMc('q3', 'What is a budget?', [
    'A plan for how you will use your money',
    'A way to avoid paying bills',
    'A type of investment',
    'A random guess',
  ], 'A plan for how you will use your money', 'Budgets help you decide spending and saving on purpose.', ['budget'], {}));

  questions.push(makeMc('q4', 'What is the difference between saving and investing?', [
    'They are identical',
    'Saving keeps money safer; investing tries to grow money but has risk',
    'Investing always loses money',
    'Saving is illegal',
  ], 'Saving keeps money safer; investing tries to grow money but has risk', 'Investing aims for growth; saving is usually lower risk.', ['saving_investing'], {}));

  questions.push(makeMc('q5', 'Which is a smart way to protect savings from loss?', [
    'Give money to strangers who promise huge returns',
    'Ask for advice and avoid deals you do not understand',
    'Put all money into one risky bet',
    'Never track where money goes',
  ], 'Ask for advice and avoid deals you do not understand', 'Protection means reducing risk and avoiding scams.', ['protect_from_loss'], {}));

  questions.push(makeMc('q6', 'What does “live below your means” mean?', [
    'Spend more than you earn',
    'Spend less than you earn so you can save',
    'Never buy anything',
    'Only buy things you dislike',
  ], 'Spend less than you earn so you can save', 'Spending less than you earn creates savings.', ['below_means'], {}));

  questions.push(makeMc('q7', 'What is interest/compounding?', [
    'Money shrinking over time',
    'Money growing because it earns gains, and those gains earn gains too',
    'A kind of meal',
    'A school subject',
  ], 'Money growing because it earns gains, and those gains earn gains too', 'Compounding means growth on growth over time.', ['compounding'], {}));

  questions.push(makeMc('q8', 'If you earn $200 and save 10% first, how much do you save?', [
    '$10',
    '$20',
    '$40',
    '$200',
  ], '$20', '10% of 200 is 20.', ['percent'], {}));

  questions.push(makeMc('q9', 'Before buying something expensive, which question is MOST helpful?', [
    'Will this impress someone?',
    'Do I need this now, and does it fit my plan?',
    'Can I hide it?',
    'Is it trending?',
  ], 'Do I need this now, and does it fit my plan?', 'Good spending matches your goals and budget.', ['decision_making'], {}));

  questions.push(makeMc('q10', 'Which statement is the best long-term money mindset?', [
    'Wealth happens instantly with no effort',
    'Small consistent saving and smart choices add up over time',
    'Tracking money is pointless',
    'Debt is always harmless',
  ], 'Small consistent saving and smart choices add up over time', 'Consistency matters more than quick wins.', ['mindset'], {}));

  return { passPercent: 80, title: 'The Richest Man in Babylon: Foundations', questions };
}

function quiz_book_meditations_foundations(seed) {
  void seed;
  const questions = [];

  questions.push(makeMc('q1', 'Which is MOST in your control?', [
    'Other people’s opinions',
    'Your choices and actions',
    'The weather tomorrow',
    'What happened yesterday',
  ], 'Your choices and actions', 'Stoicism focuses on what you can control: your actions and attitude.', ['control'], {}));

  questions.push(makeMc('q2', 'In Stoic philosophy, “virtue” is closest to:', [
    'Being famous',
    'Good character (wisdom, justice, courage, self-control)',
    'Getting everything you want',
    'Never feeling emotions',
  ], 'Good character (wisdom, justice, courage, self-control)', 'Virtue is about character and right action.', ['virtue'], {}));

  questions.push(makeMc('q3', 'What is discipline?', [
    'Doing what is easy every time',
    'Training yourself to do the right thing consistently',
    'Avoiding responsibility',
    'Winning every argument',
  ], 'Training yourself to do the right thing consistently', 'Discipline is consistent practice of right choices.', ['discipline'], {}));

  questions.push(makeMc('q4', 'A Stoic response to a setback is BEST described as:', [
    'Panic and blame others',
    'Pause, accept what happened, then choose a wise next action',
    'Pretend nothing happened',
    'Give up immediately',
  ], 'Pause, accept what happened, then choose a wise next action', 'Stoicism is calm acceptance + wise action.', ['response'], {}));

  questions.push(makeMc('q5', 'Which is a helpful Stoic question to ask yourself?', [
    '“How can I control everyone?”',
    '“What part of this is up to me right now?”',
    '“How can I avoid learning?”',
    '“How can I make this last forever?”',
  ], '“What part of this is up to me right now?”', 'This separates controllable actions from uncontrollable events.', ['control_question'], {}));

  questions.push(makeMc('q6', 'Which is a strong example of self-control?', [
    'Saying the first thing that comes to mind',
    'Choosing to respond calmly even when annoyed',
    'Quitting when it is hard',
    'Blaming someone else for your choices',
  ], 'Choosing to respond calmly even when annoyed', 'Self-control is choosing your response.', ['self_control'], {}));

  questions.push(makeMc('q7', 'Which is a theme (message/lesson) consistent with Stoicism?', [
    'Always chase popularity',
    'Focus on character and right action, not outcomes you can’t control',
    'Never think about your choices',
    'Avoid all effort',
  ], 'Focus on character and right action, not outcomes you can’t control', 'Stoicism values character and wise action.', ['theme'], {}));

  questions.push(makeMc('q8', 'Which statement is MOST objective?', [
    'This philosophy is boring.',
    'The text encourages calm thinking and purposeful action.',
    'I hate this.',
    'Only weak people stay calm.',
  ], 'The text encourages calm thinking and purposeful action.', 'Objective statements avoid judgment words.', ['objective_summary'], {}));

  questions.push(makeMc('q9', 'Why might journaling help learning and self-control?', [
    'It replaces all action',
    'It helps you review patterns, remember lessons, and plan better choices',
    'It guarantees you will be perfect',
    'It makes other people agree with you',
  ], 'It helps you review patterns, remember lessons, and plan better choices', 'Writing helps memory and reflection.', ['journaling'], {}));

  questions.push(makeMc('q10', 'When something external goes wrong, what is the Stoic first step?', [
    'Control the external event',
    'Blame someone',
    'Notice your reaction and choose your response',
    'Ignore it forever',
  ], 'Notice your reaction and choose your response', 'You can’t control events, but you can control your response.', ['response'], {}));

  return { passPercent: 80, title: 'Meditations: Foundations', questions };
}

function quiz_book_as_a_man_thinketh_foundations(seed) {
  void seed;
  const questions = [];

  questions.push(makeMc('q1', 'What is the main idea of “thoughts -> habits -> outcomes”?', [
    'Thoughts do not matter at all',
    'What you repeatedly think can shape what you do and who you become',
    'Only luck determines results',
    'Habits are random',
  ], 'What you repeatedly think can shape what you do and who you become', 'Repeated thoughts influence choices and habits over time.', ['main_idea'], {}));

  questions.push(makeMc('q2', 'What is a habit?', [
    'A one-time event',
    'A repeated behavior that becomes easier over time',
    'A random accident',
    'A rule you never follow',
  ], 'A repeated behavior that becomes easier over time', 'Habits are repeated actions that become automatic.', ['habit'], {}));

  questions.push(makeMc('q3', 'What is a “replacement thought”?', [
    'Ignoring problems',
    'A better, more helpful thought you choose instead of a harmful one',
    'Pretending nothing matters',
    'Repeating insults',
  ], 'A better, more helpful thought you choose instead of a harmful one', 'Replacement thoughts support better actions.', ['replacement_thought'], {}));

  questions.push(makeMc('q4', 'Which is a negative thought pattern?', [
    'Planning steps for a goal',
    'Catastrophizing: “One mistake means I will fail forever.”',
    'Asking for feedback',
    'Studying consistently',
  ], 'Catastrophizing: “One mistake means I will fail forever.”', 'Catastrophizing turns a small problem into a huge story.', ['negative_thought'], {}));

  questions.push(makeMc('q5', 'Which action best supports a replacement thought?', [
    'Taking a small daily action that matches the thought',
    'Waiting forever',
    'Hiding your work',
    'Blaming others',
  ], 'Taking a small daily action that matches the thought', 'Thoughts become real through repeated actions.', ['habit_action'], {}));

  questions.push(makeMc('q6', 'Which statement is MOST objective?', [
    'This idea is obviously stupid.',
    'The text argues that thinking patterns affect behavior over time.',
    'I felt annoyed reading this.',
    'Only losers have habits.',
  ], 'The text argues that thinking patterns affect behavior over time.', 'Objective statements describe the text without insults/opinions.', ['objective_summary'], {}));

  questions.push(makeMc('q7', 'What is the difference between wishful thinking and a plan?', [
    'A plan includes steps and actions; wishful thinking is hoping without action',
    'They are the same',
    'Wishful thinking is always better',
    'Plans never work',
  ], 'A plan includes steps and actions; wishful thinking is hoping without action', 'Plans connect thoughts to behaviors.', ['planning'], {}));

  questions.push(makeMc('q8', 'Which is a strong piece of evidence that habits are changing?', [
    'A single good day',
    'A consistent streak of actions over time',
    'A rumor',
    'A feeling with no action',
  ], 'A consistent streak of actions over time', 'Consistency is evidence of habit formation.', ['evidence'], {}));

  questions.push(makeMc('q9', 'Which choice is most likely to improve results long-term?', [
    'Blaming luck for everything',
    'Practicing a helpful thought and action daily',
    'Avoiding feedback',
    'Quitting when it feels uncomfortable',
  ], 'Practicing a helpful thought and action daily', 'Daily repetition builds skill and habits.', ['growth'], {}));

  questions.push(makeMc('q10', 'What is a good next step after noticing a harmful thought?', [
    'Repeat it louder',
    'Write it down, challenge it, and replace it with a better thought',
    'Pretend it never happened',
    'Insult yourself',
  ], 'Write it down, challenge it, and replace it with a better thought', 'Awareness + replacement is a practical strategy.', ['replacement'], {}));

  return { passPercent: 80, title: 'As a Man Thinketh: Foundations', questions };
}

function quiz_language_pronouns_possessives(seed) {
  const rng = mulberry32(seed);
  const questions = [];

  questions.push(makeMc('q1', 'Choose the correct sentence:', [
    'Someone left their book on the desk.',
    'Someone left there book on the desk.',
    'Someone left they book on the desk.',
    'Someone left books on the desk.',
  ], 'Someone left their book on the desk.', 'Indefinite pronouns like "someone" use correct possessive forms.', ['pronoun_possessive'], {}));

  questions.push(makeMc('q2', 'Choose the correct singular possessive:', [
    'the boys hat',
    "the boy's hat",
    "the boys' hat",
    'the boy hat',
  ], "the boy's hat", 'Singular possessive: add apostrophe + s.', ['apostrophe_possessive'], {}));

  questions.push(makeMc('q3', 'Which sentence uses an indefinite pronoun correctly?', [
    'Anybody are welcome.',
    'Anybody is welcome.',
    'Anybodys welcome.',
    'Anybody were welcome.',
  ], 'Anybody is welcome.', 'Anybody/anyone/someone is singular here.', ['indefinite_pronoun_agreement'], {}));

  questions.push(makeMc('q4', 'Fix the error: "Each of the players forgot there water." Choose the best correction:', [
    'Each of the players forgot their water.',
    'Each of the players forgot there water.',
    'Each of the players forgot they water.',
    'Each of the players forgot the water.',
  ], 'Each of the players forgot their water.', '"There" is a place. "Their" shows ownership.', ['there_their'], {}));

  questions.push(makeMc('q5', 'Choose the correct possessive:', [
    "the dog's leash",
    "the dogs leash",
    "the dogs' leash",
    "the dog's' leash",
  ], "the dog's leash", 'Singular noun dog -> dog’s.', ['apostrophe_possessive'], {}));

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
  ], 'I finished my work and checked it twice.', 'Use a conjunction to combine without changing meaning.', ['sentence_combining'], {}));

  questions.push(makeMc('q2', 'Which sentence uses irregular past tense correctly?', [
    'He goed to the store.',
    'He went to the store.',
    'He goeded to the store.',
    'He go to the store yesterday.',
  ], 'He went to the store.', 'Irregular past tense of "go" is "went".', ['irregular_past_tense'], {}));

  questions.push(makeMc('q3', 'Combine for conciseness:\n"The test was hard. The test was long."', [
    'The test was hard and long.',
    'The test was hard. The test was long.',
    'Hard long test was.',
    'The test was and long hard.',
  ], 'The test was hard and long.', 'Remove repeated words and keep meaning.', ['sentence_combining'], {}));

  questions.push(makeMc('q4', 'Choose the correct past tense:', [
    'She run yesterday.',
    'She ran yesterday.',
    'She ranned yesterday.',
    'She running yesterday.',
  ], 'She ran yesterday.', 'Past tense of run is ran.', ['irregular_past_tense'], {}));

  questions.push(makeMc('q5', 'Which is the best combined sentence?\n"Marcus read the directions. Marcus followed them."', [
    'Marcus read the directions and followed them.',
    'Marcus read the directions. Marcus followed them.',
    'Marcus read the directions because followed them.',
    'Marcus read directions then Marcus then followed.',
  ], 'Marcus read the directions and followed them.', 'Combine and remove repetition.', ['sentence_combining'], {}));

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
  ], 'I bought apples, oranges, and bananas.', 'Use commas to separate items in a list.', ['commas_series'], {}));

  questions.push(makeMc('q2', 'Which transition best shows an example?', [
    'However',
    'For example',
    'Therefore',
    'Meanwhile',
  ], 'For example', 'For example introduces an example.', ['transitions_example'], {}));

  questions.push(makeMc('q3', 'Which sentence is more formal/objective?', [
    'This proves the author is totally right.',
    'This evidence supports the author’s claim.',
    'This is super obvious.',
    'I love this argument!',
  ], 'This evidence supports the author’s claim.', 'Formal/objective avoids emotional/judgment words.', ['formal_tone'], {}));

  questions.push(makeMc('q4', 'Where should the comma go? "After the test we went home."', [
    'After, the test we went home.',
    'After the test, we went home.',
    'After the, test we went home.',
    'No comma needed.',
  ], 'After the test, we went home.', 'Introductory phrase -> comma after it.', ['commas_intro_phrase'], {}));

  questions.push(makeMc('q5', 'Choose the best transition showing contrast:', [
    'Similarly',
    'However',
    'For instance',
    'As a result',
  ], 'However', 'However signals contrast.', ['transitions_contrast'], {}));

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
  book_1984_foundations: quiz_book_1984_foundations,
  book_animal_farm_foundations: quiz_book_animal_farm_foundations,
  book_anthem_foundations: quiz_book_anthem_foundations,
  book_alchemist_foundations: quiz_book_alchemist_foundations,
  book_richest_man_babylon_foundations: quiz_book_richest_man_babylon_foundations,
  book_meditations_foundations: quiz_book_meditations_foundations,
  book_as_a_man_thinketh_foundations: quiz_book_as_a_man_thinketh_foundations,
  language_pronouns_possessives: quiz_language_pronouns_possessives,
  language_sentence_combining_verb_tense: quiz_language_sentence_combining_verb_tense,
  language_commas_transitions_formal_tone: quiz_language_commas_transitions_formal_tone,
};

function buildQuiz(assignment, seed, options) {
  const quizId = assignment?.quizId;
  const builder = QUIZ_BUILDERS[quizId];
  if (!builder) {
    return { passPercent: assignment?.passPercent || 80, title: assignment?.title || 'Assignment', questions: [] };
  }
  const quiz = builder(seed, options);
  // Allow assignment to override pass percent.
  quiz.passPercent = Number(assignment?.passPercent || quiz.passPercent || 80);
  return quiz;
}

function buildPracticeQuiz(assignment, seed, options) {
  const desiredCount = 10;
  const combined = [];

  let title = '';
  let passPercent = Number(assignment?.passPercent || 80);

  // Reuse existing quiz builder(s) to produce a consistent-sized practice set.
  // Some reading/language quizzes are shorter than 10 questions, so we combine
  // multiple runs with different seeds until we hit the target.
  for (let i = 0; i < 5 && combined.length < desiredCount; i++) {
    const quiz = buildQuiz(assignment, (Number(seed) + i) >>> 0, options);
    if (!title) title = String(quiz?.title || '');
    if (!Number.isFinite(passPercent)) passPercent = Number(quiz?.passPercent || 80);

    const qs = Array.isArray(quiz?.questions) ? quiz.questions : [];
    for (const q of qs) combined.push(q);
  }

  const baseTitle = title || assignment?.title || 'Assignment';
  const questions = combined.slice(0, desiredCount).map((q, idx) => ({ ...q, id: `q${idx + 1}` }));

  return { passPercent, title: `Practice: ${baseTitle}`, questions };
}

function buildDailyWarmupQuiz(seed) {
  const desiredCount = 8;
  const rng = mulberry32(seed);

  // Mix a few core math skills so the warmup stays broad.
  const candidateQuizIds = [
    'math_fractions_number_line',
    'math_equivalent_fractions',
    'math_place_value_expanded_form',
    'math_factors_primes_multiples',
    'math_order_of_operations_exponents',
    'math_translate_and_parts_of_expression',
    'math_evaluate_expressions_and_combine_like_terms',
    'math_one_step_two_step_equations',
  ];

  const picks = shuffle(rng, candidateQuizIds).slice(0, 4);
  const combined = [];

  for (let i = 0; i < picks.length && combined.length < desiredCount; i++) {
    const quizId = picks[i];
    const builder = QUIZ_BUILDERS[quizId];
    if (!builder) continue;
    const quiz = builder((Number(seed) + i) >>> 0, {});
    const qs = Array.isArray(quiz?.questions) ? quiz.questions : [];
    for (let j = 0; j < qs.length && combined.length < desiredCount; j++) {
      combined.push(qs[j]);
    }
  }

  const questions = combined.slice(0, desiredCount).map((q, idx) => ({ ...q, id: `q${idx + 1}` }));
  return { passPercent: 80, title: 'Daily Warm-up', questions };
}

function buildDailyAiQuiz(seed) {
  const desiredCount = 6;
  const rng = mulberry32(seed);

  const pool = [
    {
      prompt: 'Which prompt is MOST likely to get a high-quality answer?',
      choices: [
        'Help me with math.',
        'Explain fractions.',
        'I am in 6th grade. Teach me equivalent fractions with 2 examples, then give me 3 practice problems with answers.',
        'Fractions are confusing.',
      ],
      answer: 'I am in 6th grade. Teach me equivalent fractions with 2 examples, then give me 3 practice problems with answers.',
      explanation: 'Good prompts include context, what you want, and a clear output request.',
      tags: ['prompt_specificity'],
    },
    {
      prompt: 'What is the BEST way to make an AI answer easier to check?',
      choices: [
        'Ask it to be creative.',
        'Ask it to answer in a specific format (like JSON or a numbered list).',
        'Ask it to use long explanations.',
        'Ask it to guess if unsure.',
      ],
      answer: 'Ask it to answer in a specific format (like JSON or a numbered list).',
      explanation: 'A fixed format reduces ambiguity and makes checking easier.',
      tags: ['output_format'],
    },
    {
      prompt: 'If the AI gives an incorrect math step, what should you do first?',
      choices: [
        'Assume it is right and move on.',
        'Ask it to show each step and explain why each step is valid.',
        'Ask it to use bigger numbers.',
        'Try a different font.',
      ],
      answer: 'Ask it to show each step and explain why each step is valid.',
      explanation: 'Step-by-step reasoning helps you find where the mistake happened.',
      tags: ['debugging_steps'],
    },
    {
      prompt: 'Which request reduces “hallucinations” the most?',
      choices: [
        'Give me anything you think is correct.',
        'If you are not sure, say “I do not know” and ask me a question.',
        'Answer quickly.',
        'Do not use math.',
      ],
      answer: 'If you are not sure, say “I do not know” and ask me a question.',
      explanation: 'Encouraging uncertainty and questions reduces guessing.',
      tags: ['uncertainty'],
    },
    {
      prompt: 'What is a “test case” when using AI to help with coding/math?',
      choices: [
        'A random guess.',
        'A specific example input with an expected output to verify correctness.',
        'A longer prompt.',
        'A way to make the answer sound smarter.',
      ],
      answer: 'A specific example input with an expected output to verify correctness.',
      explanation: 'Test cases let you verify the result matches what should happen.',
      tags: ['testing'],
    },
    {
      prompt: 'Best practice when asking for help fixing a bug is to include:',
      choices: [
        'Only the final error message.',
        'A clear description, steps to reproduce, and the smallest code example.',
        'No details so the AI can explore freely.',
        'A screenshot only.',
      ],
      answer: 'A clear description, steps to reproduce, and the smallest code example.',
      explanation: 'Repro steps and minimal code make debugging accurate and fast.',
      tags: ['bug_reports'],
    },
    {
      prompt: 'If you want the AI to generate practice problems at your level, you should say:',
      choices: [
        'Make it hard.',
        'Make it easy.',
        'I am in grade 6. Give me 10 problems on equivalent fractions with answers. Start easy and get harder.',
        'Fractions.',
      ],
      answer: 'I am in grade 6. Give me 10 problems on equivalent fractions with answers. Start easy and get harder.',
      explanation: 'Level + quantity + topic + difficulty ramp makes the result match your need.',
      tags: ['difficulty'],
    },
    {
      prompt: 'Which tool is BEST for quickly checking if your website login flow works end-to-end?',
      choices: [
        'A browser automation test (Playwright).',
        'A random number generator.',
        'A spreadsheet.',
        'A screenshot.',
      ],
      answer: 'A browser automation test (Playwright).',
      explanation: 'Automation can click and verify real UI behavior repeatedly.',
      tags: ['tools'],
    },
  ];

  const picks = shuffle(rng, pool).slice(0, desiredCount);
  const questions = picks.map((q, idx) => makeMc(
    `q${idx + 1}`,
    q.prompt,
    q.choices,
    q.answer,
    q.explanation,
    q.tags,
    {}
  ));

  return { passPercent: 80, title: 'AI Co-Learning Quiz', questions };
}

window.BRADY_QUIZ = {
  buildQuiz,
  buildPracticeQuiz,
  buildDailyWarmupQuiz,
  buildDailyAiQuiz,
  mulberry32,
};
