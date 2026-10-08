# ErrorBuddy: 4-Hour Build Plan (4-person team)

**Team**
| Person | Role | Owns |
|---|---|---|
| **Akash** | Extension Shell | Detecting errors and fixes in VS Code, wiring the modules together |
| **Aryan** | AI Brain | Turning an error into a reaction, an explanation and a fix |
| **Ritesh** | Panel UI | Everything the user sees in the side panel |
| **Shivang** | Game Engine | Streaks, achievements, legendary errors, personality picking, saved stats |

**What we're building:** a VS Code extension. When your code has an error, a character pops up in a side panel and gives you (1) a funny in-character reaction, (2) a plain-English explanation, and (3) a 1–2 step fix with a "jump to line" button. When the error disappears, it celebrates.

> **For Claude Code:** This file is the source of truth. Read all of it, then build **only the module owned by the person who handed it to you**. Copy `src/types.ts` from section 3 **exactly**, character for character. Do not import or edit any other person's files. Wherever you need another module, use the mock described in your section. If something is unclear, choose the simplest option that keeps the contract intact.

---

## 1. How the work stays independent

The four modules never talk to each other directly. They only share **one file of type definitions** (`src/types.ts`, written out in full below). Everyone copies it from this doc on minute one, so **nobody waits for anybody**.

```
            ┌───────────── Akash: extension.ts (glue) ─────────────┐
            │                                                       │
   Aryan: Explainer     Shivang: GameEngine     Ritesh: BuddyPanel
   (pure TypeScript,    (pure TypeScript,      (HTML/CSS/JS + one
    no VS Code)          no VS Code)            VS Code class)
```

- **Aryan and Shivang:** your code has **zero `vscode` imports**. You can start in an empty folder right now, test from the terminal, and drop your files into the repo at merge time.
- **Ritesh:** the panel (`media/`) is plain browser files. Build it in Chrome with mock data. `panel.ts` is a small class you add at the end.
- **Akash:** you build the shell using **stub versions** of the other three modules (`src/stubs.ts`). At merge time you swap the stub imports for the real ones. That's a few lines.

Each module has its own "done" test (section 9), so each person can prove their part works **alone**.

---

## 2. Scope

**Must have (the demo):**
- Detect error → panel shows character reaction, simple explanation, fix steps, jump-to-line button
- 5 personalities + "Random", picked from a dropdown in the panel
- Fix detected → confetti + a celebration line that mentions what went wrong
- Streak counter
- Achievements: First Fix, Semicolon Sommelier, Night Owl, Streak 5, Legendary Hunter
- Legendary error (rare, over-the-top reaction, golden UI)
- Works offline with canned responses

**Nice to have (only if ahead):** sound on celebration, achievements gallery, highlight the error line in the editor, more achievements.

**Out of scope:** runtime/terminal errors, publishing to the Marketplace, accounts, settings beyond the API key.

### Tech stack
- VS Code extension in TypeScript, bundled with esbuild
- Errors come from `vscode.languages.onDidChangeDiagnostics` (the red squiggles)
- Panel: `WebviewViewProvider`, plain HTML/CSS/JS, no React
- AI: Claude API (`@anthropic-ai/sdk`), model `claude-haiku-5-5`. Key from setting `errorBuddy.apiKey` or env var `ANTHROPIC_API_KEY`; with neither, fallback mode.
- Saved stats: VS Code `context.globalState`
- Demo language: JavaScript/TypeScript (VS Code reports these errors without extra extensions)

---

## 3. The shared contract: `src/types.ts`

**Everyone copies this exactly on minute one. Nobody changes it without all four agreeing.**

