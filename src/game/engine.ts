import {
  Achievement,
  AchievementId,
  BuddyError,
  ErrorShownResult,
  FixResult,
  GameEngine,
  GameState,
  KeyValueStore,
  Personality,
  RealPersonality,
} from '../types';
import { ACHIEVEMENTS, isNightOwlHour, isSyntaxError } from './achievements';

const REAL_PERSONALITIES: RealPersonality[] = ['pirate', 'sportscaster', 'parent', 'shakespeare', 'narrator'];

const LEGENDARY_CHANCE = 1 / 12;
const LEGENDARY_MESSAGE_LENGTH = 200;
const SOMMELIER_COUNT = 5;

const KEYS = {
  streak: 'eb.streak',
  bestStreak: 'eb.bestStreak',
  totalFixes: 'eb.totalFixes',
  personality: 'eb.personality',
  unlocked: 'eb.unlocked',
  errorCounts: 'eb.errorCounts',
  lastWasLegendary: 'eb.lastWasLegendary',
} as const;

/**
 * Creates the game engine. All state lives in `store` (keys prefixed `eb.`),
 * so passing VS Code's globalState makes stats survive a restart.
 * `random` is only there so tests can make rolls predictable.
 */
export function createGameEngine(store: KeyValueStore, random: () => number = Math.random): GameEngine {
  const unlockedIds = (): AchievementId[] => store.get<AchievementId[]>(KEYS.unlocked, []);

  /** Unlocks each id that isn't unlocked yet; returns only the newly unlocked ones. */
  async function unlock(ids: AchievementId[]): Promise<Achievement[]> {
    const already = unlockedIds();
    const fresh = ids.filter((id, i) => !already.includes(id) && ids.indexOf(id) === i);
    if (fresh.length > 0) {
      await store.update(KEYS.unlocked, [...already, ...fresh]);
    }
    return fresh.map((id) => ACHIEVEMENTS[id]);
  }

  function resolvePersonality(): RealPersonality {
    const picked = store.get<Personality>(KEYS.personality, 'random');
    if (picked !== 'random' && REAL_PERSONALITIES.includes(picked)) {
      return picked;
    }
    return REAL_PERSONALITIES[Math.floor(random() * REAL_PERSONALITIES.length)] ?? 'pirate';
  }

  function rollLegendary(error: BuddyError): boolean {
    // Huge messages are always legendary; the random roll never hits twice in a row.
    if (error.message.length > LEGENDARY_MESSAGE_LENGTH) {
      return true;
    }
    if (store.get<boolean>(KEYS.lastWasLegendary, false)) {
      return false;
    }
    return random() < LEGENDARY_CHANCE;
  }

  return {
    async onErrorShown(error: BuddyError, now: Date): Promise<ErrorShownResult> {
      const personality = resolvePersonality();
      const legendary = rollLegendary(error);
      await store.update(KEYS.lastWasLegendary, legendary);

      const typeKey = error.code ? `code:${error.code}` : `msg:${error.message}`;
      const counts = { ...store.get<Record<string, number>>(KEYS.errorCounts, {}) };
      counts[typeKey] = (counts[typeKey] ?? 0) + 1;
      await store.update(KEYS.errorCounts, counts);

      const earned: AchievementId[] = [];
      if (isSyntaxError(error.message, error.code) && counts[typeKey] >= SOMMELIER_COUNT) {
        earned.push('semicolon_sommelier');
      }
      if (isNightOwlHour(now)) {
        earned.push('night_owl');
      }

      return { personality, legendary, newAchievements: await unlock(earned) };
    },

    async onFixed(_error: BuddyError, wasLegendary: boolean, _now: Date): Promise<FixResult> {
      const streak = store.get<number>(KEYS.streak, 0) + 1;
      const bestStreak = Math.max(store.get<number>(KEYS.bestStreak, 0), streak);
      const totalFixes = store.get<number>(KEYS.totalFixes, 0) + 1;
      await store.update(KEYS.streak, streak);
      await store.update(KEYS.bestStreak, bestStreak);
      await store.update(KEYS.totalFixes, totalFixes);

      const earned: AchievementId[] = ['first_fix'];
      if (streak >= 5) {
        earned.push('streak_5');
      }
      if (streak >= 10) {
        earned.push('streak_10');
      }
      if (wasLegendary) {
        earned.push('legendary_hunter');
      }

      return { streak, newAchievements: await unlock(earned) };
    },

    async onErrorsPiledUp(): Promise<void> {
      await store.update(KEYS.streak, 0);
    },

    async setPersonality(p: Personality): Promise<void> {
      await store.update(KEYS.personality, p);
    },

    getState(): GameState {
      return {
        streak: store.get<number>(KEYS.streak, 0),
        bestStreak: store.get<number>(KEYS.bestStreak, 0),
        totalFixes: store.get<number>(KEYS.totalFixes, 0),
        personality: store.get<Personality>(KEYS.personality, 'random'),
        unlocked: unlockedIds().map((id) => ACHIEVEMENTS[id]).filter(Boolean),
      };
    },

    async reset(): Promise<void> {
      for (const key of Object.values(KEYS)) {
        await store.update(key, undefined);
      }
    },
  };
}
