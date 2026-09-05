// Centralized Sound & Notification Manager for FoodHub POS & Kitchen Display System

let audioCtx = null;
let originalTitle = typeof document !== 'undefined' ? (document.title || 'FoodHub') : 'FoodHub';
let titleFlashInterval = null;
let isMuted = typeof localStorage !== 'undefined' ? (localStorage.getItem('foodhub_sound_muted') === 'true') : false;

// Initialize or return AudioContext
const getAudioContext = () => {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  return audioCtx;
};

// Check if audio is currently allowed/unlocked by browser policy
export const isAudioUnlocked = () => {
  if (!audioCtx) return false;
  return audioCtx.state === 'running';
};

// Explicitly unlock and resume audio on user gesture
export const unlockAudio = async () => {
  const ctx = getAudioContext();
  if (!ctx) return false;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch (e) {
      console.warn('[SoundAlerts] Unable to resume AudioContext:', e);
    }
  }
  return ctx.state === 'running';
};

// Attach transparent listeners to unlock AudioContext on first interaction
if (typeof window !== 'undefined') {
  const handleInteraction = () => {
    unlockAudio().then((unlocked) => {
      if (unlocked) {
        window.removeEventListener('click', handleInteraction);
        window.removeEventListener('touchstart', handleInteraction);
        window.removeEventListener('keydown', handleInteraction);
      }
    });
  };

  window.addEventListener('click', handleInteraction, { passive: true });
  window.addEventListener('touchstart', handleInteraction, { passive: true });
  window.addEventListener('keydown', handleInteraction, { passive: true });
}

// Synthesize a chime note with bright, sparkling harmonics and rich acoustic sustain
const playChimeNote = (ctx, freq, startTime, duration = 1.6, baseVolume = 0.75) => {
  if (!ctx || ctx.state !== 'running') return;

  // Master gain for this note
  const noteGain = ctx.createGain();
  noteGain.gain.setValueAtTime(baseVolume, startTime);
  noteGain.gain.exponentialRampToValueAtTime(0.0005, startTime + duration);
  noteGain.connect(ctx.destination);

  // Fundamental frequency (Sine for warmth and body)
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(freq, startTime);
  const gain1 = ctx.createGain();
  gain1.gain.setValueAtTime(0.75, startTime);
  osc1.connect(gain1);
  gain1.connect(noteGain);
  osc1.start(startTime);
  osc1.stop(startTime + duration);

  // Bright second harmonic (Triangle for clear metallic ring)
  const osc2 = ctx.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(freq * 2.005, startTime);
  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(0.4, startTime);
  gain2.gain.exponentialRampToValueAtTime(0.001, startTime + duration * 0.75);
  osc2.connect(gain2);
  gain2.connect(noteGain);
  osc2.start(startTime);
  osc2.stop(startTime + duration);

  // Sparkle / High metallic shimmer (for extra bright bell character)
  const osc3 = ctx.createOscillator();
  osc3.type = 'sine';
  osc3.frequency.setValueAtTime(freq * 3.01, startTime);
  const gain3 = ctx.createGain();
  gain3.gain.setValueAtTime(0.22, startTime);
  gain3.gain.exponentialRampToValueAtTime(0.001, startTime + duration * 0.6);
  osc3.connect(gain3);
  gain3.connect(noteGain);
  osc3.start(startTime);
  osc3.stop(startTime + duration);

  // Crystal overtone (Very high brilliance ring)
  const osc4 = ctx.createOscillator();
  osc4.type = 'sine';
  osc4.frequency.setValueAtTime(freq * 4.25, startTime);
  const gain4 = ctx.createGain();
  gain4.gain.setValueAtTime(0.15, startTime);
  gain4.gain.exponentialRampToValueAtTime(0.001, startTime + duration * 0.5);
  osc4.connect(gain4);
  gain4.connect(noteGain);
  osc4.start(startTime);
  osc4.stop(startTime + duration);
};

/**
 * Plays a resonant, bright, and long restaurant service bell (Kitchen view)
 */