```ts
// ===== ErrorBuddy shared contract. DO NOT EDIT without team agreement. =====

export type Personality =
  | 'pirate'
  | 'sportscaster'
  | 'parent'        // disappointed parent
  | 'shakespeare'
  | 'narrator'      // nature documentary narrator
  | 'random';

export type RealPersonality = Exclude<Personality, 'random'>;

/** An error VS Code reported, cleaned up. Built by Akash. */
export interface BuddyError {
  id: string;            // `${file}::${message}` (no line number, because lines shift while typing)
  file: string;          // absolute path
  fileName: string;      // just the file name, for display
  line: number;          // 1-based
  column: number;        // 1-based
  message: string;       // raw error message
  code?: string;         // e.g. "1005", "2304"
  language: string;      // e.g. "javascript", "typescript"
  snippet: string;       // error line ±3 lines, each prefixed with its line number, e.g. "12 | const x = y;"
}

/** Built by Aryan. */
export interface BuddyResponse {
  errorId: string;
  personality: RealPersonality;
  reaction: string;      // 1–3 sentences in character (3–4 and over the top if legendary)
  explanation: string;   // 1–2 sentences, plain English, everyday analogy, no jargon
  fix: string[];         // 1–2 short, concrete steps
  line: number;          // line to jump to
  legendary: boolean;
}

export interface Explainer {
  explain(error: BuddyError, personality: RealPersonality, legendary: boolean): Promise<BuddyResponse>;
  celebrate(error: BuddyError, personality: RealPersonality): Promise<string>; // one sentence that mentions what went wrong
}

/** Built by Shivang. */
export type AchievementId =
  | 'first_fix'
  | 'semicolon_sommelier'
  | 'night_owl'
  | 'streak_5'
  | 'streak_10'
  | 'legendary_hunter';

export interface Achievement {
  id: AchievementId;
  title: string;
  description: string;
  emoji: string;
}

export interface GameState {
  streak: number;
  bestStreak: number;
  totalFixes: number;
  personality: Personality;      // what the user picked (may be 'random')
  unlocked: Achievement[];
}

export interface ErrorShownResult {
  personality: RealPersonality;  // 'random' already resolved
  legendary: boolean;
  newAchievements: Achievement[];  // e.g. night_owl, semicolon_sommelier
}

export interface FixResult {
  streak: number;
  newAchievements: Achievement[];  // e.g. first_fix, streak_5, legendary_hunter
}

/** Same shape as VS Code's globalState, so Shivang can test with an in-memory version. */
export interface KeyValueStore {
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

export interface GameEngine {
  onErrorShown(error: BuddyError, now: Date): Promise<ErrorShownResult>;
  onFixed(error: BuddyError, wasLegendary: boolean, now: Date): Promise<FixResult>;
  onErrorsPiledUp(): Promise<void>;      // 3+ new errors at once: streak resets to 0
  setPersonality(p: Personality): Promise<void>;
  getState(): GameState;
  reset(): Promise<void>;
}

/** Messages from the extension to the panel. Built by Akash, displayed by Ritesh. */
export type ToPanel =
  | { type: 'thinking'; error: BuddyError; personality: RealPersonality }
  | { type: 'response'; error: BuddyError; response: BuddyResponse }
  | { type: 'fixed'; error: BuddyError; celebration: string; streak: number }
  | { type: 'achievement'; achievement: Achievement }
  | { type: 'state'; state: GameState }
  | { type: 'idle' };

/** Messages from the panel to the extension. Sent by Ritesh, handled by Akash. */
export type FromPanel =
  | { type: 'ready' }
  | { type: 'setPersonality'; personality: Personality }
  | { type: 'jumpToLine'; file: string; line: number };

/** Built by Ritesh. */
export interface PanelController {
  post(msg: ToPanel): void;                          // queue until the panel says 'ready'
  onMessage(handler: (msg: FromPanel) => void): void;
}
```

### Exact export names (so the merge is just swapping imports)

| Owner | File | Must export |
|---|---|---|
| Aryan | `src/ai/explainer.ts` | `export function createExplainer(apiKey?: string): Explainer` |
| Shivang | `src/game/engine.ts` | `export function createGameEngine(store: KeyValueStore): GameEngine` |
| Ritesh | `src/panel.ts` | `export class BuddyPanel implements vscode.WebviewViewProvider, PanelController` with `static readonly viewId = 'errorBuddy.panel'` and `constructor(extensionUri: vscode.Uri)` |

