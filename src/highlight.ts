import * as vscode from 'vscode';
import { BuddyError } from './types';

const MASCOT = '👾';

/** Softly highlights the line ErrorBuddy is talking about, in every editor showing that file. */
export class ErrorHighlighter implements vscode.Disposable {
  private readonly normal = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: 'rgba(255, 100, 100, 0.12)',
    overviewRulerColor: 'rgba(255, 100, 100, 0.8)',
    overviewRulerLane: vscode.OverviewRulerLane.Full,
  });
  private readonly legendary = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: 'rgba(255, 200, 0, 0.18)',
    border: '1px solid rgba(255, 200, 0, 0.6)',
    overviewRulerColor: 'rgba(255, 200, 0, 1)',
    overviewRulerLane: vscode.OverviewRulerLane.Full,
  });
  private current: { error: BuddyError; legendary: boolean } | undefined;
  private readonly subscription = vscode.window.onDidChangeVisibleTextEditors(() => this.apply());

  show(error: BuddyError, legendary: boolean): void {
    this.current = { error, legendary };
    this.apply();
  }

  clear(): void {
    this.current = undefined;
    this.apply();
  }

  private apply(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      const target = this.current?.error.file === editor.document.uri.fsPath ? this.current : undefined;
      editor.setDecorations(this.normal, target && !target.legendary ? [this.decorationFor(target, editor)] : []);
      editor.setDecorations(this.legendary, target?.legendary ? [this.decorationFor(target, editor)] : []);
    }
  }

  private decorationFor(
    target: { error: BuddyError; legendary: boolean },
    editor: vscode.TextEditor,
  ): vscode.DecorationOptions {
    const line = Math.min(target.error.line - 1, editor.document.lineCount - 1);
    return {
      range: new vscode.Range(line, 0, line, 0),
      renderOptions: {
        after: {
          contentText: target.legendary ? `   ${MASCOT} ⚡ LEGENDARY ⚡` : `   ${MASCOT} ErrorBuddy is on it`,
          color: new vscode.ThemeColor('editorCodeLens.foreground'),
          fontStyle: 'italic',
        },
      },
    };
  }

  dispose(): void {
    this.subscription.dispose();
    this.normal.dispose();
    this.legendary.dispose();
  }
}
