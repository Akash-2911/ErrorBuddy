import { ChildProcess, spawn } from 'child_process';

/**
 * Reads roasts aloud with the operating system's built-in voice: offline, no extra installs.
 * On Windows the line is "acted" with SSML (a reaction word, comic pauses, a slower deadpan punchline,
 * and a building crescendo for legendary errors). Only one line plays at a time.
 */
export class RoastSpeaker {
  private current: ChildProcess | undefined;

  speak(text: string, dramatic = false, voice = 'David'): void {
    const clean = forSpeech(text);
    if (!clean) {
      return;
    }
    this.stop();
    const child = startVoice(clean, dramatic, voice);
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

function startVoice(text: string, dramatic: boolean, voice: string): ChildProcess {
  switch (process.platform) {
    case 'win32': {
      // The SSML goes in on stdin and the script is base64-encoded, so nothing in a roast can break the command.
      const encoded = Buffer.from(windowsScript(voice), 'utf16le').toString('base64');
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
        windowsHide: true,
      });
      child.stdin?.on('error', () => undefined);
      child.stdin?.end(toSsml(text, dramatic), 'utf8');
      return child;
    }
    case 'darwin':
      return spawn('say', dramatic ? ['-r', '140', text] : [text]);
    default:
      return spawn('spd-say', dramatic ? ['-r', '-40', text] : [text]);
  }
}

/**
 * Uses the newer Windows voices (Mark, Linda, any voice added in Settings > Speech),
 * and falls back to the classic voices if those aren't available.
 */
function windowsScript(voice: string): string {
  const name = voice.replace(/[^\w ]/g, '');
  return `
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.Encoding]::UTF8
$ssml = [Console]::In.ReadToEnd()
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  [void][Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
  [void][Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
  } | Select-Object -First 1
  function Await($op, [Type]$type) {
    $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
    [void]$task.Wait()
    $task.Result
  }
  $synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
  $v = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.DisplayName -like '*${name}*' } | Select-Object -First 1
  if ($v) { $synth.Voice = $v }
  $stream = Await ($synth.SynthesizeSsmlToStreamAsync($ssml)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
  $size = [uint32]$stream.Size
  [void](Await ($reader.LoadAsync($size)) ([uint32]))
  $bytes = New-Object byte[] $size
  $reader.ReadBytes($bytes)
  (New-Object System.Media.SoundPlayer(New-Object System.IO.MemoryStream(, $bytes))).PlaySync()
} catch {
  Add-Type -AssemblyName System.Speech
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  try { $s.SelectVoice('Microsoft ${name} Desktop') } catch {}
  $s.SpeakSsml($ssml)
}
`;
}

const OPENERS = [
  { text: 'Hmm.', rate: '-25%', pitch: '-10%' },
  { text: 'Wow.', rate: '-35%', pitch: '+15%' },
  { text: 'Yikes.', rate: '-15%', pitch: '+10%' },
  { text: 'Oh dear.', rate: '-20%', pitch: '-5%' },
  { text: 'Well, well.', rate: '-20%', pitch: '-5%' },
];
const DRAMATIC_OPENERS = [
  { text: 'Oh. My. Goodness.', rate: '-35%', pitch: '+20%' },
  { text: 'Ladies and gentlemen.', rate: '-25%', pitch: '+10%' },
  { text: 'Stop. Everything.', rate: '-30%', pitch: '+15%' },
];

/** Acts the roast out: reaction word, pause, setup, pause, slow deadpan punchline. Legendary lines build up. */
function toSsml(text: string, dramatic: boolean): string {
  const sentences = (text.match(/[^.!?]+[.!?]*/g) ?? [text]).map((s) => s.trim()).filter(Boolean);
  const pool = dramatic ? DRAMATIC_OPENERS : OPENERS;
  const opener = pool[Math.floor(Math.random() * pool.length)];
  const parts = [prosody(opener.text, opener.rate, opener.pitch), pause(dramatic ? 700 : 400)];

  sentences.forEach((sentence, i) => {
    const isPunchline = i === sentences.length - 1 && sentences.length > 1;
    const excited = sentence.endsWith('!');
    if (dramatic) {
      if (isPunchline) {
        parts.push(pause(800), prosody(sentence, '-35%', '-20%', 'x-loud'));
      } else {
        // Each line climbs a little higher and louder than the one before.
        parts.push(prosody(sentence, '-15%', `+${10 + i * 10}%`, i === 0 ? 'loud' : 'x-loud'), pause(500));
      }
    } else if (isPunchline) {
      parts.push(pause(450), prosody(sentence, '-20%', '-12%'));
    } else {
      parts.push(prosody(sentence, excited ? '+5%' : '-5%', excited ? '+12%' : '+0%'));
    }
  });

  return (
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">' + parts.join('') + '</speak>'
  );
}

function prosody(text: string, rate: string, pitch: string, volume = 'medium'): string {
  return `<prosody rate="${rate}" pitch="${pitch}" volume="${volume}">${escapeXml(text)}</prosody>`;
}

const pause = (ms: number) => `<break time="${ms}ms"/>`;

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Drops emoji, backticks and other symbols that voices read out awkwardly. */
function forSpeech(text: string): string {
  return text
    .replace(/[`*_#~]/g, '')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}
