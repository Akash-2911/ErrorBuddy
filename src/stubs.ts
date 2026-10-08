// Temporary stand-in for Shivang's module so the shell runs alone.
// Deleted at merge time (see ERRORBUDDY_PLAN.md section 5).
import { GameEngine, GameState, Personality } from './types';

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
