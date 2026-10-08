// Temporary stand-ins for Aryan's and Shivang's modules so the shell runs alone.
// Deleted at merge time (see ERRORBUDDY_PLAN.md section 5).
import {
  BuddyError,
  BuddyResponse,
  Explainer,
  GameEngine,
  GameState,
  Personality,
  RealPersonality,
} from './types';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Returns a fixed response after a 1-second delay. */
export function createStubExplainer(): Explainer {
  return {
    async explain(error: BuddyError, personality: RealPersonality, legendary: boolean): Promise<BuddyResponse> {
      await delay(1000);
      return {
        errorId: error.id,
        personality,
        reaction: `Arr, ye've run aground on line ${error.line}!`,
        explanation: 'Something on this line confused the computer. (Stub explainer.)',
        fix: [`Look closely at line ${error.line}: ${error.message}`],
        line: error.line,
        legendary,
      };
    },
    async celebrate(error: BuddyError): Promise<string> {
      return `Yo ho ho! "${error.message}" walks the plank!`;
    },
  };
}

/** In-memory streak counter. Always pirate, never legendary, no achievements. */
export function createStubGame(): GameEngine {
  const fresh = (): GameState => ({ streak: 0, bestStreak: 0, totalFixes: 0, personality: 'pirate', unlocked: [] });
  let state = fresh();
  return {
    async onErrorShown() {
      return { personality: 'pirate', legendary: false, newAchievements: [] };
    },
    async onFixed() {
      state.streak++;
      state.totalFixes++;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      return { streak: state.streak, newAchievements: [] };
    },
    async onErrorsPiledUp() {
      state.streak = 0;
    },
    async setPersonality(p: Personality) {
      state.personality = p;
    },
    getState() {
      return { ...state, unlocked: [...state.unlocked] };
    },
    async reset() {
      state = fresh();
    },
  };
}

