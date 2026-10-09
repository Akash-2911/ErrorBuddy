import type { BuddyError, BuddyResponse, Explainer, RealPersonality } from '../types';

/** What a template gets to work with. */
export interface ErrorContext {
  /** The thing the error is about, e.g. `userName` or `)`. Empty if we couldn't find one. */
  subject: string;
  line: number;
  fileName: string;
  /** The compiler's own guess, from "Did you mean 'x'?". Empty if there isn't one. */
  suggestion: string;
}

type Template = (c: ErrorContext) => string;

interface ErrorCategory {
  id: string;
  matches: (e: BuddyError) => boolean;
  /** Pulls the interesting name/token out of the message. */
  subject: (e: BuddyError) => string;
  /** Short noun phrase for celebrations, e.g. "the undefined `userName`". */
  short: Template;
  explanation: Template;
  fix: (c: ErrorContext) => string[];
  /** Dark-humour roasts, a few words each. */
  roasts: Template[];
}

/** First thing in quotes in the message: 'x', "x" or `x`. */
function quoted(message: string): string {
  const m = message.match(/['"`]([^'"`]+)['"`]/);
  return m ? m[1] : '';
}

/** The name sitting at the error's column, read from the numbered snippet (e.g. `score` in `score();`). */
function wordAtError(e: BuddyError): string {
  const row = e.snippet.split('\n').find((l) => l.trimStart().startsWith(`${e.line} |`));
  if (!row) return '';
  const text = row.slice(row.indexOf('|') + 2);
  return text.slice(Math.max(0, e.column - 1)).match(/^[A-Za-z_$][\w$.]*/)?.[0] ?? '';
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** `name`, or a stand-in when we couldn't find one. */
function code(subject: string, otherwise = 'that'): string {
  return subject ? `\`${subject}\`` : otherwise;
}

const CATEGORIES: ErrorCategory[] = [
  {
    id: 'undefined-name',
    matches: (e) => /Cannot find name|is not defined/i.test(e.message) || e.code === '2304',
    subject: (e) => quoted(e.message) || (e.message.match(/^(\S+) is not defined/)?.[1] ?? ''),
    short: (c) => `the undefined ${code(c.subject, 'name')}`,
    explanation: (c) =>
      `You used the name ${code(c.subject, 'something')} but never created it first. ` +
      `It's like asking a friend to pass you a box that nobody ever put on the table.`,
    fix: (c) => [
      c.suggestion
        ? `On line ${c.line}, change ${code(c.subject, 'the name')} to \`${c.suggestion}\` so it matches the name you created (capital letters count).`
        : `Check the spelling of ${code(c.subject, 'the name')} on line ${c.line}: it must match exactly where you created it (capital letters count).`,
      `If you never created it, add a line above like \`const ${c.subject || 'myThing'} = ...;\` before you use it.`,
    ],
    roasts: [
      (c) => `${code(c.subject, 'It')} was never born. Lucky.`,
      (c) => `Calling ${code(c.subject, 'the dead')}. Nobody answers.`,
      () => `Ghost name. Ghost career.`,
    ],
  },
  {
    id: 'not-a-function',
    matches: (e) => /is not a function|is not callable|not callable/i.test(e.message) || e.code === '2349',
    // TS says "This expression is not callable. Type 'Number'...", so the name comes from the code, not the message.
    subject: (e) => e.message.match(/^(\S+) is not a function/)?.[1] ?? (wordAtError(e) || quoted(e.message)),
    short: (c) => `the not-a-function ${code(c.subject, 'call')}`,
    explanation: (c) =>
      `You put \`()\` after ${code(c.subject, 'something')}, which means "do this action", but it's a plain value, not an action. ` +
      `It's like trying to press "play" on a photo.`,
    fix: (c) => [
      `On line ${c.line}, check what ${code(c.subject, 'this thing')} actually holds: if it's just a value, remove the \`()\` after it.`,
      `If you meant to call a function, check you spelled its name right and that it's really a function.`,
    ],
    roasts: [
      (c) => `Calling ${code(c.subject, 'a corpse')}. It won't get up.`,
      () => `It's a value, not a séance.`,
    ],
  },
  {
    id: 'nothing-there',
    matches: (e) => /Cannot read propert|possibly 'undefined'|possibly 'null'|possibly undefined|possibly null|Object is possibly/i.test(e.message),
    subject: (e) => e.message.match(/reading '([^']+)'/)?.[1] ?? quoted(e.message),
    short: (c) => `the maybe-empty ${code(c.subject, 'value')}`,
    explanation: (c) =>
      `You tried to look inside ${code(c.subject, 'something')}, but it might be empty (nothing there at all). ` +
      `It's like reaching into a drawer that might not exist.`,
    fix: (c) => [
      `On line ${c.line}, make sure ${code(c.subject, 'the value')} actually has something in it before you use it.`,
      `Or guard it: write \`?.\` instead of \`.\` (for example \`thing?.name\`) so it safely gives back nothing instead of crashing.`,
    ],
    roasts: [
      () => `Empty coffin. Like your head.`,
      (c) => `${code(c.subject, 'It')} might be empty. So might your future.`,
    ],
  },
  {
    id: 'no-such-property',
    matches: (e) => /Property '.+' does not exist on type/i.test(e.message) || e.code === '2339',
    subject: (e) => quoted(e.message),
    short: (c) => `the missing property ${code(c.subject, '')}`.trim(),
    explanation: (c) =>
      `You asked for ${code(c.subject, 'a part')} on something that doesn't have that part. ` +
      `It's like asking a bicycle for its steering wheel.`,
    fix: (c) => [
      `On line ${c.line}, check the spelling of ${code(c.subject, 'the property name')} (capital letters count).`,
      `If it really should be there, add it where the object is created.`,
    ],
    roasts: [
      (c) => `${code(c.subject, 'That')} doesn't exist. Neither does your talent.`,
      () => `Digging for parts that were never buried.`,
    ],
  },
  {
    id: 'missing-token',
    // TS 1005: "';' expected.", "')' expected." etc.
    matches: (e) => e.code === '1005' || /^'[^']+' expected/i.test(e.message),
    subject: (e) => quoted(e.message),
    short: (c) => `the missing ${code(c.subject, 'symbol')}`,
    // A "',' expected" usually means a list or call was never closed, not that a comma is really missing.
    explanation: (c) =>
      c.subject === ','
        ? `The computer is still inside a list or a call here, so it expected another item or the closing bracket. It's like a sentence that never gets its full stop, so the reader keeps waiting.`
        : `The computer was reading your code and expected a ${code(c.subject, 'symbol')} here, but didn't find one. ` +
          `It's like a sentence that ends without its full stop, so the reader gets lost.`,
    fix: (c) =>
      c.subject === ','
        ? [
            `On line ${c.line}, check for a \`[\` or \`(\` that never got its closing \`]\` or \`)\`, and add it.`,
            `If two values are just sitting side by side, join them with an operator like \`+\` or separate them with a comma.`,
          ]
        : [
            `Look at line ${c.line} (and the line just before it) and add the missing ${code(c.subject, 'symbol')}.`,
            `Every \`(\`, \`{\` and \`[\` needs a matching \`)\`, \`}\` or \`]\`: count them to find the lonely one.`,
          ],
    roasts: [
      () => `Died mid-sentence. Fitting.`,
      () => `Left it open, like your grave.`,
      (c) => `Line ${c.line}, unfinished. Like you.`,
    ],
  },
  {
    id: 'unexpected-token',
    matches: (e) =>
      /Unexpected token|Unexpected keyword|Declaration or statement expected|Expression expected|Identifier expected/i.test(e.message) ||
      ['1109', '1128', '1003'].includes(e.code ?? ''),
    subject: (e) => quoted(e.message),
    short: (c) => (c.subject ? `the surprise \`${c.subject}\`` : 'the out-of-place symbol'),
    explanation: () =>
      `Something on this line is in a spot where the computer didn't expect it, so it can't make sense of the sentence. ` +
      `It's like finding a random word in the middle of a recipe.`,
    fix: (c) => [
      `Look closely at line ${c.line} for an extra or missing bracket, comma or quote, and remove or add it.`,
      `If the line looks fine, check the line just above it: the real mistake is often one line earlier.`,
    ],
    roasts: [
      (c) => `Line ${c.line} is a crime scene.`,
      () => `Even the compiler wants a lawyer.`,
    ],
  },
  {
    id: 'unused',
    matches: (e) => /is declared but (its value is )?never (read|used)/i.test(e.message) || e.code === '6133',
    subject: (e) => quoted(e.message),
    short: (c) => `the forgotten ${code(c.subject, 'variable')}`,
    explanation: (c) =>
      `You made ${code(c.subject, 'something')} but never used it. ` +
      `It's like buying groceries and leaving them in the car.`,
    fix: (c) => [
      `If you don't need ${code(c.subject, 'it')}, delete line ${c.line}.`,
      `If you do need it, use it somewhere below where it's created.`,
    ],
    roasts: [
      (c) => `${code(c.subject, 'It')} lived alone. Died alone.`,
      () => `Born, ignored, forgotten. Relatable.`,
    ],
  },
  {
    id: 'type-mismatch',
    matches: (e) => /is not assignable to (type|parameter)/i.test(e.message) || ['2322', '2345'].includes(e.code ?? ''),
    subject: (e) => quoted(e.message),
    short: () => 'the type mix-up',
    explanation: () =>
      `You gave something the wrong kind of value, like a word where a number was expected. ` +
      `It's like putting diesel in a car that only takes petrol.`,
    fix: (c) => [
      `On line ${c.line}, check what kind of value is expected (number, text, list...) and pass that kind instead.`,
      `If you need to switch kinds, convert it, for example \`Number(x)\` to turn text into a number or \`String(x)\` for the reverse.`,
    ],
    roasts: [
      () => `Wrong body in the coffin.`,
      () => `Square peg. Round grave.`,
    ],
  },
  {
    id: 'const-reassign',
    matches: (e) => /Cannot assign to '.+' because it is a (constant|read-only)|Assignment to constant/i.test(e.message) || e.code === '2588',
    subject: (e) => quoted(e.message),
    short: (c) => `the locked ${code(c.subject, 'constant')}`,
    explanation: (c) =>
      `You made ${code(c.subject, 'this')} with \`const\`, which means "this never changes", and then tried to change it. ` +
      `It's like writing in pen and then trying to erase it.`,
    fix: (c) => [
      `Find where ${code(c.subject, 'it')} is created and change \`const\` to \`let\` so it's allowed to change.`,
      `Or, if it really shouldn't change, remove the line that tries to change it (line ${c.line}).`,
    ],
    roasts: [
      (c) => `${code(c.subject, 'It')} is set in stone. Like your tombstone.`,
      () => `Some things never change. Your bugs, mostly.`,
    ],
  },
  {
    id: 'unterminated-string',
    matches: (e) => /Unterminated string|Unterminated template|unterminated/i.test(e.message) || e.code === '1002',
    subject: () => '',
    short: () => 'the runaway text',
    explanation: () =>
      `You started some text with a quote mark but never closed it, so the computer thinks the rest of the file is part of the text. ` +
      `It's like opening a bracket in a sentence and never closing it.`,
    fix: (c) => [`Add the matching closing quote (\`'\`, \`"\` or \`\\\`\`) at the end of the text on line ${c.line}.`],
    roasts: [
      () => `Your text outlived your hopes.`,
      () => `No closing quote. No closure.`,
    ],
  },
  {
    id: 'redeclared',
    matches: (e) => /Cannot redeclare|has already been declared|Duplicate identifier/i.test(e.message) || ['2451', '2300'].includes(e.code ?? ''),
    subject: (e) => quoted(e.message) || (e.message.match(/^Identifier '([^']+)'/)?.[1] ?? ''),
    short: (c) => `the double ${code(c.subject, 'name')}`,
    explanation: (c) =>
      `You created ${code(c.subject, 'the same name')} twice. ` +
      `It's like two kids in one class with the same name: the teacher doesn't know who to call.`,
    fix: (c) => [
      `Delete the second \`const\`/\`let\` in front of ${code(c.subject, 'the name')} on line ${c.line} if you just meant to change its value.`,
      `If they're meant to be two different things, give one of them a new name.`,
    ],
    roasts: [
      (c) => `Two ${code(c.subject, 'of them')}. One grave.`,
      () => `Same name, double funeral.`,
    ],
  },
];

