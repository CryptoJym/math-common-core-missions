/**
 * Brady-only assignment templates.
 *
 * These are lesson "blueprints" based on skills marked "ready to DEVELOP"
 * in Brady Hyro's Student Profile PDF (2/11/2026 export).
 *
 * Notes:
 * - We do NOT store the PDF or personal identifiers in the website.
 * - We DO store Brady's progress/notes privately in Supabase tables protected by RLS.
 */

const BRADY_ASSIGNMENTS = [
  {
    id: 'math_fractions_number_line',
    subject: 'math',
    priority: 10,
    quizId: 'math_fractions_number_line',
    passPercent: 80,
    title: 'Fractions on a Number Line (Proper Fractions)',
    standards: ['3.NF.2.b'],
    band: '201-210',
    learningTargets: [
      'Split 0 to 1 into equal parts and label each tick mark.',
      'Locate non-unit proper fractions like 3/5 or 7/8 on a number line.',
      'Explain why the point is correct (units, not guessing).',
    ],
    practicePlan: [
      'Draw a number line from 0 to 1. Partition it into b equal parts for the fraction a/b.',
      'Label all tick marks (0/ b, 1/ b, 2/ b, ...).',
      'Do 10 problems. Check each by asking: "Did I make exactly b equal parts?"',
    ],
    masteryCheck: [
      'Accurately place 8/10, 3/4, 5/6, 2/3 on a number line without help.',
      'Explain in 1-2 sentences how you know each point is correct.',
    ],
    ai: {
      chatgpt_web: [
        'You are my tutor. Teach me how to plot a/b on a number line using equal partitions.',
        'Then give me 12 practice problems. For each problem: wait for my answer before revealing the correct location.',
        'If I make a mistake, diagnose the exact mistake (wrong number of partitions, counting wrong, etc.) and give 2 similar problems.',
      ].join('\n'),
      codex_cli: [
        'Write a small Python script that generates random proper fractions a/b (b up to 12),',
        'prints an ASCII number line, and asks me to type which tick mark (0..b) matches a/b.',
        'Add answer checking + a summary of my accuracy.',
      ].join('\n'),
      claude_code: [
        'Review my fraction-number-line practice script. Improve feedback messages so it tells me',
        'exactly what I did wrong and how to fix it. Add unit tests for the answer checker.',
      ].join('\n'),
    },
  },
  {
    id: 'math_equivalent_fractions',
    subject: 'math',
    priority: 20,
    quizId: 'math_equivalent_fractions',
    passPercent: 80,
    title: 'Equivalent Fractions',
    standards: ['3.NF.3.a'],
    band: '201-210',
    learningTargets: [
      'Recognize that two fractions are equivalent if they land on the same point on a number line.',
      'Generate equivalent fractions by multiplying numerator and denominator by the same number.',
      'Simplify fractions by dividing numerator and denominator by the same number.',
    ],
    practicePlan: [
      'Use a number line or area model (rectangle) to SEE equivalence first.',
      'Then practice the rule: a/b = (a*k)/(b*k).',
      'Do 15 comparisons: which is bigger, smaller, or equal?',
    ],
    masteryCheck: [
      'Correctly identify if 3/4 = 6/8, 2/3 = 8/12, 5/10 = 1/2 (and explain why).',
      'Simplify 8/12, 15/20, 18/24 to simplest form.',
    ],
    ai: {
      chatgpt_web: [
        'Teach me equivalent fractions using number lines first (not just rules).',
        'Then give me 10 problems where I must decide if two fractions are equivalent.',
        'After each answer, ask me to explain my reasoning in one sentence.',
      ].join('\n'),
      codex_cli: [
        'Create a Python quiz that shows two fractions and asks: equal / left is bigger / right is bigger.',
        'Include a "show work" mode that prints a common denominator comparison.',
      ].join('\n'),
      claude_code: [
        'Improve my fraction comparison quiz: add support for reducing fractions by gcd,',
        'add tests for edge cases, and make sure it never generates invalid fractions.',
      ].join('\n'),
    },
  },
  {
    id: 'math_place_value_expanded_form',
    subject: 'math',
    priority: 30,
    quizId: 'math_place_value_expanded_form',
    passPercent: 80,
    title: 'Place Value + Expanded Form',
    standards: ['4.NBT.1', '4.NBT.2'],
    band: '201-210',
    learningTargets: [
      'Explain how moving a digit one place left multiplies its value by 10.',
      'Read and write multi-digit numbers in word form.',
      'Write multi-digit numbers in expanded form.',
      'Compare and order whole numbers using >, <, =.',
    ],
    practicePlan: [
      'Practice 5 numbers per day: say it, write it, expand it.',
      'Do "digit value" drills: In 507,432 what is the value of 7?',
      'Do 10 compare/order problems (largest to smallest).',
    ],
    masteryCheck: [
      'Write 3 numbers in expanded form correctly.',
      'Compare 5 pairs of numbers correctly and explain the place-value reason.',
    ],
    ai: {
      chatgpt_web: [
        'Quiz me on place value and expanded form.',
        'Give me a number and ask for: word form, expanded form, and value of an underlined digit.',
        'After each answer, correct me and explain the correction.',
      ].join('\n'),
      codex_cli: [
        'Write a Python script that generates random 6-digit numbers and quizzes:',
        '(1) value of a digit, (2) expanded form, (3) compare two numbers.',
      ].join('\n'),
      claude_code: [
        'Review my place-value quiz script and make the answer checking strict but fair.',
        'Add unit tests for expanded-form parsing.',
      ].join('\n'),
    },
  },
  {
    id: 'math_factors_primes_multiples',
    subject: 'math',
    priority: 40,
    quizId: 'math_factors_primes_multiples',
    passPercent: 80,
    title: 'Factors, Multiples, Prime vs Composite',
    standards: ['4.OA.4'],
    band: '211-220',
    learningTargets: [
      'List all factor pairs for numbers 1–100.',
      'Decide if a number is prime or composite.',
      'Decide if a number is a multiple of a one-digit number.',
    ],
    practicePlan: [
      'Make a factor-pair table for 1–50.',
      'Practice 10 quick checks: "Is 48 a multiple of 6? Why?"',
      'Practice prime/composite with reasoning (not memorization).',
    ],
    masteryCheck: [
      'Find all factor pairs for 36 and 48.',
      'Correctly label 29, 39, 49 as prime/composite with reasoning.',
    ],
    ai: {
      chatgpt_web: [
        'Teach me a fast method to find factor pairs and decide prime vs composite.',
        'Then quiz me with 15 numbers. For each number, ask for factors + prime/composite.',
      ].join('\n'),
      codex_cli: [
        'Build a Python drill that picks a number 2–100 and asks for factor pairs.',
        'Show the correct list after I answer, and track accuracy over time.',
      ].join('\n'),
      claude_code: [
        'Improve my factors drill: add input parsing (like "1x36, 2x18, 3x12, 4x9, 6x6"),',
        'and add tests for correctness and duplicate pair handling.',
      ].join('\n'),
    },
  },
  {
    id: 'math_order_of_operations_exponents',
    subject: 'math',
    priority: 50,
    quizId: 'math_order_of_operations_exponents',
    passPercent: 80,
    title: 'Order of Operations (Parentheses + Exponents)',
    standards: ['5.OA.1', '6.EE.1'],
    band: '211-220',
    learningTargets: [
      'Evaluate expressions with parentheses.',
      'Evaluate expressions with whole-number exponents.',
      'Apply order of operations consistently.',
    ],
    practicePlan: [
      'Do 10 expressions per session.',
      'Write each step on a new line so mistakes are visible.',
      'Estimate first: is the final answer roughly the right size?',
    ],
    masteryCheck: [
      'Solve 8 expressions correctly, including at least 2 with exponents.',
    ],
    ai: {
      chatgpt_web: [
        'Quiz me on order of operations including parentheses and exponents.',
        'For each problem: ask me for the next step only (not the final answer), then continue.',
      ].join('\n'),
      codex_cli: [
        'Write a Python generator that outputs expressions with + - * / parentheses and ** exponents.',
        'Have it check my typed answer using Python eval safely and show a step-by-step solution.',
      ].join('\n'),
      claude_code: [
        'Make my expression generator safe: no arbitrary eval of user input.',
        'Add tests and clear step-by-step explanations for wrong answers.',
      ].join('\n'),
    },
  },
  {
    id: 'math_translate_and_parts_of_expression',
    subject: 'math',
    priority: 60,
    quizId: 'math_translate_and_parts_of_expression',
    passPercent: 80,
    title: 'Translate Words ↔ Expressions + Identify Parts',
    standards: ['6.EE.2.a', '6.EE.2.b'],
    band: '211-220',
    learningTargets: [
      'Translate verbal statements into algebraic expressions.',
      'Identify sum, term, product, factor, quotient, coefficient.',
    ],
    practicePlan: [
      'Translate 12 phrases into expressions.',
      'Label the parts: underline terms, circle coefficients.',
    ],
    masteryCheck: [
      'Translate 8 phrases correctly and label parts for 4 expressions.',
    ],
    ai: {
      chatgpt_web: [
        'Give me 12 short word phrases to translate into algebraic expressions.',
        'After each, ask me to label coefficient/terms.',
      ].join('\n'),
      codex_cli: [
        'Write a Python script that prints a random phrase like "3 more than 2x" and asks for the expression.',
        'Then it checks against a set of acceptable answers (like 2*x+3, 3+2*x).',
      ].join('\n'),
      claude_code: [
        'Improve my translation checker: accept equivalent forms, detect common mistakes,',
        'and add unit tests for multiple acceptable answers.',
      ].join('\n'),
    },
  },
  {
    id: 'math_evaluate_expressions_and_combine_like_terms',
    subject: 'math',
    priority: 70,
    quizId: 'math_evaluate_expressions_and_combine_like_terms',
    passPercent: 80,
    title: 'Evaluate Expressions + Combine Like Terms',
    standards: ['6.EE.2.c', '6.EE.3', '7.EE.1'],
    band: '211-220',
    learningTargets: [
      'Evaluate expressions at given values.',
      'Combine like terms to simplify expressions.',
    ],
    practicePlan: [
      'Do 8 evaluation problems (plug in x=...).',
      'Do 8 simplify problems (combine like terms).',
      'Explain why terms are "like" (same variable + same exponent).',
    ],
    masteryCheck: [
      'Simplify 6 expressions correctly and evaluate 4 expressions correctly.',
    ],
    ai: {
      chatgpt_web: [
        'Teach me combining like terms with examples and a rule.',
        'Then give me 10 problems mixing simplify + evaluate.',
      ].join('\n'),
      codex_cli: [
        'Write a Python drill that generates expressions like 3x + 2x - 4 + 7 and asks me to simplify.',
        'Also generate evaluate problems with x=... and check the result.',
      ].join('\n'),
      claude_code: [
        'Make the drill smarter: provide targeted feedback (e.g., "you combined x and x^2 incorrectly").',
        'Add unit tests for simplification and evaluation.',
      ].join('\n'),
    },
  },
  {
    id: 'math_one_step_two_step_equations',
    subject: 'math',
    priority: 80,
    quizId: 'math_one_step_two_step_equations',
    passPercent: 80,
    title: 'One-Step and Two-Step Linear Equations',
    standards: ['6.EE.7', '7.EE.4.a'],
    band: '211-220',
    learningTargets: [
      'Write an equation from a word problem.',
      'Solve x + a = b and ax = b.',
      'Solve px + q = r (two-step).',
    ],
    practicePlan: [
      'Solve 10 equations: 5 one-step, 5 two-step.',
      'For word problems: define the variable in a sentence first.',
    ],
    masteryCheck: [
      'Solve 8 equations correctly, including 2 word problems.',
    ],
    ai: {
      chatgpt_web: [
        'Generate 10 equation problems for me (mix one-step and two-step).',
        'For each: let me answer; then show the steps and ask me to explain the inverse operations.',
      ].join('\n'),
      codex_cli: [
        'Write a Python worksheet generator that creates random one-step and two-step equations',
        'with integer solutions and prints an answer key.',
      ].join('\n'),
      claude_code: [
        'Review my worksheet generator: ensure solutions are always integers, add tests,',
        'and add a "hint mode" that shows the next inverse operation only.',
      ].join('\n'),
    },
  },
  {
    id: 'math_proportions_and_slope',
    subject: 'math',
    priority: 90,
    quizId: 'math_proportions_and_slope',
    passPercent: 80,
    title: 'Proportional Relationships + Slope (y = mx)',
    standards: ['6.EE.9', '8.EE.5'],
    band: '211-220',
    learningTargets: [
      'Represent a proportional relationship as table, graph, equation, and words.',
      'Interpret unit rate as slope.',
      'Write y = mx from a table or two points.',
    ],
    practicePlan: [
      'Do 6 problems: table → equation.',
      'Do 6 problems: equation → table.',
      'Do 4 problems: compare two rates and decide which is faster.',
    ],
    masteryCheck: [
      'Write y=mx correctly from 3 tables.',
      'Compare 2 relationships and justify with unit rate.',
    ],
    ai: {
      chatgpt_web: [
        'Teach me proportional relationships and slope using unit rate.',
        'Then give me 12 problems converting between table/graph/equation/words.',
      ].join('\n'),
      codex_cli: [
        'Write a Python script that generates proportional tables and asks me to find m and write y=mx.',
        'Include a simple ASCII plot option.',
      ].join('\n'),
      claude_code: [
        'Improve the proportional-relationships script: add robust answer checking,',
        'and add tests that confirm m is computed correctly from tables.',
      ].join('\n'),
    },
  },
  {
    id: 'math_solutions_of_linear_equations',
    subject: 'math',
    priority: 100,
    quizId: 'math_solutions_of_linear_equations',
    passPercent: 80,
    title: 'How Many Solutions Does a Linear Equation Have?',
    standards: ['8.EE.7.a', '8.EE.7.b'],
    band: '211-220',
    learningTargets: [
      'Recognize equations with one solution, infinitely many solutions, or no solutions.',
      'Solve multi-step linear equations with rational coefficients.',
    ],
    practicePlan: [
      'Do 6 classification problems (one/infinitely many/none).',
      'Do 6 multi-step solve problems.',
    ],
    masteryCheck: [
      'Correctly classify 6 equations and solve 4 multi-step equations.',
    ],
    ai: {
      chatgpt_web: [
        'Give me 10 equations. For each: ask me to simplify and decide if it has one solution, no solutions, or infinitely many.',
        'Then ask me to solve it if it has one solution.',
      ].join('\n'),
      codex_cli: [
        'Write a Python script that generates equations that simplify to x=a, a=a, or a=b.',
        'Have it quiz me and explain the result.',
      ].join('\n'),
      claude_code: [
        'Review my script: ensure it generates correct categories (x=a, a=a, a=b).',
        'Add tests and better explanations for each category.',
      ].join('\n'),
    },
  },
  {
    id: 'reading_literary_structure_pov',
    subject: 'reading',
    priority: 110,
    quizId: 'reading_literary_structure_pov',
    passPercent: 80,
    title: 'Literary Structure + Point of View',
    standards: ['3.R.10', '4.R.10', '4.R.11'],
    band: '191-200',
    learningTargets: [
      'Identify chapter/scene/stanza and what it contributes.',
      'Identify first-person vs third-person narration.',
      "Explain how the narrator's point of view changes what you learn.",
      'Understand basic poetry characteristics (stanza, line, rhyme, imagery).',
    ],
    practicePlan: [
      'Read 1 short chapter/section from your current book.',
      'Write 3 bullets: structure, narrator POV, and why it matters.',
      'Find 1 paragraph and explain what it adds (plot/meaning).',
    ],
    masteryCheck: [
      'Correctly label POV and structure for 2 passages you read.',
      'Write a 5-sentence summary that mentions POV and structure.',
    ],
    ai: {
      chatgpt_web: [
        'I am reading a chapter from my book. Ask me questions to identify point of view and structure.',
        'Then help me write a 5-sentence summary that is objective and accurate.',
      ].join('\n'),
      codex_cli: [
        'Help me write a simple markdown template I can reuse for every chapter:',
        'POV, structure, key events, 2 quotes, and reflection questions.',
      ].join('\n'),
      claude_code: [
        'Create a small script that takes my markdown chapter notes and outputs a clean summary + 3 study questions.',
        'Then improve it to avoid spoilers and keep it objective.',
      ].join('\n'),
    },
  },
  {
    id: 'reading_theme_and_summary',
    subject: 'reading',
    priority: 120,
    quizId: 'reading_theme_and_summary',
    passPercent: 80,
    title: 'Theme + Objective Summary (Literary + Informational)',
    standards: ['6.R.6', '7-8.R.6'],
    band: '191-200',
    learningTargets: [
      'Determine the theme or main idea.',
      'Explain how details support it.',
      'Write an objective summary (no opinions mixed in).',
    ],
    practicePlan: [
      'After reading, write: theme/main idea in 1 sentence.',
      'List 3 supporting details.',
      'Write a 6-sentence summary using at least 3 details.',
    ],
    masteryCheck: [
      'Write a theme/main idea with 3 correct supporting details from your reading.',
      'Write an objective summary that stays factual.',
    ],
    ai: {
      chatgpt_web: [
        'Coach me to find the theme (not just a topic). Ask me for 3 details from the text.',
        'Then help me rewrite my summary so it is objective and uses those details.',
      ].join('\n'),
      codex_cli: [
        'Design a checklist I can run on my own summaries: objective? includes 3 details? mentions theme/main idea?',
      ].join('\n'),
      claude_code: [
        'Turn that checklist into a small script that scores my summary 0-10 and explains why.',
      ].join('\n'),
    },
  },
  {
    id: 'reading_informational_text_claims_structure',
    subject: 'reading',
    priority: 130,
    quizId: 'reading_informational_text_claims_structure',
    passPercent: 80,
    title: 'Informational Text: Structure, Purpose, Claims, Evidence',
    standards: ['7-8.R.11', '7-8.R.13'],
    band: '201-210',
    learningTargets: [
      'Identify headings/subsections and why they exist.',
      "Determine an author's purpose and viewpoint.",
      'Find claims and the evidence that supports them.',
      'Judge whether evidence is relevant and sufficient.',
    ],
    practicePlan: [
      'Pick a short article (science, history, or current events).',
      'Write: purpose (1 sentence), 2 claims, and evidence for each.',
      'Label the text structure (compare/contrast, cause/effect, problem/solution).',
    ],
    masteryCheck: [
      'Correctly identify 2 claims and evidence from a real article you read.',
      'Explain in 2-3 sentences whether the evidence was strong and why.',
    ],
    ai: {
      chatgpt_web: [
        'I will paste 1-2 paragraphs from an informational article.',
        'Help me identify: (1) author purpose, (2) claims, (3) evidence, (4) text structure.',
        'Then quiz me with 3 follow-up questions.',
      ].join('\n'),
      codex_cli: [
        'Help me build a reusable "claim/evidence" table template (markdown) and a scoring rubric.',
      ].join('\n'),
      claude_code: [
        'Write a script that turns my claim/evidence table into flashcards (Q/A).',
      ].join('\n'),
    },
  },
  {
    id: 'reading_vocabulary_context_roots',
    subject: 'reading',
    priority: 140,
    quizId: 'reading_vocabulary_context_roots',
    passPercent: 80,
    title: 'Vocabulary: Context Clues, Figurative Language, Roots',
    standards: ['3.R.9', '4.R.9', '11-12.R.8', '11-12.R.9.b'],
    band: '201-210',
    learningTargets: [
      'Use sentence and paragraph context to determine word meaning.',
      'Choose the correct meaning for multiple-meaning words based on context.',
      'Identify figurative language and how it affects tone.',
      'Use Greek/Latin roots and reference tools (dictionary/glossary).',
    ],
    practicePlan: [
      'Pick 8 unfamiliar words from your reading.',
      'For each: guess from context, then confirm with a dictionary.',
      'Mark: literal vs figurative usage and what it does to tone.',
    ],
    masteryCheck: [
      'Accurately define 8 words using context + confirmation.',
      'Explain 2 examples of figurative language and how it impacts tone/mood.',
    ],
    ai: {
      chatgpt_web: [
        'I will paste 5 sentences from what I read (no spoilers).',
        'Help me identify unknown words and use context clues to infer meaning.',
        'Then give me 5 new sentences that use those words correctly.',
      ].join('\n'),
      codex_cli: [
        'Create a personal vocabulary CSV template (word, guessed meaning, confirmed meaning, root/affix, example sentence).',
      ].join('\n'),
      claude_code: [
        'Write a small script that reads my vocab CSV and quizzes me (definition -> word, and word -> definition).',
      ].join('\n'),
    },
  },
  {
    id: 'language_pronouns_possessives',
    subject: 'language',
    priority: 150,
    quizId: 'language_pronouns_possessives',
    passPercent: 80,
    title: 'Grammar: Pronouns + Singular Possessive Nouns',
    standards: ['1.W.1.a', '1.W.2.a', '1.W.3.a'],
    band: '201-210',
    learningTargets: [
      'Use indefinite pronouns correctly (someone, anyone, nobody, etc.).',
      "Use singular possessive nouns correctly (the boy's hat).",
    ],
    practicePlan: [
      'Write 10 sentences using an indefinite pronoun.',
      'Write 10 sentences with singular possessives (use apostrophes correctly).',
      'Edit 10 sentences: find and fix pronoun/possessive mistakes.',
    ],
    masteryCheck: [
      'Edit a short paragraph and correct all pronoun/possessive errors.',
    ],
    ai: {
      chatgpt_web: [
        'Create a short paragraph with 10 grammar mistakes related to indefinite pronouns and singular possessives.',
        'Then let me edit it. After I respond, show the corrected paragraph and explain each fix.',
      ].join('\n'),
      codex_cli: [
        'Help me create a daily 5-minute grammar drill format (prompt + answer key) I can reuse.',
      ].join('\n'),
      claude_code: [
        'Turn my grammar drill format into a script that prints one drill per day and stores my answers in a file.',
      ].join('\n'),
    },
  },
  {
    id: 'language_sentence_combining_verb_tense',
    subject: 'language',
    priority: 160,
    quizId: 'language_sentence_combining_verb_tense',
    passPercent: 80,
    title: 'Sentence Combining + Verb Tense',
    standards: ['2.W.1.a', '2.W.2.a', '2.W.3.a'],
    band: '201-210',
    learningTargets: [
      'Combine multiple sentences into one sentence with the same meaning.',
      'Combine for concise expression (avoid repetition).',
      'Recognize and correct irregular past tense errors.',
    ],
    practicePlan: [
      'Take 8 pairs of sentences and combine them in two different ways.',
      'Underline verbs and confirm tense is correct (especially irregular verbs).',
    ],
    masteryCheck: [
      'Correctly combine 6 sentence pairs and fix verb tense errors.',
    ],
    ai: {
      chatgpt_web: [
        'Give me 10 sentence pairs to combine into one sentence.',
        'Include some with irregular past tense mistakes for me to correct.',
        'After each answer, show 2 alternative combinations and explain why they work.',
      ].join('\n'),
      codex_cli: [
        'Create a simple text file template where I can paste sentence pairs and write my combined version.',
      ].join('\n'),
      claude_code: [
        'Write a script that reads my sentence-combining practice file and highlights repeated words',
        'and suggests a more concise rewrite (without changing meaning).',
      ].join('\n'),
    },
  },
  {
    id: 'language_commas_transitions_formal_tone',
    subject: 'language',
    priority: 170,
    quizId: 'language_commas_transitions_formal_tone',
    passPercent: 80,
    title: 'Writing: Commas, Transitions, Formal Tone',
    standards: ['6.W.3.e', '7-8.W.1.c', '11-12.W.1.c', '11-12.W.1.d'],
    band: '201-210',
    learningTargets: [
      'Use commas correctly (series, nonrestrictive clauses, appositives).',
      'Use transitional words/phrases to clarify relationships.',
      'Maintain formal style / objective tone when needed.',
    ],
    practicePlan: [
      'Write 1 short paragraph (5-7 sentences) with: 1 appositive, 1 series, 2 transitions.',
      'Revise it to be more formal and objective.',
    ],
    masteryCheck: [
      'Edit a paragraph and correctly fix comma errors and weak transitions.',
    ],
    ai: {
      chatgpt_web: [
        'I will paste my paragraph. Fix only commas and transitions first, and explain each fix.',
        'Then rewrite it in a more formal, objective tone without changing meaning.',
      ].join('\n'),
      codex_cli: [
        'Help me build a checklist for editing: commas, transitions, tone, repetition, clarity.',
      ].join('\n'),
      claude_code: [
        'Turn my editing checklist into a reusable prompt file and a small script that prints it before I write.',
      ].join('\n'),
    },
  },
];

window.BRADY_ASSIGNMENTS = BRADY_ASSIGNMENTS;
