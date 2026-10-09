import * as vscode from 'vscode';
import { BuddyError } from './types';

const MASCOT = '👾';

/** "🔥 3 ErrorBuddy" in the bottom bar; shows the current error's line while one is on screen. Click opens the panel. */
export class BuddyStatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  private streak = 0;
  private errorLine: number | undefined;

  constructor() {
    this.item.command = 'errorBuddy.panel.focus';
    this.render();
    this.item.show();
  }

  setStreak(streak: number): void {
    this.streak = streak;
    this.render();
  }

  showError(error: BuddyError): void {
    this.errorLine = error.line;
    this.render();
  }

  clearError(): void {
    this.errorLine = undefined;
    this.render();
  }

  private render(): void {
    if (this.errorLine !== undefined) {
      this.item.text = `${MASCOT} Error on line ${this.errorLine} · 🔥 ${this.streak}`;
      this.item.tooltip = 'ErrorBuddy has an explanation for you. Click to open.';
    } else {
      this.item.text = `🔥 ${this.streak} ErrorBuddy`;
      this.item.tooltip = `Fix streak: ${this.streak} in a row. Click to open ErrorBuddy.`;
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