---

## 4. Repo layout and ownership

```
errorbuddy/
├── package.json              Akash
├── src/
│   ├── types.ts              SHARED (copied from this doc by everyone)
│   ├── extension.ts          Akash
│   ├── errorWatcher.ts       Akash
│   ├── stubs.ts              Akash (deleted after merge)
│   ├── ai/                   Aryan
│   │   ├── explainer.ts
│   │   ├── personalities.ts
│   │   └── fallback.ts
│   ├── game/                 Shivang
│   │   ├── engine.ts
│   │   ├── achievements.ts
│   │   └── memoryStore.ts    (in-memory KeyValueStore for testing)
│   └── panel.ts              Ritesh
├── media/                    Ritesh
│   ├── panel.html  panel.css  panel.js  confetti.js
├── scripts/
│   ├── try-explainer.ts      Aryan
│   └── try-game.ts           Shivang
└── demo/
    └── broken.js             Akash
```

**Dependencies are decided now** so nobody fights over `package.json`. Akash adds all of them in the scaffold:
`@anthropic-ai/sdk` (dependency); `typescript`, `tsx`, `esbuild`, `@types/vscode`, `@types/node` (dev).

**Git:** one repo, `main`. Branches `akash/shell`, `aryan/ai`, `ritesh/ui`, `shivang/game`. **Only touch your own files.** Only Akash edits `package.json`. If Aryan or Shivang start in a scratch folder, just copy your folder into `src/` when the repo exists.

---

## 5. Akash: Extension Shell

**Files:** `package.json`, `src/extension.ts`, `src/errorWatcher.ts`, `src/stubs.ts`, `demo/broken.js`

**Build:**
1. Scaffold (`npx --package yo --package generator-code -- yo code`, TypeScript, esbuild). Add `src/types.ts` from section 3 and the dependencies from section 4. Push to `main`.
2. `package.json` contributions:
   - Activity bar container `errorBuddy` with an icon, containing a webview view `errorBuddy.panel`
   - Setting `errorBuddy.apiKey` (string)
   - Command `errorBuddy.resetStats`
   - Activation event `onStartupFinished`
3. `stubs.ts`: three fake implementations so the shell runs alone:
   - `stubExplainer`: returns a fixed `BuddyResponse` after a 1-second delay
   - `stubGame`: in-memory streak counter, personality always `'pirate'`, never legendary, no achievements
   - `stubPanel`: a `PanelController` that logs every message to an Output channel named "ErrorBuddy"
4. `errorWatcher.ts`, which emits two events: `onNewError(BuddyError)` and `onFixed(BuddyError)`:
   - Listen to `onDidChangeDiagnostics`. Only the **active editor's** file, only **Error** severity.
   - Debounce 1.5 seconds after the last change.
   - The "current error" is the first error in the file. If its `id` differs from the one being shown, emit `onNewError`.
   - If the shown error's `id` is no longer among the file's errors, emit `onFixed`.
   - If the error count jumps by 3+ in one change, call `game.onErrorsPiledUp()`.
5. `extension.ts`, the glue:
   - **New error:** `game.onErrorShown()` → `panel.post({type:'thinking'})` → `explainer.explain()` → `panel.post({type:'response'})` → post any `achievement`s → post `state`.
   - **Fixed:** `explainer.celebrate()` + `game.onFixed()` → post `fixed` → post achievements → post `state`.
   - **No errors left:** post `idle`.
   - **From panel:** `ready` → post `state`; `setPersonality` → `game.setPersonality()`; `jumpToLine` → open the file, move the cursor, reveal the line in the center.
   - Cache `BuddyResponse` by `message + personality` so repeat errors are instant.
   - Remember whether the shown error was legendary so you can pass it to `onFixed`.
6. `demo/broken.js`: 5 planted errors that are easy to fix live: an undefined variable, a missing bracket, a missing semicolon-style syntax error, calling something that isn't a function, and a long, nasty one for the legendary moment.

