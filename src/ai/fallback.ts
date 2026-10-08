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
  reactions: Record<RealPersonality, Template[]>;
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
    reactions: {
      pirate: [
        (c) => `Arr, matey! Ye be callin' for ${code(c.subject, 'a sailor')}, but no such sailor be aboard this ship!`,
        (c) => `Blimey! I searched the whole hold for ${code(c.subject, 'it')} on line ${c.line} and found naught but barnacles!`,
      ],
      sportscaster: [
        (c) => `OH NO! The pass goes to ${code(c.subject, 'a player')} on line ${c.line}, but THERE'S NOBODY THERE, FOLKS!`,
        (c) => `${code(c.subject, 'That player', )} isn't even on the roster! The ref is NOT happy!`,
      ],
      parent: [
        (c) => `*sigh* I'm not mad that ${code(c.subject, 'it')} doesn't exist. I'm just... disappointed. We talk about introducing our friends first.`,
        (c) => `You're asking for ${code(c.subject, 'something')} like it's always been here. Honey, you never even made it.`,
      ],
      shakespeare: [
        (c) => `Alas, poor ${code(c.subject, 'friend')}! I called upon thee on line ${c.line}, yet thou wert never born!`,
        (c) => `Who is this ${code(c.subject, 'stranger')} of whom thou speak'st? No such soul doth dwell within this file!`,
      ],
      narrator: [
        (c) => `Here, in the wild, we observe a rare creature: ${code(c.subject, 'a name')}. It does not exist... and yet it is called upon.`,
        (c) => `The developer reaches for ${code(c.subject, 'something')} on line ${c.line}. But the habitat is empty. Nothing lives here yet.`,
      ],
    },
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
    reactions: {
      pirate: [(c) => `Arr! Ye be orderin' ${code(c.subject, 'that')} to swab the deck, but it be a barrel, not a deckhand!`],
      sportscaster: [(c) => `They're calling a play with ${code(c.subject, 'that')}, but it's NOT A PLAY, it's the WATER BOTTLE!`],
      parent: [(c) => `You're telling ${code(c.subject, 'that')} to do something. Sweetie, it can't do anything. It's like asking the couch to make dinner.`],
      shakespeare: [(c) => `Thou commandest ${code(c.subject, 'it')} to act, yet it hath no deeds within it! A player with no lines!`],
      narrator: [(c) => `The developer attempts to summon ${code(c.subject, 'it')} into action. It simply sits there, as values do.`],
    },
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
    reactions: {
      pirate: [(c) => `Arr, ye opened the treasure chest at line ${c.line} and it be EMPTY, matey! Not even a doubloon!`],
      sportscaster: [(c) => `He reaches for the ball on line ${c.line}... and THERE'S NO BALL! What a shocker, folks!`],
      parent: [(c) => `You reached into an empty cookie jar on line ${c.line}. I didn't eat them. I'm just... saying it might be empty.`],
      shakespeare: [(c) => `To be, or not to be? On line ${c.line}, thy value chose... not to be.`],
      narrator: [(c) => `The developer reaches into the burrow on line ${c.line}. It is, regrettably, unoccupied.`],
    },
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
    reactions: {
      pirate: [(c) => `Arr! Ye be lookin' for ${code(c.subject, 'that')} on this ship, but she never had one!`],
      sportscaster: [(c) => `He's going for ${code(c.subject, 'the move')}, but that move ISN'T IN THE PLAYBOOK!`],
      parent: [(c) => `${code(c.subject, 'That')}? On this? You've been looking for it all day, and it was never there, sweetheart.`],
      shakespeare: [(c) => `Thou seekest ${code(c.subject, 'a thing')} where no such thing was ever writ!`],
      narrator: [(c) => `The creature searches for its ${code(c.subject, 'missing part')}. Evolution, it seems, never gave it one.`],
    },
  },
  {
    id: 'missing-token',
    // TS 1005: "';' expected.", "')' expected." etc.
    matches: (e) => e.code === '1005' || /^'[^']+' expected/i.test(e.message),
    subject: (e) => quoted(e.message),
    short: (c) => `the missing ${code(c.subject, 'symbol')}`,
    explanation: (c) =>
      `The computer was reading your code and expected a ${code(c.subject, 'symbol')} here, but didn't find one. ` +
      `It's like a sentence that ends without its full stop, so the reader gets lost.`,
    fix: (c) => [
      `Look at line ${c.line} (and the line just before it) and add the missing ${code(c.subject, 'symbol')}.`,
      `Every \`(\`, \`{\` and \`[\` needs a matching \`)\`, \`}\` or \`]\`: count them to find the lonely one.`,
    ],
    reactions: {
      pirate: [
        (c) => `Arr! A ${code(c.subject, 'piece')} went overboard near line ${c.line}! Man the lifeboats!`,
        (c) => `Shiver me timbers, ye forgot a ${code(c.subject, 'piece')}! Our hull be leakin' code into the sea!`,
      ],
      sportscaster: [(c) => `AND THEY FORGOT THE ${c.subject ? `\`${c.subject}\`` : 'FINISH'}! The play just stops dead on line ${c.line}!`],
      parent: [(c) => `You left the ${code(c.subject, 'lid')} off. Again. I'm not angry, I just keep finding things open around here.`],
      shakespeare: [(c) => `A ${code(c.subject, 'mark')}, a ${code(c.subject, 'mark')}! My kingdom for a ${code(c.subject, 'mark')}!`],
      narrator: [(c) => `Near line ${c.line}, a single ${code(c.subject, 'symbol')} has gone missing. The ecosystem cannot function without it.`],
    },
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
    reactions: {
      pirate: [(c) => `Arr! A stowaway on line ${c.line}! Somethin' be where it don't belong!`],
      sportscaster: [(c) => `WHAT IS THAT ON THE FIELD? Something has wandered onto line ${c.line} and play is STOPPED!`],
      parent: [(c) => `What is THIS doing on line ${c.line}? I don't know where you picked that up, but it doesn't go there.`],
      shakespeare: [(c) => `What villain hath crept upon line ${c.line}? Begone, thou unexpected knave!`],
      narrator: [(c) => `An intruder has entered line ${c.line}. The other symbols regard it with deep suspicion.`],
    },
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
    reactions: {
      pirate: [(c) => `Arr, ye hired ${code(c.subject, 'a deckhand')} and never gave 'em a single job!`],
      sportscaster: [(c) => `${code(c.subject, 'This player')} has been on the bench ALL GAME! Put 'em in, coach!`],
      parent: [(c) => `You just HAD to have ${code(c.subject, 'it')}, and now it's sitting there unused. Like the treadmill.`],
      shakespeare: [(c) => `${code(c.subject, 'This one')} was born, yet given no part to play. A tragedy most quiet.`],
      narrator: [(c) => `${code(c.subject, 'This creature')} was brought into the world... and then entirely ignored.`],
    },
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
    reactions: {
      pirate: [(c) => `Arr! Ye tried to load rum into the cannon on line ${c.line}! Wrong cargo, matey!`],
      sportscaster: [(c) => `He's trying to shoot a BASKETBALL into the HOCKEY NET on line ${c.line}! Wrong sport!`],
      parent: [(c) => `That's not what I asked for on line ${c.line}. I said a number. You brought me... this.`],
      shakespeare: [(c) => `Thou offerest a rose where a sword was sought! On line ${c.line}, such mismatch doth wound me!`],
      narrator: [(c) => `On line ${c.line}, a square peg attempts to enter a round hole. It does not go well.`],
    },
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
    reactions: {
      pirate: [(c) => `Arr! ${code(c.subject, 'That')} be nailed to the mast, matey! Ye can't move it now!`],
      sportscaster: [(c) => `He's trying to change ${code(c.subject, 'the final score')} AFTER THE GAME! That's not allowed!`],
      parent: [(c) => `We agreed ${code(c.subject, 'that')} wouldn't change. We shook on it. And now look.`],
      shakespeare: [(c) => `${code(c.subject, 'It')} swore a vow most constant, and thou wouldst make it break it!`],
      narrator: [(c) => `${code(c.subject, 'This one')} is set in stone, like a fossil. And yet, the developer tries to move it.`],
    },
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
    reactions: {
      pirate: [(c) => `Arr! Yer message in a bottle on line ${c.line} never got its cork! It be spillin' everywhere!`],
      sportscaster: [(c) => `The text on line ${c.line} just KEEPS GOING! Somebody stop it! It's running out of the stadium!`],
      parent: [(c) => `You started a sentence on line ${c.line} and just... walked away. Like with the dishes.`],
      shakespeare: [(c) => `Thy words on line ${c.line} run on and on, with no end in sight! A soliloquy unending!`],
      narrator: [(c) => `On line ${c.line}, a string has escaped its enclosure. It now roams the file, unchecked.`],
    },
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
    reactions: {
      pirate: [(c) => `Arr! Two sailors both named ${code(c.subject, 'the same')}? This crew be confusin' me!`],
      sportscaster: [(c) => `TWO players wearing the ${code(c.subject, 'same')} jersey! The ref can't tell them apart!`],
      parent: [(c) => `You already have a ${code(c.subject, 'one of those')}. Why do you need another? Do you know how much these cost?`],
      shakespeare: [(c) => `Two ${code(c.subject, 'souls')}, both alike in name! A comedy of errors, truly!`],
      narrator: [(c) => `Two creatures named ${code(c.subject, 'the same')} now compete for one territory. Only one can survive.`],
    },
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
  reactions: {
    pirate: [(c) => `Arr! There be trouble brewin' on line ${c.line}, matey! All hands on deck!`],
    sportscaster: [(c) => `FLAG ON THE PLAY! Line ${c.line}! Let's go to the replay, folks!`],
    parent: [(c) => `*sigh* Line ${c.line}. I'm not going to say anything. I'm just going to stand here. Looking at it.`],
    shakespeare: [(c) => `Something is rotten in the state of line ${c.line}!`],
    narrator: [(c) => `On line ${c.line}, something stirs in the undergrowth. The developer has not yet noticed.`],
  },
};

