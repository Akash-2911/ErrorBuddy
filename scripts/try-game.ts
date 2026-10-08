// Simulates an ErrorBuddy session against the in-memory store.
// Run with: npx tsx scripts/try-game.ts
import { AchievementId, BuddyError } from '../src/types';
import { createGameEngine } from '../src/game/engine';
import { MemoryStore } from '../src/game/memoryStore';

let failures = 0;
const unlockCounts = new Map<AchievementId, number>();

function check(label: string, ok: boolean): void {
  console.log(`  ${ok ? '✅' : '❌'} ${label}`);
  if (!ok) {
    failures++;
  }
}

function track(ids: { id: AchievementId }[]): AchievementId[] {
  for (const { id } of ids) {
    unlockCounts.set(id, (unlockCounts.get(id) ?? 0) + 1);
  }
  return ids.map((a) => a.id);
}

function makeError(message: string, code?: string): BuddyError {
  return {
    id: `/demo/broken.js::${message}`,
    file: '/demo/broken.js',
    fileName: 'broken.js',
    line: 3,
    column: 1,
    message,
    code,
    language: 'javascript',
    snippet: '3 | const x = y;',
  };
}

const DAYTIME = new Date(2026, 9, 8, 14, 0);
const LATE_NIGHT = new Date(2026, 9, 8, 23, 30);

// random() = 0.5 never triggers the 1-in-12 legendary roll, so results are predictable.
const store = new MemoryStore();
const game = createGameEngine(store, () => 0.5);