const GENERIC: ErrorCategory = {
  id: 'generic',
  matches: () => true,
  subject: (e) => quoted(e.message),
  short: () => 'that pesky bug',
  explanation: () =>
    `The computer read your code and something on this line didn't make sense to it. ` +
    `It's like a recipe with one step written a little wrong: the cook stops and waits.`,
  fix: (c) => [
    `Read line ${c.line} slowly and look for typos, missing brackets or missing quotes.`,
    `Hover over the red squiggle to see the exact message and compare it with the line.`,
  ],
  roasts: [
    (c) => `Line ${c.line}. Time of death.`,
    () => `Rest in pieces.`,
  ],
};

/** Legendary errors get a darker opener in front of the normal roast. */
const LEGENDARY_OPENERS = ['Call the coroner.', 'Dig two graves.', 'Code is dead. You\'re next.'];

const CELEBRATIONS: ((what: string) => string)[] = [
  (w) => `${cap(w)}: buried. You live. For now.`,
  (w) => `${cap(w)} is dead. Unlike your bugs, it'll stay dead.`,
  (w) => `${cap(w)}, rest in peace. You, keep suffering.`,
];

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function categorize(error: BuddyError): ErrorCategory {
  return CATEGORIES.find((c) => c.matches(error)) ?? GENERIC;
}