const LEGENDARY_INTRO: Record<RealPersonality, string> = {
  pirate: 'BY THE SEVEN SEAS AND ALL THE KRAKEN WITHIN! In forty years of sailin\' I have NEVER seen a beast like this!',
  sportscaster: 'LADIES AND GENTLEMEN, STOP WHAT YOU\'RE DOING! THIS IS THE ERROR OF THE CENTURY!',
  parent: 'I need to sit down. No, really. Get me a chair. In all my years of raising you, I never imagined THIS.',
  shakespeare: 'O heavens! O earth! O cruel and mighty fates! What monstrous error doth rise before mine eyes?!',
  narrator: 'Hold your breath. What we are about to witness has been seen by only a handful of humans in history.',
};

const LEGENDARY_OUTRO: Record<RealPersonality, string> = {
  pirate: 'Sharpen yer cutlass, matey, for legends will be sung of the day we slay this monster!',
  sportscaster: 'THE CROWD IS ON ITS FEET! This is the moment champions are made, and YOU are in the game!',
  parent: 'But you know what? I raised a fighter. Go get it, sweetheart. I\'ll be right here, being proud.',
  shakespeare: 'Yet fear not, brave coder, for every tragedy may turn to triumph in the final act!',
  narrator: 'And yet the developer does not flee. Against all odds, our hero prepares to face the beast.',
};

