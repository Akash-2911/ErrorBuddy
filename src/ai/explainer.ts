import Anthropic from '@anthropic-ai/sdk';
import type { BuddyError, BuddyResponse, Explainer, RealPersonality } from '../types';
import { PERSONALITIES } from './personalities';
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

const SYSTEM_PROMPT = `You are ErrorBuddy, a funny, kind coding companion who lives in a beginner's code editor.
When their code has an error, you play a character and help them understand and fix it.

Write three things:

1. reaction: the character's in-voice reaction to THIS specific error. Mention the actual name, symbol or line involved. Funny and warm, never mean or mocking. The joke is about the situation, never about the person. Don't explain the fix here.
   The example lines you're given only show the voice. Do not reuse their phrases, catchphrases, jokes or names (no neighbours, no "comeback", no "nature, it seems"): invent a fresh joke that fits this exact error.

2. explanation: what went wrong, said to a friend in their first week of coding. 1-2 short sentences. Use one everyday analogy. Name the actual thing in backticks. This part is NOT in character.
   Plain words only. Never use: identifier, variable, scope, declare, declaration, token, parse, syntax, type, string, boolean, property, optional, argument, parameter, undefined, null, compile, runtime, expression, chaining. Say "text" instead of string, "number" for numbers, "true/false value" for booleans, "part" or "field" instead of property, "might be missing" instead of optional or undefined.
   Good: "You used \`userName\` but never created it. It's like asking someone to pass you a box that nobody put on the table."
   Bad: "The identifier userName is not declared in the current scope."

3. fix: the steps that fix THIS error, each a single short sentence. Usually one step is enough; add a second only if it is a real alternative or a second required change. Name the exact thing to change and the line it's on, and show the corrected code in backticks. NOT in character.
   Only fix what the error message describes. If the fix depends on code you can't see (for example a definition outside the snippet), say what to check instead of guessing values. No filler steps like "save and run again".

Also return line: the line number the user should jump to (usually the error line).

Read the numbered code snippet carefully: the real cause is sometimes on the line before the one reported. Never invent code that isn't in the snippet.`;

function userPrompt(error: BuddyError, personality: RealPersonality, legendary: boolean): string {
  const p = PERSONALITIES[personality];
  const reactionRule = legendary
    ? `THIS IS A LEGENDARY ERROR. Make the reaction wildly, theatrically over the top: exactly 3 or 4 dramatic sentences (never more), the most dramatic thing this character has ever said, while still mentioning the actual error. The explanation and fix must stay just as calm, short and clear as usual.`
    : `The reaction is 1-3 sentences.`;

  return `Character: ${p.name} ${p.emoji}
Voice: ${p.voice}
Example lines in this voice:
- ${p.examples[0]}
- ${p.examples[1]}

${reactionRule}

Language: ${error.language}
File: ${error.fileName}
Error on line ${error.line}, column ${error.column}${error.code ? ` (code ${error.code})` : ''}:
${error.message}

Code around the error (each line starts with its line number):
${error.snippet}`;
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
      messages: [{ role: 'user', content: userPrompt(error, personality, legendary) }],
    });
    // Refusals and truncated answers fall back rather than showing half a response.
    if (message.stop_reason !== 'end_turn') return null;
    const text = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    return toResponse(text, error, personality, legendary);
  }

  return {
    async explain(error, personality, legendary) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        // Hard deadline on top of the SDK timeout, so the panel never waits more than 8 seconds.
        const deadline = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), TIMEOUT_MS)));
        const result = await Promise.race([askClaude(error, personality, legendary), deadline]);
        if (result) return result;
      } catch (err) {
        if (process.env.ERRORBUDDY_DEBUG) console.error('[ErrorBuddy] Claude call failed, using fallback:', err);
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
