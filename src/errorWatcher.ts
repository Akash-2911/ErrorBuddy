import * as path from 'path';
import * as vscode from 'vscode';
import { BuddyError } from './types';

const DEBOUNCE_MS = 1500;
const PILE_UP_THRESHOLD = 3;
const SNIPPET_RADIUS = 3;

/**
 * Watches the active editor's error diagnostics (red squiggles) and turns them into
 * "a new error is being shown" / "the shown error got fixed" / "no errors left" events.
 */
export class ErrorWatcher implements vscode.Disposable {
  private readonly newErrorEmitter = new vscode.EventEmitter<BuddyError>();
  private readonly fixedEmitter = new vscode.EventEmitter<BuddyError>();
  private readonly idleEmitter = new vscode.EventEmitter<void>();
  private readonly pileUpEmitter = new vscode.EventEmitter<void>();

  /** The first error in the active file changed to a different one. */
  readonly onNewError = this.newErrorEmitter.event;
  /** The error being shown is no longer reported. */
  readonly onFixed = this.fixedEmitter.event;
  /** The active file has no errors (fires once per transition). */
  readonly onIdle = this.idleEmitter.event;
  /** The error count jumped by 3+ in one go. */
  readonly onPiledUp = this.pileUpEmitter.event;

  private shown: BuddyError | undefined;
  /** How many errors share the shown error's id (e.g. two "',' expected." in one file). */
  private shownCopies = 0;
  private idle = false;
  private readonly lastCounts = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.disposables.push(
      this.newErrorEmitter,
      this.fixedEmitter,
      this.idleEmitter,
      this.pileUpEmitter,
      vscode.languages.onDidChangeDiagnostics((e) => {
        const doc = activeDocument();
        if (doc && e.uris.some((uri) => uri.toString() === doc.uri.toString())) {
          this.schedule();
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(() => this.schedule()),
    );
    this.schedule();
  }

  /** The error currently being shown, if any. */
  get current(): BuddyError | undefined {
    return this.shown;
  }

  private schedule(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.evaluate();
    }, DEBOUNCE_MS);
  }

  private evaluate(): void {
    const doc = activeDocument();
    if (!doc) {
      return; // e.g. focus moved to a panel; keep showing what we have
    }

    const errors = vscode.languages
      .getDiagnostics(doc.uri)
      .filter((d) => d.severity === vscode.DiagnosticSeverity.Error)
      .sort((a, b) => a.range.start.compareTo(b.range.start))
      .map((d) => toBuddyError(doc, d));

    const key = doc.uri.toString();
    const previousCount = this.lastCounts.get(key);
    this.lastCounts.set(key, errors.length);
    if (previousCount !== undefined && errors.length - previousCount >= PILE_UP_THRESHOLD) {
      this.pileUpEmitter.fire();
    }

    if (this.shown) {
      if (this.shown.file !== doc.uri.fsPath) {
        // Switched files: the old error wasn't fixed, we just stopped looking at it.
        this.shown = undefined;
      } else if (copiesOf(errors, this.shown.id) < this.shownCopies) {
        // Gone, or one of several identical errors was fixed.
        const fixed = this.shown;
        this.shown = undefined;
        this.fixedEmitter.fire(fixed);
      }
    }

    const first = errors[0];
    if (!first) {
      if (!this.idle) {
        this.idle = true;
        this.idleEmitter.fire();
      }
      return;
    }

    this.idle = false;
    const sameAsShown = this.shown?.id === first.id;
    // Same error: its line may have moved. Otherwise the new first error takes over.
    this.shown = first;
    this.shownCopies = copiesOf(errors, first.id);
    if (!sameAsShown) {
      this.newErrorEmitter.fire(first);
    }
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.disposables.forEach((d) => d.dispose());
  }
}

function copiesOf(errors: BuddyError[], id: string): number {
  return errors.filter((e) => e.id === id).length;
}

function activeDocument():vscode.TextDocument | undefined {
  const doc = vscode.window.activeTextEditor?.document;
  return doc && (doc.uri.scheme === 'file' || doc.uri.scheme === 'untitled') ? doc : undefined;
}

function toBuddyError(doc: vscode.TextDocument, d: vscode.Diagnostic): BuddyError {
  const file = doc.uri.fsPath;
  return {
    id: `${file}::${d.message}`,
    file,
    fileName: path.basename(file),
    line: d.range.start.line + 1,
    column: d.range.start.character + 1,
    message: d.message,
    code: codeOf(d),
    language: doc.languageId,
    snippet: snippetAround(doc, d.range.start.line),
  };
}

function codeOf(d: vscode.Diagnostic): string | undefined {
  const code = typeof d.code === 'object' ? d.code.value : d.code;
  return code === undefined ? undefined : String(code);
}

/** The error line ±3 lines, each prefixed with its 1-based line number: "12 | const x = y;". */
function snippetAround(doc: vscode.TextDocument, line: number): string {
  const from = Math.max(0, line - SNIPPET_RADIUS);
  const to = Math.min(doc.lineCount - 1, line + SNIPPET_RADIUS);
  const width = String(to + 1).length;
  const lines: string[] = [];
  for (let i = from; i <= to; i++) {
    lines.push(`${String(i + 1).padStart(width)} | ${doc.lineAt(i).text}`);
  }
  return lines.join('\n');
}
