// Temporary stand-ins for Aryan's, Shivang's and Ritesh's modules so the shell runs alone.
// Deleted at merge time (see ERRORBUDDY_PLAN.md section 5).
import * as vscode from 'vscode';
import {
  BuddyError,
  BuddyResponse,
  Explainer,
  FromPanel,
  GameEngine,
  GameState,
  Personality,
  PanelController,
  RealPersonality,
  ToPanel,
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

/**
 * Logs every message to the Output channel instead of drawing anything.
 * Also fills the sidebar view with a placeholder so it isn't an empty "no data provider" box.
 */
export class StubPanel implements PanelController, vscode.WebviewViewProvider {
  static readonly viewId = 'errorBuddy.panel';
  private handler: ((msg: FromPanel) => void) | undefined;

  constructor(private readonly output: vscode.OutputChannel) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    view.webview.html = `<!DOCTYPE html><html><body style="font-family: var(--vscode-font-family); padding: 8px">
      <p>🏴‍☠️ ErrorBuddy (stub panel)</p>
      <p>The real panel isn't merged yet. Messages are logged to the <b>ErrorBuddy</b> Output channel.</p>
    </body></html>`;
    // The real panel sends 'ready' when it loads; mimic that.
    this.handler?.({ type: 'ready' });
  }

  post(msg: ToPanel): void {
    this.output.appendLine(`[${new Date().toLocaleTimeString()}] → ${describe(msg)}`);
  }

  onMessage(handler: (msg: FromPanel) => void): void {
    this.handler = handler;
  }
}

function describe(msg: ToPanel): string {
  switch (msg.type) {
    case 'thinking':
      return `thinking   ${msg.personality} @ ${where(msg.error)}  ${firstLine(msg.error.message)}`;
    case 'response':
      return `response   ${msg.response.personality}${msg.response.legendary ? ' ⚡LEGENDARY⚡' : ''} @ ${where(msg.error)}\n` +
        `             reaction:    ${msg.response.reaction}\n` +
        `             explanation: ${msg.response.explanation}\n` +
        msg.response.fix.map((step, i) => `             fix ${i + 1}:       ${step}`).join('\n') +
        `\n             jump to line ${msg.response.line}`;
    case 'fixed':
      return `fixed      @ ${where(msg.error)}  streak=${msg.streak}  "${msg.celebration}"`;
    case 'achievement':
      return `achievement ${msg.achievement.emoji} ${msg.achievement.title}`;
    case 'state':
      return `state      streak=${msg.state.streak} best=${msg.state.bestStreak} fixes=${msg.state.totalFixes} ` +
        `personality=${msg.state.personality} unlocked=[${msg.state.unlocked.map((a) => a.id).join(', ')}]`;
    case 'idle':
      return 'idle';
  }
}

const where = (e: BuddyError) => `${e.fileName}:${e.line}:${e.column}`;
const firstLine = (s: string) => s.split('\n')[0];
