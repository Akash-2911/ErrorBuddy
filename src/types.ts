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
