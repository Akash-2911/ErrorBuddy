/**
 * Runs sample errors through every personality and prints the results.
 *
 *   npx tsx scripts/try-explainer.ts            offline (fallback) + live Claude if ANTHROPIC_API_KEY is set
 *   npx tsx scripts/try-explainer.ts --offline  fallback only
 *   npx tsx scripts/try-explainer.ts --live     Claude only (needs ANTHROPIC_API_KEY)
 *   npx tsx scripts/try-explainer.ts --only pirate
 */
import { createExplainer } from '../src/ai/explainer';
import { createFallbackExplainer } from '../src/ai/fallback';
import { PERSONALITIES, REAL_PERSONALITIES } from '../src/ai/personalities';
import type { BuddyError, Explainer, RealPersonality } from '../src/types';

function sample(fileName: string, line: number, column: number, message: string, code: string | undefined, language: string, lines: string[], firstLine: number): BuddyError {
  const file = `/demo/${fileName}`;
  return {
    id: `${file}::${message}`,
    file,
    fileName,
    line,
    column,
    message,
    code,
    language,
    snippet: lines.map((text, i) => `${firstLine + i} | ${text}`).join('\n'),
  };
}

const SAMPLES: BuddyError[] = [
  sample('broken.js', 4, 15, "Cannot find name 'userName'. Did you mean 'username'?", '2552', 'javascript', [
    'function greet() {',
    "  const username = 'Ada';",
    '  // say hi',
    '  console.log(`Hello, ${userName}!`);',
    '}',
    '',
    'greet();',
  ], 1),
  sample('broken.js', 12, 30, "')' expected.", '1005', 'javascript', [
    'const prices = [3, 7, 12];',
    '',
    'function total(items) {',
    '  return items.reduce((sum, p) => sum + p, 0;',
    '}',
    '',
    'console.log(total(prices));',
  ], 9),
  sample('broken.js', 21, 3, "This expression is not callable. Type 'Number' has no call signatures.", '2349', 'typescript', [
    'const score = 42;',
    '',
    'function show() {',
    '  score();',
    '  return score;',
    '}',
  ], 18),
  sample('cart.ts', 8, 22, "'cart.items' is possibly 'undefined'.", '18048', 'typescript', [
    'interface Cart { items?: string[] }',
    '',
    'function countItems(cart: Cart) {',
    '  // how many things are in the cart?',
    '  return cart.items.length;',
    '}',
  ], 4),
  sample('broken.js', 33, 7,
    "Argument of type '{ name: string; age: string; address: { street: number; city: boolean; }; }' is not assignable to parameter of type 'User'. " +
    "Types of property 'age' are incompatible. Type 'string' is not assignable to type 'number'. " +
    "The expected type comes from property 'age' which is declared here on type 'User'.",
    '2345', 'typescript', [
      '/** @param {User} user */',
      'function register(user) { /* ... */ }',
      '',
      "register({ name: 'Ada', age: '36', address: { street: 12, city: true } });",
    ], 30),
];

const args = process.argv.slice(2);
const only = args.includes('--only') ? (args[args.indexOf('--only') + 1] as RealPersonality) : undefined;
const personalities = only ? [only] : REAL_PERSONALITIES;
const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
const runOffline = !args.includes('--live');
const runLive = !args.includes('--offline') && hasKey;

async function run(label: string, explainer: Explainer) {
  console.log(`\n${'='.repeat(70)}\n ${label}\n${'='.repeat(70)}`);

  for (const error of SAMPLES) {
    console.log(`\n--- ${error.fileName}:${error.line}  ${error.message.slice(0, 80)}${error.message.length > 80 ? '…' : ''}`);
    for (const p of personalities) {
      const started = Date.now();
      const r = await explainer.explain(error, p, false);
      const celebration = await explainer.celebrate(error, p);
      print(p, r.reaction, r.explanation, r.fix, r.line, celebration, Date.now() - started);
    }
  }

  // One legendary run per personality, on the nasty last error.
  const nasty = SAMPLES[SAMPLES.length - 1];
  console.log(`\n--- ⚡ LEGENDARY: ${nasty.fileName}:${nasty.line}`);
  for (const p of personalities) {
    const started = Date.now();
    const r = await explainer.explain(nasty, p, true);
    print(p, r.reaction, r.explanation, r.fix, r.line, await explainer.celebrate(nasty, p), Date.now() - started);
  }
}

function print(p: RealPersonality, reaction: string, explanation: string, fix: string[], line: number, celebration: string, ms: number) {
  const { emoji, name } = PERSONALITIES[p];
  console.log(`\n  ${emoji} ${name}  (${ms} ms)`);
  console.log(`    Reaction:    ${reaction}`);
  console.log(`    What:        ${explanation}`);
  fix.forEach((step, i) => console.log(`    Fix ${i + 1}:       ${step}`));
  console.log(`    Jump to:     line ${line}`);
  console.log(`    Celebrate:   ${celebration}`);
}

async function main() {
  if (runOffline) await run('OFFLINE (fallback, no API key)', createFallbackExplainer());
  if (runLive) await run('LIVE (Claude claude-haiku-5-5)', createExplainer(process.env.ANTHROPIC_API_KEY));
  else if (!args.includes('--offline')) console.log('\n(ANTHROPIC_API_KEY not set: skipped the live Claude run.)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
