import { ChildProcess, spawn } from 'child_process';

/**
 * Reads text aloud with the operating system's built-in voice: offline, no extra installs.
 * Only one line plays at a time; a new one cuts off the old one.
 */
export class RoastSpeaker {
  private current: ChildProcess | undefined;

  speak(text: string, dramatic = false): void {
    const clean = forSpeech(text);
    if (!clean) {
      return;
    }
    this.stop();
    const child = startVoice(clean, dramatic);
    if (!child) {
      return;
    }
    this.current = child;
    child.on('error', () => undefined); // no voice installed: stay quiet rather than crash
    child.on('exit', () => {
      if (this.current === child) {
        this.current = undefined;
      }
    });
  }

  stop(): void {
    this.current?.kill();
    this.current = undefined;
  }

  dispose(): void {
    this.stop();
  }
}

function startVoice(text: string, dramatic: boolean): ChildProcess | undefined {
  switch (process.platform) {
    case 'win32': {
      // Text goes in on stdin, so quotes or symbols in a roast can't break the command.
      const script =
        'Add-Type -AssemblyName System.Speech; ' +
        '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ' +
        `$s.Rate = ${dramatic ? -3 : 0}; ` +
        '$s.Speak([Console]::In.ReadToEnd())';
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        windowsHide: true,
      });
      child.stdin?.on('error', () => undefined);
      child.stdin?.end(text);
      return child;
    }
    case 'darwin':
      return spawn('say', dramatic ? ['-r', '140', text] : [text]);
    default:
      return spawn('spd-say', dramatic ? ['-r', '-40', text] : [text]);
  }
}

/** Drops emoji, backticks and other symbols that voices read out awkwardly. */
function forSpeech(text: string): string {
  return text
    .replace(/[`*_#~]/g, '')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}