**Merge step (about 10 minutes):** replace the three stub imports with `createExplainer(apiKey)`, `createGameEngine(context.globalState)`, and `new BuddyPanel(context.extensionUri)` (register it with `registerWebviewViewProvider(BuddyPanel.viewId, …)`). Delete `stubs.ts`.

**Claude Code kickoff prompt (Akash):**
> Read ERRORBUDDY_PLAN.md. I'm Akash. Scaffold the VS Code extension and build only my files from section 5: package.json contributions, src/types.ts (copy section 3 exactly), extension.ts, errorWatcher.ts, stubs.ts and demo/broken.js. Use only the stubs for the other three modules; do not create files in src/ai, src/game, media/ or src/panel.ts. Verify with F5: introducing and fixing an error in demo/broken.js should log thinking → response → fixed in the "ErrorBuddy" Output channel.

---

## 6. Aryan: AI Brain

**Files:** `src/ai/explainer.ts`, `src/ai/personalities.ts`, `src/ai/fallback.ts`, `scripts/try-explainer.ts`
**No `vscode` imports. Runs and tests entirely from the terminal.**

**Build:**
1. `personalities.ts`: for each of the 5 personalities, a name, an emoji, a voice description and 2 example lines. Warm, never mean (the disappointed parent is funny-sad, not cruel).
2. `explainer.ts` exports `createExplainer(apiKey?: string): Explainer`:
   - No key → return the fallback explainer.
   - `explain()`: one Claude call, model `claude-haiku-5-5`, `max_tokens` about 400. **Ask for JSON only** with `reaction`, `explanation`, `fix`, `line`. Fill in `errorId`, `personality` and `legendary` yourself. If parsing fails or the call takes longer than 8 seconds, return the fallback.
   - Prompt rules:
     - `reaction`: in character, 1–3 sentences, references the actual error.
     - `explanation`: as if talking to a friend in their first week of coding. An everyday analogy, **no jargon**. Example: "You tried to get something out of a box, but the box doesn't exist yet."
     - `fix`: 1–2 concrete steps that name the actual variable or line.
     - `legendary = true`: the reaction goes wildly over the top (3–4 dramatic sentences), but the explanation and fix stay just as clear.
     - Include the language and the numbered snippet.
   - `celebrate()`: one in-character sentence that **mentions what went wrong**, e.g. "The undefined `userName` has been banished to Davy Jones' locker!" Use templates (fast, free, no failures).
3. `fallback.ts`: offline responses for the 8–10 most common JS/TS errors, matched by keywords in the message ("is not defined", "Cannot find name", "expected", "is not a function", "Cannot read properties of undefined", "Unexpected token", "is declared but", etc.), plus a generic catch-all. Each personality gets at least one reaction template; the explanation and fix can be shared.
4. `scripts/try-explainer.ts`: runs 5 hard-coded sample `BuddyError`s through every personality (with and without the key, and once with `legendary: true`) and prints the results.

**Quality bar:** read 10 outputs. The explanation must make sense to a total beginner and the fix must be correct. This is what judges will read out loud, so tune the prompt until it's great.

**Claude Code kickoff prompt (Aryan):**
> Read ERRORBUDDY_PLAN.md. I'm Aryan. Build only my files from section 6: src/types.ts (copy section 3 exactly), src/ai/personalities.ts, src/ai/explainer.ts, src/ai/fallback.ts and scripts/try-explainer.ts. Export createExplainer(apiKey?: string): Explainer exactly. No vscode imports. If there's no package.json yet, create a minimal one with @anthropic-ai/sdk, typescript and tsx. Verify with `npx tsx scripts/try-explainer.ts`.

---

## 7. Ritesh: Panel UI

**Files:** `src/panel.ts`, `media/panel.html`, `media/panel.css`, `media/panel.js`, `media/confetti.js`