export function contextFor(error: BuddyError): ErrorContext {
  return {
    subject: categorize(error).subject(error),
    line: error.line,
    fileName: error.fileName,
    suggestion: error.message.match(/Did you mean '([^']+)'/)?.[1] ?? '',
  };
}

/** One short line that names what went wrong. Free, instant, never fails. */
export function celebrationFor(error: BuddyError, _personality: RealPersonality): string {
  const what = categorize(error).short(contextFor(error));
  return pick(CELEBRATIONS)(what);
}

/** The same roast voice for every personality; `personality` is only passed through because the contract needs it. */
export function fallbackResponse(error: BuddyError, personality: RealPersonality, legendary: boolean): BuddyResponse {
  const category = categorize(error);
  const ctx = contextFor(error);
  const roast = pick(category.roasts)(ctx);
  return {
    errorId: error.id,
    personality,
    reaction: legendary ? `${pick(LEGENDARY_OPENERS)} ${roast}` : roast,
    explanation: category.explanation(ctx),
    fix: category.fix(ctx),
    line: error.line,
    legendary,
  };
}

export function createFallbackExplainer(): Explainer {
  return {
    explain: async (error, personality, legendary) => fallbackResponse(error, personality, legendary),
    celebrate: async (error, personality) => celebrationFor(error, personality),
  };
}
