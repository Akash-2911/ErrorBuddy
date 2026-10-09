import * as vscode from 'vscode';
import { ErrorWatcher } from './errorWatcher';
import { createExplainer } from './ai/explainer';
import { ACHIEVEMENTS } from './game/achievements';
import { createGameEngine } from './game/engine';
import { ErrorHighlighter } from './highlight';
import { BuddyPanel } from './panel';
import { getUsername, setUsername } from './profile';
import { BuddyStatusBar } from './statusBar';
import {
  Achievement,
  BuddyError,
  BuddyResponse,
  Explainer,
  FromPanel,
  GameEngine,
  RealPersonality,
  ToPanel,
} from './types';

/** How long the celebration stays on screen before the panel goes idle. */
const CELEBRATION_MS = 4000;

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('ErrorBuddy');

  const makeExplainer = (): Explainer => createExplainer(getApiKey());
  let explainer = makeExplainer();
  const game: GameEngine = createGameEngine(context.globalState);
  const buddyPanel = new BuddyPanel(context.extensionUri);
  // Everything sent to the panel is also logged, which makes demo-day debugging much easier.
  const panel = {
    post(msg: ToPanel) {
      output.appendLine(`[${new Date().toLocaleTimeString()}] → ${msg.type}`);
      buddyPanel.post(msg);
    },
    onMessage: buddyPanel.onMessage.bind(buddyPanel),
  };

  const watcher = new ErrorWatcher();
  const highlighter = new ErrorHighlighter();
  const statusBar = new BuddyStatusBar();
  statusBar.setStreak(game.getState().streak);
  const cache = new Map<string, BuddyResponse>();

  // What is on screen right now, so a later fix can be celebrated in the same voice.
  let shown: { errorId: string; personality: RealPersonality; legendary: boolean } | undefined;
  let lastFixedAt = 0;

  // Events are handled one at a time, in order, so e.g. 'fixed' can't land after the next 'thinking'.
  // `latest` lets queued work for an error notice that a newer error (or idle) has replaced it.
  let queue: Promise<void> = Promise.resolve();
  let latest = 0;
  const enqueue = (label: string, job: () => Promise<void>) => {
    queue = queue.then(job).catch((err) => output.appendLine(`[error] ${label}: ${err?.stack ?? err}`));
  };

  const postAchievements = (list: Achievement[]) => {
    for (const achievement of list) {
      panel.post({ type: 'achievement', achievement });
    }
  };
  const postState = () => {
    const state = game.getState();
    statusBar.setStreak(state.streak);
    panel.post({ type: 'state', state });
  };

  // The line highlight and status bar follow whatever error the panel is talking about.
  const markShown = (error: BuddyError, legendary: boolean) => {
    highlighter.show(error, legendary);
    statusBar.showError(error);
  };
  const clearMarks = () => {
    highlighter.clear();
    statusBar.clearError();
  };

  /** Pops the ErrorBuddy panel open, then hands the keyboard straight back to the editor. */
  const revealPanel = async () => {
    const editor = vscode.window.activeTextEditor;
    try {
      await vscode.commands.executeCommand('errorBuddy.panel.focus');
      if (editor) {
        await vscode.window.showTextDocument(editor.document, { viewColumn: editor.viewColumn, preserveFocus: false });
      }
    } catch (err) {
      output.appendLine(`[error] revealPanel: ${err}`);
    }
  };
  const postProfile = () =>
    panel.post({ type: 'profile', username: getUsername(), achievements: Object.values(ACHIEVEMENTS) });

  const handleNewError = async (error: BuddyError, ticket: number) => {
    if (ticket !== latest) {
      return; // already replaced by a newer error before we got to it
    }
    const result = await game.onErrorShown(error, new Date());
    shown = { errorId: error.id, personality: result.personality, legendary: result.legendary };
    await revealPanel();
    panel.post({ type: 'thinking', error, personality: result.personality });
    markShown(error, result.legendary);

    const cacheKey = `${error.message}::${result.personality}::${result.legendary}`;
    let response = cache.get(cacheKey);
    if (response) {
      response = { ...response, errorId: error.id, line: error.line };
    } else {
      try {
        response = await explainer.explain(error, result.personality, result.legendary);
        cache.set(cacheKey, response);
      } catch (err) {
        output.appendLine(`[error] explain failed: ${err}`);
        response = lastResortResponse(error, result.personality, result.legendary);
      }
    }

    if (ticket !== latest) {
      return; // the user moved on while we were thinking
    }
    panel.post({ type: 'response', error, response });
    postAchievements(result.newAchievements);
    postState();
  };

  const handleFixed = async (error: BuddyError) => {
    const was = shown?.errorId === error.id ? shown : undefined;
    shown = undefined;
    clearMarks();
    const personality = was?.personality ?? 'pirate';
    const [celebration, result] = await Promise.all([
      explainer.celebrate(error, personality).catch(() => `Fixed! "${error.message}" is gone.`),
      game.onFixed(error, was?.legendary ?? false, new Date()),
    ]);
    lastFixedAt = Date.now();
    panel.post({ type: 'fixed', error, celebration, streak: result.streak });
    postAchievements(result.newAchievements);
    postState();
  };

  const handleIdle = async (ticket: number) => {
    // Let the confetti and celebration line breathe before switching to idle.
    const wait = lastFixedAt + CELEBRATION_MS - Date.now();
    if (wait > 0) {
      setTimeout(() => enqueue('idle', () => handleIdle(ticket)), wait);
      return;
    }
    if (ticket === latest) {
      shown = undefined;
      clearMarks();
      panel.post({ type: 'idle' });
    }
  };

  const jumpToLine = async (file: string, line: number) => {
    const uri = file.includes('://') ? vscode.Uri.parse(file) : vscode.Uri.file(file);
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc, { preview: false });
    const lineIndex = Math.min(Math.max(line - 1, 0), doc.lineCount - 1);
    const column = doc.lineAt(lineIndex).firstNonWhitespaceCharacterIndex;
    const position = new vscode.Position(lineIndex, column);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
  };

  const handlePanelMessage = (msg: FromPanel) => {
    switch (msg.type) {
      case 'ready':
        postState();
        postProfile();
        break;
      case 'setPersonality':
        enqueue('setPersonality', async () => {
          await game.setPersonality(msg.personality);
          postState();
        });
        break;
      case 'jumpToLine':
        jumpToLine(msg.file, msg.line).catch((err) => output.appendLine(`[error] jumpToLine: ${err}`));
        break;
      case 'setUsername':
        setUsername(msg.username)
          .then(postProfile)
          .catch((err) => output.appendLine(`[error] setUsername: ${err}`));
        break;
    }
  };
  panel.onMessage(handlePanelMessage);

  context.subscriptions.push(
    output,
    watcher,
    highlighter,
    statusBar,
    vscode.window.registerWebviewViewProvider(BuddyPanel.viewId, buddyPanel),
    watcher.onNewError((error) => {
      const ticket = ++latest;
      enqueue('new error', () => handleNewError(error, ticket));
    }),
    watcher.onFixed((error) => enqueue('fixed', () => handleFixed(error))),
    watcher.onIdle(() => {
      const ticket = ++latest;
      enqueue('idle', () => handleIdle(ticket));
    }),
    watcher.onPiledUp(() =>
      enqueue('pile-up', async () => {
        await game.onErrorsPiledUp();
        postState();
      }),
    ),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('errorBuddy.apiKey')) {
        explainer = makeExplainer();
        cache.clear();
      }
      if (e.affectsConfiguration('errorBuddy.username')) {
        postProfile();
      }
    }),
    vscode.commands.registerCommand('errorBuddy.resetStats', () =>
      enqueue('reset', async () => {
        await game.reset();
        postState();
        vscode.window.showInformationMessage('ErrorBuddy stats reset. Fresh start!');
      }),
    ),
    // Test hook for jump-to-line; does exactly what the panel's "Go to line" button does.
    vscode.commands.registerCommand('errorBuddy.jumpToCurrentError', () => {
      const error = watcher.current;
      if (!error) {
        vscode.window.showInformationMessage('ErrorBuddy: no error is being shown right now.');
        return;
      }
      handlePanelMessage({ type: 'jumpToLine', file: error.file, line: error.line });
    }),
  );

  output.appendLine(`ErrorBuddy activated (${getApiKey() ? 'API key found' : 'no API key, offline mode'}).`);
}

export function deactivate(): void {}

/** Setting first, then the ANTHROPIC_API_KEY env var. Undefined means offline/fallback mode. */
function getApiKey(): string | undefined {
  const fromSetting = vscode.workspace.getConfiguration('errorBuddy').get<string>('apiKey')?.trim();
  return fromSetting || process.env.ANTHROPIC_API_KEY || undefined;
}

/** Only used if the explainer itself throws, which the real one shouldn't. */
function lastResortResponse(error: BuddyError, personality: RealPersonality, legendary: boolean): BuddyResponse {
  return {
    errorId: error.id,
    personality,
    reaction: 'Hmm, this one has me stumped for a second!',
    explanation: error.message,
    fix: [`Take a look at line ${error.line} in ${error.fileName}.`],
    line: error.line,
    legendary,
  };
}
