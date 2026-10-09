import * as os from 'os';
import * as vscode from 'vscode';

export const MAX_USERNAME_LENGTH = 30;

/** The `errorBuddy.username` setting, or the computer's login name when it's empty. */
export function getUsername(): string {
  const fromSetting = cleanUsername(vscode.workspace.getConfiguration('errorBuddy').get<string>('username') ?? '');
  return fromSetting || loginName();
}

/** Changes only ErrorBuddy's own setting. An empty name goes back to the login name. */
export async function setUsername(name: string): Promise<void> {
  const clean = cleanUsername(name);
  await vscode.workspace
    .getConfiguration('errorBuddy')
    .update('username', clean || undefined, vscode.ConfigurationTarget.Global);
}

function cleanUsername(name: string): string {
  return String(name).replace(/\s+/g, ' ').trim().slice(0, MAX_USERNAME_LENGTH);
}

function loginName(): string {
  try {
    return cleanUsername(os.userInfo().username) || 'buddy';
  } catch {
    return 'buddy'; // userInfo() throws on some locked-down machines
  }
}