**Build:**
1. Panel layout (top to bottom):
   - **Header:** personality dropdown (sends `setPersonality`) + streak counter ("🔥 4 in a row")
   - **Character card:** big emoji avatar + speech bubble with the **reaction**
   - **"What happened" box:** the **explanation**
   - **"How to fix it" box:** numbered **fix** steps + a "Go to line 12" button (sends `jumpToLine`)
   - **Idle state:** relaxed character ("No errors. Suspiciously quiet…")
   - **Thinking state:** character with a "…" typing animation
   - Avatars: 🏴‍☠️ pirate, 🎙️ sportscaster, 😔 parent, 🎭 shakespeare, 🦎 narrator
2. Delight:
   - **Fixed:** full-panel confetti, the celebration line in the bubble, the streak number pops
   - **Achievement:** a toast slides in ("🏆 Unlocked: Night Owl") for 4 seconds; queue multiple
   - **Legendary:** golden border, shake animation, "⚡ LEGENDARY ERROR ⚡" banner
   - The avatar bounces in on each new error
3. Use VS Code theme variables (`--vscode-editor-background`, `--vscode-foreground`, `--vscode-button-background`, `--vscode-button-foreground`, etc.) with fallback colors, so it works in light and dark themes and in a normal browser.
4. `panel.js`: listen with `window.addEventListener('message', …)` and handle every `ToPanel` type. Send messages with `acquireVsCodeApi().postMessage(...)`; if `acquireVsCodeApi` doesn't exist (browser), log them instead. Send `{type:'ready'}` on load.
5. **Mock mode:** if the page URL has `?mock`, cycle through fake messages every 3 seconds: `idle` → `thinking` → `response` → `fixed` → `achievement` → legendary `response` → `fixed`. Build the whole panel in Chrome this way.
6. `panel.ts`: `BuddyPanel` (see section 3 for the exact signature):
   - `resolveWebviewView()`: enable scripts, set `localResourceRoots` to `media/`, load `panel.html`, swap in `asWebviewUri` paths, add a CSP with a nonce. No CDN links.
   - `post()`: queue messages until `ready` arrives, then flush.
   - `onMessage()`: store the handler and forward webview messages to it.

**Claude Code kickoff prompt (Ritesh):**
> Read ERRORBUDDY_PLAN.md. I'm Ritesh. Build only my files from section 7: src/types.ts (copy section 3 exactly), everything in media/, and src/panel.ts exporting class BuddyPanel exactly as specified. Plain HTML/CSS/JS, VS Code theme variables with fallbacks, strict CSP with a nonce, local files only. Include the ?mock mode so I can preview in a browser. Start with media/ and do panel.ts last.

---

## 8. Shivang: Game Engine

**Files:** `src/game/engine.ts`, `src/game/achievements.ts`, `src/game/memoryStore.ts`, `scripts/try-game.ts`
**No `vscode` imports. Runs and tests entirely from the terminal.**

**Build:**
1. `achievements.ts`: the list of `Achievement`s with fun titles, descriptions and emojis:
   - `first_fix`: your first fix ever
   - `semicolon_sommelier`: the **same syntax error** (message contains "expected" or code `1005`) seen 5 times
   - `night_owl`: an error shown at or after 11 pm, or before 4 am (use the `now` passed in)
   - `streak_5`, `streak_10`: fixes in a row
   - `legendary_hunter`: you fixed a legendary error
