import { Achievement, AchievementId } from '../types';

export const ACHIEVEMENTS: Record<AchievementId, Achievement> = {
  first_fix: {
    id: 'first_fix',
    title: 'First Blood',
    description: 'Fixed your very first error. The journey of a thousand bugs begins with one.',
    emoji: '🩹',
  },
  semicolon_sommelier: {
    id: 'semicolon_sommelier',
    title: 'Semicolon Sommelier',
    description: 'Met the same syntax error 5 times. You can now identify it by its bouquet.',
    emoji: '🍷',
  },
  night_owl: {
    id: 'night_owl',
    title: 'Night Owl',
    description: 'Hit an error after 11 pm or before 4 am. Bugs are scarier in the dark.',
    emoji: '🦉',
  },
  streak_5: {
    id: 'streak_5',
    title: 'On Fire',
    description: 'Fixed 5 errors in a row without things piling up.',
    emoji: '🔥',
  },
  streak_10: {
    id: 'streak_10',
    title: 'Unstoppable',
    description: 'Fixed 10 errors in a row. The bugs are filing a complaint.',
    emoji: '⚡',
  },
  legendary_hunter: {
    id: 'legendary_hunter',
    title: 'Legendary Hunter',
    description: 'Slayed a legendary error. Bards will sing of this day.',
    emoji: '🐉',
  },
};

/** Syntax errors that count toward Semicolon Sommelier. */
export function isSyntaxError(message: string, code?: string): boolean {
  return code === '1005' || message.toLowerCase().includes('expected');
}

/** At or after 11 pm, or before 4 am (local time of `now`). */
export function isNightOwlHour(now: Date): boolean {
  const hour = now.getHours();
  return hour >= 23 || hour < 4;
}
