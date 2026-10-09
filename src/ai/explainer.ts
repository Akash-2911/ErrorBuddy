import Anthropic from '@anthropic-ai/sdk';
import type { BuddyError, BuddyResponse, Explainer, RealPersonality } from '../types';
import { celebrationFor, createFallbackExplainer, fallbackResponse } from './fallback';

const MODEL = 'claude-haiku-5-5';
const TIMEOUT_MS = 8000;
// Room for a short adaptive-thinking pass plus the JSON answer (thinking counts toward max_tokens).
const MAX_TOKENS = 1024;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    reaction: { type: 'string' },
    explanation: { type: 'string' },
    fix: { type: 'array', items: { type: 'string' } },
    line: { type: 'integer' },
  },
  required: ['reaction', 'explanation', 'fix', 'line'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You are ErrorBuddy, a deadpan roaster with a pitch-black sense of humour who lives in a coder's editor.
When their code has an error, you roast them for it in a few words, then you clearly help them fix it. No character, no accent, no persona: just you.

Write three things:

1. reaction: a dark-humour roast of THIS specific error in a few words. Hit hard, keep it tiny.
   Dark themes are welcome: death, funerals, graves, obituaries, doom, getting fired, wasted lives, the code being beyond saving.
   Name the actual thing (in backticks) when it fits, but never waste words on setup. No greetings, no "wow", no exclamation spam.
   The style, on made-up errors: "\`totl\`. Even your typos are dying." / "Unclosed \`{\`. Open casket." / "\`price()\`. A number won't rise from the dead."
   Hard limits: never joke about anyone's identity (race, gender, religion, sexuality, disability, body), never use slurs, and never mention self-harm or suicide. Roast the mistake and the coding, not who the person is. Never assume the coder's gender.
   Don't copy the example roasts: write a fresh one for this exact error.

2. explanation: what went wrong, said to a friend in their first week of coding. One short sentence, two at most. Use one everyday analogy. Name the actual thing in backticks. This part is NOT a roast: plain and clear.
   Plain words only. Never use: identifier, variable, scope, declare, declaration, token, parse, syntax, type, string, boolean, property, optional, argument, parameter, undefined, null, compile, runtime, expression, chaining. Say "text" instead of string, "number" for numbers, "true/false value" for booleans, "part" or "field" instead of property, "might be missing" instead of optional or undefined.
   Good: "You used \`userName\` but never created it. It's like asking someone to pass you a box that nobody put on the table."
   Bad: "The identifier userName is not declared in the current scope."

3. fix: the steps that fix THIS error, each a single short sentence. Usually one step is enough; add a second only if it is a real alternative or a second required change. Name the exact thing to change and the line it's on, and show the corrected code in backticks. NOT a roast.
   Only fix what the error message describes. If the code to change is outside the snippet, point to it by name (for example "where \`settings\` is created, above") and never guess its line number or its current value; only quote values that appear in the snippet or the error message. Keep any code you show short (one small expression, not a whole rewritten statement). No filler steps like "save and run again".

Also return line: the line number the user should jump to (usually the error line).

Read the numbered code snippet carefully: the real cause is sometimes on the line before the one reported. Never invent code that isn't in the snippet.`;

/** A random dark theme per call, so the same error doesn't get the same joke every time. */
const DARK_ANGLES = [
  'a funeral', 'an obituary', 'an autopsy', 'a haunting', 'a graveyard', 'famous last words', 'a coroner\'s report',
  'reading the will', 'extinction', 'a crime scene', 'the afterlife', 'a eulogy', 'life support', 'a tombstone',
];

function userPrompt(error: BuddyError, legendary: boolean): string {
  const angle = DARK_ANGLES[Math.floor(Math.random() * DARK_ANGLES.length)];
  const reactionRule = legendary
    ? `THIS IS A LEGENDARY ERROR. Make the reaction your darkest, most savage roast yet, 15 words at most, still about the actual error. The explanation and fix must stay just as calm, short and clear as usual.`
    : `The reaction is 3 to 8 words. Fewer is better.`;

  return `${reactionRule}
Theme for this roast: ${angle}.

Language: ${error.language}
File: ${error.fileName}
Error on line ${error.line}, column ${error.column}${error.code ? ` (code ${error.code})` : ''}:
${error.message}

Code around the error (each line starts with its line number):
${error.snippet}`;
}

function debug(msg: string) {
  if (process.env.ERRORBUDDY_DEBUG) console.error(`[ErrorBuddy] ${msg} (using fallback)`);
}

/** Checks the model's JSON and turns it into a BuddyResponse, or returns null if anything is off. */
function toResponse(raw: string, error: BuddyError, personality: RealPersonality, legendary: boolean): BuddyResponse | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;

  const reaction = typeof d.reaction === 'string' ? d.reaction.trim() : '';
  const explanation = typeof d.explanation === 'string' ? d.explanation.trim() : '';
  const fix = Array.isArray(d.fix)
    ? d.fix.filter((s): s is string => typeof s === 'string' && s.trim() !== '').map((s) => s.trim()).slice(0, 2)
    : [];
  if (!reaction || !explanation || fix.length === 0) return null;

  const line = typeof d.line === 'number' && Number.isInteger(d.line) && d.line > 0 ? d.line : error.line;
  return { errorId: error.id, personality, reaction, explanation, fix, line, legendary };
}

export function createExplainer(apiKey?: string): Explainer {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) return createFallbackExplainer();

  const client = new Anthropic({ apiKey: key, timeout: TIMEOUT_MS, maxRetries: 0 });

  async function askClaude(error: BuddyError, personality: RealPersonality, legendary: boolean): Promise<BuddyResponse | null> {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // Low effort keeps the answer fast: the model can skip thinking entirely on easy errors.
      output_config: { effort: 'low', format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt(error, legendary) }],
    });
    // Refusals and truncated answers fall back rather than showing half a response.
    if (message.stop_reason !== 'end_turn') {
      debug(`stop_reason ${message.stop_reason}${message.stop_details ? ` ${JSON.stringify(message.stop_details)}` : ''}`);
      return null;
    }
    const text = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    const response = toResponse(text, error, personality, legendary);
    if (!response) debug(`unusable answer: ${text.slice(0, 200)}`);
    return response;
  }

  return {
    async explain(error, personality, legendary) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        // Hard deadline on top of the SDK timeout, so the panel never waits more than 8 seconds.
        const deadline = new Promise<null>((resolve) => (timer = setTimeout(() => { debug(`no answer within ${TIMEOUT_MS} ms`); resolve(null); }, TIMEOUT_MS)));
        const result = await Promise.race([askClaude(error, personality, legendary), deadline]);
        if (result) return result;
      } catch (err) {
        debug(`Claude call failed: ${err}`);
      } finally {
        clearTimeout(timer);
      }
      return fallbackResponse(error, personality, legendary);
    },

    async celebrate(error, personality) {
      return celebrationFor(error, personality);
    },
  };
}