const CELEBRATIONS: Record<RealPersonality, ((what: string) => string)[]> = {
  pirate: [
    (w) => `Arr! ${cap(w)} has been banished to Davy Jones' locker!`,
    (w) => `Yo ho ho! We made ${w} walk the plank, matey!`,
  ],
  sportscaster: [
    (w) => `AND THAT'S THE GAME! ${cap(w)} is OUT and the crowd goes WILD!`,
    (w) => `WHAT A COMEBACK! ${cap(w)} never stood a chance, folks!`,
  ],
  parent: [
    (w) => `You fixed ${w} all by yourself? I'm putting this on the fridge.`,
    (w) => `${cap(w)} is gone and I am SO proud of you. Wait till I tell your aunt.`,
  ],
  shakespeare: [
    (w) => `Huzzah! ${cap(w)} is vanquished, and all's well that ends well!`,
    (w) => `${cap(w)} hath exited, pursued by a bear! Bravo, noble coder!`,
  ],
  narrator: [
    (w) => `And with that, ${w} returns to the wild, never to trouble this habitat again.`,
    (w) => `Remarkable. The developer has overcome ${w}. Nature is healing.`,
  ],
};

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

/** One in-character sentence that names what went wrong. Free, instant, never fails. */
export function celebrationFor(error: BuddyError, personality: RealPersonality): string {
  const what = categorize(error).short(contextFor(error));
  return pick(CELEBRATIONS[personality])(what);
}

export function fallbackResponse(error: BuddyError, personality: RealPersonality, legendary: boolean): BuddyResponse {
  const category = categorize(error);
  const ctx = contextFor(error);
  const base = pick(category.reactions[personality])(ctx);
  const reaction = legendary ? `${LEGENDARY_INTRO[personality]} ${base} ${LEGENDARY_OUTRO[personality]}` : base;
  return {
    errorId: error.id,
    personality,
    reaction,
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