2. `memoryStore.ts`: a simple in-memory `KeyValueStore` (a `Map` inside) for tests.
3. `engine.ts` exports `createGameEngine(store: KeyValueStore): GameEngine`:
   - Saves everything through `store` (keys prefixed `eb.`), so stats survive a VS Code restart once Akash passes in `globalState`.
   - `onErrorShown(error, now)`:
     - Resolve the personality: if the user picked `'random'`, choose a random real one; otherwise use theirs.
     - Roll **legendary**: about a 1 in 12 chance, or always if the message is longer than 200 characters. Never two legendaries in a row.
     - Count this error type (by `code`, or by message if there's no code); check `semicolon_sommelier` and `night_owl`.
   - `onFixed(error, wasLegendary, now)`: streak +1, update `bestStreak` and `totalFixes`, check `first_fix`, `streak_5`, `streak_10`, `legendary_hunter`.
   - `onErrorsPiledUp()`: streak back to 0.
   - Each achievement unlocks **once only**. `newAchievements` contains only the ones unlocked by this call.
   - `reset()` wipes everything.
4. `scripts/try-game.ts`: simulate a session with the in-memory store and print each result: 5 fixes in a row (expect `first_fix` then `streak_5`), the same syntax error 5 times (expect `semicolon_sommelier`), an error at 11:30 pm (expect `night_owl`), a pile-up (streak resets), forced legendary (message over 200 chars) then a fix (expect `legendary_hunter`), and a check that nothing unlocks twice.

**Claude Code kickoff prompt (Shivang):**
> Read ERRORBUDDY_PLAN.md. I'm Shivang. Build only my files from section 8: src/types.ts (copy section 3 exactly), src/game/achievements.ts, src/game/memoryStore.ts, src/game/engine.ts and scripts/try-game.ts. Export createGameEngine(store: KeyValueStore): GameEngine exactly. No vscode imports. If there's no package.json yet, create a minimal one with typescript and tsx. Verify with `npx tsx scripts/try-game.ts`; every expected achievement should unlock exactly once.

---

## 9. Done tests (each person proves their part alone)

| Person | Done when |
|---|---|
| **Akash** | F5 → break and fix `demo/broken.js` → Output channel shows thinking → response → fixed → idle, with stubs only. Jump-to-line works when triggered from a test command. |
| **Aryan** | `npx tsx scripts/try-explainer.ts` prints good results for all 5 personalities, with a key and without one. A legendary reaction is clearly more dramatic. Explanations contain no jargon. |
| **Ritesh** | `panel.html?mock` in Chrome shows every state, confetti, toasts and the legendary look, in both a light and a dark background. |
| **Shivang** | `npx tsx scripts/try-game.ts` shows every achievement unlocking exactly once, streaks counting and resetting correctly. |

---

## 10. Timeline (4 hours)

| Time | What happens |
|---|---|
| **0:00–0:10** | Everyone copies `types.ts` from this doc and starts. Akash scaffolds and pushes the repo. |
| **0:10–2:15** | **Independent build.** Nobody waits on anyone. Each person hits their done test (section 9). |
| **1:15** | 5-minute check-in: is the contract working for everyone? |
| **2:15–2:45** | **Merge.** Order: Shivang → Aryan → Ritesh → Akash swaps the stubs for real imports. Each person fixes bugs in their own files only. |
| **2:45–3:15** | Full run-through with `demo/broken.js`. Fix the top 3 bugs only. |
| **3:15–3:40** | Polish: prompt tuning (Aryan), animations (Ritesh), achievement titles and balance (Shivang), edge cases and nice-to-haves (Akash). |
| **3:40–4:00** | **Feature freeze.** Rehearse the demo twice. Record a backup video. |

**If a module isn't ready by 2:15**, Akash keeps its stub and the demo still runs. The fallback explainer, the stub game engine and the Output channel each keep things working. Protect the core: three-layer response + confetti.

---

## 11. Demo script (about 2 minutes)

1. "Error messages are cold and confusing. Here's what a beginner sees." Hover a raw red squiggle.
2. Open ErrorBuddy. Same error → pirate reacts, plain-English explanation, fix. Click "Go to line", fix it → confetti.
3. Switch to Shakespeare, trigger another error, fix it → the streak goes up.
4. Trigger the planted legendary error → over-the-top reaction, golden panel.
5. Trigger the same syntax error a few times → "Semicolon Sommelier" unlocks.
6. Close: "Laugh, understand, fix. Errors stop being scary."

---

## 12. Final checklist

- [ ] F5 launches with no errors in the console
- [ ] Introducing an error shows all three layers within about 4 seconds
- [ ] Fixing it triggers confetti + a celebration that mentions the original problem
- [ ] The personality dropdown changes the voice on the next error
- [ ] Streak and achievements survive a VS Code restart
- [ ] Works with no internet (fallback mode)
- [ ] Looks right in light and dark themes
- [ ] Backup demo video recorded