export const playKitchenChime = async () => {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') await unlockAudio();
  if (ctx.state !== 'running') return;

  const now = ctx.currentTime;
  // Resonant 4-tone bright kitchen bell sequence (~2.4 seconds total ring)
  playChimeNote(ctx, 880.00, now, 1.2, 0.75);          // A5
  playChimeNote(ctx, 1108.73, now + 0.22, 1.4, 0.85); // C#6
  playChimeNote(ctx, 1318.51, now + 0.44, 1.6, 0.9);  // E6
  playChimeNote(ctx, 1760.00, now + 0.66, 2.4, 0.95); // A6 (Long bright finish)
};

/**
 * Plays a bright, melodic, and long chime for Online Orders (Web / WhatsApp)
 */
export const playOnlineOrderAlert = async () => {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') await unlockAudio();
  if (ctx.state !== 'running') return;

  const now = ctx.currentTime;
  // Long, sparkling 5-note melodic chime (~2.8 seconds total ring)
  playChimeNote(ctx, 783.99, now, 1.0, 0.7);           // G5
  playChimeNote(ctx, 1046.50, now + 0.18, 1.2, 0.8);  // C6
  playChimeNote(ctx, 1318.51, now + 0.36, 1.4, 0.85); // E6
  playChimeNote(ctx, 1567.98, now + 0.54, 1.6, 0.9);  // G6
  // Climax bell with double resonance and brilliant lingering sustain
  playChimeNote(ctx, 2093.00, now + 0.75, 2.6, 0.95); // C7 (Crisp high bell)
  playChimeNote(ctx, 2637.02, now + 0.80, 1.9, 0.5);  // E7 (Crystal sparkle overtone)
};

/**
 * Dispatches the appropriate alert sound based on order type
 */
export const playOrderSound = async (order = {}) => {
  const isOnline = order?.order_type === 'online' || order?.order_type === 'whatsapp';
  if (isOnline) {
    await playOnlineOrderAlert();
  } else {
    await playKitchenChime();
  }
};

/**
 * Test sound function for UI buttons
 */
export const testAlertSound = async (isOnline = true) => {
  await unlockAudio();
  if (isOnline) {
    await playOnlineOrderAlert();
  } else {
    await playKitchenChime();
  }
};

// Sound preferences
export const getIsMuted = () => isMuted;

export const setIsMuted = (muted) => {
  isMuted = !!muted;
  try {
    localStorage.setItem('foodhub_sound_muted', isMuted ? 'true' : 'false');
  } catch (e) {}
};

/**
 * Alternates the document title between an alert message and original title
 */
export const startTitleFlash = (alertText = '🔔 ¡NUEVO PEDIDO!') => {
  if (typeof document === 'undefined') return;
  stopTitleFlash();
  originalTitle = document.title || 'FoodHub';
  let isAlert = true;

  titleFlashInterval = setInterval(() => {
    document.title = isAlert ? alertText : originalTitle;
    isAlert = !isAlert;
  }, 900);

  // Auto-stop when window receives focus
  const stopOnFocus = () => {
    stopTitleFlash();
    window.removeEventListener('focus', stopOnFocus);
  };
  window.addEventListener('focus', stopOnFocus, { once: true });
};

export const stopTitleFlash = () => {
  if (titleFlashInterval) {
    clearInterval(titleFlashInterval);
    titleFlashInterval = null;
  }
  if (typeof document !== 'undefined' && originalTitle) {
    document.title = originalTitle;
  }
};

/**
 * Request desktop notification permission and display notification
 */
export const showDesktopNotification = async ({ title, body, icon = '/favicon.ico', onClick }) => {
  if (typeof window === 'undefined' || !('Notification' in window)) return;

  try {
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }

    if (permission === 'granted') {
      const notif = new Notification(title, {
        body,
        icon,
        silent: true, // We play our own synthesized Web Audio chime
      });

      if (onClick) {
        notif.onclick = () => {
          window.focus();
          onClick();
          notif.close();
        };
      }
    }
  } catch (e) {
    console.warn('[SoundAlerts] Desktop notification failed:', e);
  }
};
