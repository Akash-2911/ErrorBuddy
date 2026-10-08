import * as vscode from 'vscode';
import type { FromPanel, PanelController, ToPanel } from './types';

/** The ErrorBuddy side panel. Loads media/panel.html into a webview and relays messages. */
export class BuddyPanel implements vscode.WebviewViewProvider, PanelController {
  static readonly viewId = 'errorBuddy.panel';

  private view?: vscode.WebviewView;
  private ready = false;
  private queue: ToPanel[] = [];
  private handlers: Array<(msg: FromPanel) => void> = [];
  /** What the panel should be showing, so it can be restored if the webview is re-created. */
  private lastScene?: ToPanel;

  constructor(private readonly extensionUri: vscode.Uri) {}

  async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
    const mediaUri = vscode.Uri.joinPath(this.extensionUri, 'media');

    this.view = view;
    this.ready = false;

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [mediaUri],
    };

    view.webview.onDidReceiveMessage((msg: FromPanel) => {
      if (!msg || typeof msg.type !== 'string') {
        return;
      }
      if (msg.type === 'ready') {
        this.ready = true;
        this.flush();
      }
      this.handlers.forEach((handler) => handler(msg));
    });

    view.onDidDispose(() => {
      if (this.view === view) {
        this.view = undefined;
        this.ready = false;
      }
    });

    view.webview.html = await this.buildHtml(view.webview, mediaUri);
  }

  post(msg: ToPanel): void {
    this.rememberScene(msg);
    if (this.ready && this.view) {
      void this.view.webview.postMessage(msg);
      return;
    }
    // While the panel is closed only the latest message of each type matters,
    // except achievements, which should all get their toast.
    if (msg.type !== 'achievement') {
      this.queue = this.queue.filter((queued) => queued.type !== msg.type);
    }
    this.queue.push(msg);
  }

  onMessage(handler: (msg: FromPanel) => void): void {
    this.handlers.push(handler);
  }

  private rememberScene(msg: ToPanel): void {
    if (msg.type === 'thinking' || msg.type === 'response' || msg.type === 'idle') {
      this.lastScene = msg;
    } else if (msg.type === 'fixed') {
      // Don't replay a celebration (and its confetti) when the panel is reopened later.
      this.lastScene = { type: 'idle' };
    }
  }

  private flush(): void {
    if (!this.view) {
      return;
    }
    const pending = this.queue;
    this.queue = [];

    const hasScene = pending.some((msg) => msg.type !== 'achievement' && msg.type !== 'state');
    if (!hasScene && this.lastScene) {
      pending.unshift(this.lastScene);
    }
    for (const msg of pending) {
      void this.view.webview.postMessage(msg);
    }
  }

  private async buildHtml(webview: vscode.Webview, mediaUri: vscode.Uri): Promise<string> {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(mediaUri, 'panel.html'));
    const nonce = createNonce();
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} data:`,
      `font-src ${webview.cspSource}`,
    ].join('; ');

    return new TextDecoder('utf-8')
      .decode(bytes)
      .replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${csp}">`)
      .replace(/(href|src)="(panel\.css|panel\.js|confetti\.js)"/g, (_match, attr: string, file: string) => {
        const uri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, file));
        return `${attr}="${uri.toString()}"`;
      })
      .replace(/<script /g, `<script nonce="${nonce}" `);
  }
}

function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
