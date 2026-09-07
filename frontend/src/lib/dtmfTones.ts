// DTMF and Telephone Tone Synthesizer via Web Audio API

// Standard DTMF Frequencies (Row Hz x Column Hz)
const DTMF_FREQS: Record<string, [number, number]> = {
  '1': [697, 1209],
  '2': [697, 1336],
  '3': [697, 1477],
  '4': [770, 1209],
  '5': [770, 1336],
  '6': [770, 1477],
  '7': [852, 1209],
  '8': [852, 1336],
  '9': [852, 1477],
  '*': [941, 1209],
  '0': [941, 1336],
  '#': [941, 1477],
};

let audioCtx: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  if (!audioCtx || audioCtx.state === 'closed') {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioCtx();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
};

/**
 * Play standard DTMF touch tone for a dial pad key.
 */
export const playDtmfTone = (key: string, durationMs = 80, enabled = true) => {
  if (!enabled) return;
  const freqs = DTMF_FREQS[key];
  if (!freqs) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const dur = durationMs / 1000;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freqs[0], now);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freqs[1], now);

    // Smooth envelope to avoid click artifacts
    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + dur);
    osc2.stop(now + dur);
  } catch (_) {
    // AudioContext permission or playback issue silently handled
  }
};

/**
 * Play classic telephone ringback tone (440Hz + 480Hz) for outgoing calls.
 * Returns a stop function.
 */
export const startRingbackTone = (enabled = true): (() => void) => {
  if (!enabled) return () => {};
  const ctx = getAudioContext();
  if (!ctx) return () => {};

  let isRunning = true;
  let timer: number | null = null;

  const playBurst = () => {
    if (!isRunning) return;
    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(440, now);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(480, now);

      gainNode.gain.setValueAtTime(0.001, now);
      gainNode.gain.exponentialRampToValueAtTime(0.06, now + 0.05);
      gainNode.gain.setValueAtTime(0.06, now + 1.2);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.3);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.3);
      osc2.stop(now + 1.3);

      timer = window.setTimeout(playBurst, 3000);
    } catch (_) {}
  };

  playBurst();

  return () => {
    isRunning = false;
    if (timer) clearTimeout(timer);
  };
};

/**
 * Play standard incoming call ringtone (electronic dual-tone chime).
 * Returns a stop function.
 */
export const startIncomingRingtone = (enabled = true): (() => void) => {
  if (!enabled) return () => {};
  const ctx = getAudioContext();
  if (!ctx) return () => {};

  let isRunning = true;
  let timer: number | null = null;

  const playRingCycle = () => {
    if (!isRunning) return;
    try {
      const now = ctx.currentTime;
      // Electronic phone chime pair: 853Hz + 960Hz
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(853, now);
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(960, now);

      gainNode.gain.setValueAtTime(0.001, now);
      gainNode.gain.exponentialRampToValueAtTime(0.08, now + 0.04);
      gainNode.gain.setValueAtTime(0.08, now + 0.75);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.85);
      osc2.stop(now + 0.85);

      timer = window.setTimeout(playRingCycle, 2000);
    } catch (_) {}
  };

  playRingCycle();

  return () => {
    isRunning = false;
    if (timer) clearTimeout(timer);
  };
};