async function main(): Promise<void> {
  console.log('\n1. Five fixes in a row');
  const undefinedVar = makeError("Cannot find name 'userName'.", '2304');
  for (let i = 1; i <= 5; i++) {
    const shown = await game.onErrorShown(undefinedVar, DAYTIME);
    const fixed = await game.onFixed(undefinedVar, shown.legendary, DAYTIME);
    const ids = track(fixed.newAchievements);
    console.log(`  fix ${i}: streak=${fixed.streak} unlocked=[${ids.join(', ')}]`);
    if (i === 1) check('first_fix unlocks on fix 1', ids.includes('first_fix'));
    if (i === 5) check('streak_5 unlocks on fix 5', ids.includes('streak_5'));
  }

  console.log('\n2. Same syntax error 5 times');
  const missingSemi = makeError("';' expected.", '1005');
  for (let i = 1; i <= 5; i++) {
    const shown = await game.onErrorShown(missingSemi, DAYTIME);
    const ids = track(shown.newAchievements);
    console.log(`  seen ${i}: unlocked=[${ids.join(', ')}]`);
    if (i < 5) check(`no sommelier yet at ${i}`, !ids.includes('semicolon_sommelier'));
    if (i === 5) check('semicolon_sommelier unlocks on 5th sighting', ids.includes('semicolon_sommelier'));
  }

  console.log('\n3. Error at 11:30 pm');
  {
    const shown = await game.onErrorShown(makeError('x is not a function'), LATE_NIGHT);
    const ids = track(shown.newAchievements);
    console.log(`  unlocked=[${ids.join(', ')}]`);
    check('night_owl unlocks', ids.includes('night_owl'));
    const early = await game.onErrorShown(makeError('x is not a function'), new Date(2026, 9, 9, 3, 59));
    check('3:59 am does not unlock night_owl again', !track(early.newAchievements).includes('night_owl'));
  }

  console.log('\n4. Pile-up resets the streak');
  {
    const before = game.getState().streak;
    await game.onErrorsPiledUp();
    const after = game.getState();
    console.log(`  streak ${before} → ${after.streak}, bestStreak=${after.bestStreak}`);
    check('streak is 0', after.streak === 0);
    check('bestStreak kept at 5', after.bestStreak === 5);
  }

  console.log('\n5. Forced legendary (message over 200 chars), then fix');
  {
    const nasty = makeError(
      "Type '{ id: number; name: string; tags: string[]; meta: { created: Date; owner: { id: number } } }' " +
        "is not assignable to type 'Readonly<Record<string, Partial<Pick<User, \"id\" | \"name\">>>>'. " +
        'Property tags is incompatible with index signature.',
      '2322',
    );
    const shown = await game.onErrorShown(nasty, DAYTIME);
    console.log(`  message length=${nasty.message.length} legendary=${shown.legendary}`);
    check('long message is legendary', shown.legendary);
    const fixed = await game.onFixed(nasty, shown.legendary, DAYTIME);
    const ids = track(fixed.newAchievements);
    console.log(`  fix: streak=${fixed.streak} unlocked=[${ids.join(', ')}]`);
    check('legendary_hunter unlocks', ids.includes('legendary_hunter'));
    check('streak restarted at 1', fixed.streak === 1);

    const next = await game.onErrorShown(makeError('short error'), DAYTIME);
    check('short error right after is not legendary', !next.legendary);
  }

  console.log('\n6. Ten in a row');
  for (let i = 0; i < 9; i++) {
    const e = makeError(`error ${i}`);
    await game.onErrorShown(e, DAYTIME);
    const fixed = await game.onFixed(e, false, DAYTIME);
    const ids = track(fixed.newAchievements);
    if (ids.length) console.log(`  streak=${fixed.streak} unlocked=[${ids.join(', ')}]`);
  }
  check('streak_10 unlocked', unlockCounts.get('streak_10') === 1);

  console.log('\n7. Legendary roll never hits twice in a row');
  {
    const lucky = createGameEngine(new MemoryStore(), () => 0); // every roll "wins"
    const rolls: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      rolls.push((await lucky.onErrorShown(makeError('short'), DAYTIME)).legendary);
    }
    console.log(`  rolls=${rolls.map((r) => (r ? 'L' : '.')).join('')}`);
    check('no two legendaries in a row', rolls.every((r, i) => !(r && rolls[i - 1])));
  }

  console.log('\n8. Personality');
  {
    await game.setPersonality('shakespeare');
    const fixedPick = await game.onErrorShown(makeError('a'), DAYTIME);
    check('picked personality is used', fixedPick.personality === 'shakespeare');
    await game.setPersonality('random');
    const seen = new Set<string>();
    const randomGame = createGameEngine(store);
    for (let i = 0; i < 100; i++) {
      seen.add((await randomGame.onErrorShown(makeError('b'), DAYTIME)).personality);
    }
    console.log(`  random picked: ${[...seen].join(', ')}`);
    check('random resolves to real personalities only', !seen.has('random') && seen.size > 1);
    check('state remembers "random"', game.getState().personality === 'random');
  }

  console.log('\n9. Stats survive a restart (new engine, same store)');
  {
    const reopened = createGameEngine(store).getState();
    console.log(`  ${JSON.stringify({ ...reopened, unlocked: reopened.unlocked.map((a) => a.id) })}`);
    check('totalFixes persisted', reopened.totalFixes === game.getState().totalFixes && reopened.totalFixes > 0);
    check('all 6 achievements persisted', reopened.unlocked.length === 6);
    check('all keys prefixed eb.', store.keys().every((k) => k.startsWith('eb.')));
  }

  console.log('\n10. Nothing unlocked twice');
  for (const [id, count] of unlockCounts) {
    check(`${id} unlocked exactly once (${count})`, count === 1);
  }
  check('all 6 achievements seen', unlockCounts.size === 6);

  console.log('\n11. reset() wipes everything');
  {
    await game.reset();
    const s = game.getState();
    check('state is back to defaults', s.streak === 0 && s.totalFixes === 0 && s.unlocked.length === 0);
    check('store is empty', store.keys().length === 0);
    const again = await game.onFixed(makeError('x'), false, DAYTIME);
    check('first_fix can unlock again after reset', again.newAchievements.some((a) => a.id === 'first_fix'));
  }

  console.log(failures === 0 ? '\nAll checks passed 🎉' : `\n${failures} check(s) failed`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
