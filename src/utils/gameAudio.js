// Cast & Catch's sound, synthesized with Web Audio so the bundle carries no audio files: a
// water bed per biome (with wind offshore and crickets on fresh water at night) and short
// effects for the moments that matter — the cast, the bite, the reel, a landing, a snapped
// line, points changing hands, and the trip between grounds. Everything routes through one
// master gain so mute is a single switch, remembered per device in localStorage (a
// convenience, not app state). The AudioContext is only created on a user gesture, per
// browser autoplay rules, so nothing here makes a sound until the player casts or taps the
// bell. Every function is a no-op where Web Audio doesn't exist (tests, old browsers).
const MUTE_KEY = 'cast-and-catch-muted';

function readMuted() {
  try { return window.localStorage.getItem(MUTE_KEY) === '1'; } catch (error) { return false; }
}

function writeMuted(muted) {
  try { window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (error) { /* private mode */ }
}

const AudioContextClass = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;

export const audioSupported = Boolean(AudioContextClass);

let context = null;
let master = null;
let ambience = null;
let muted = readMuted();

function ensureContext() {
  if (!AudioContextClass) return null;
  if (!context) {
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(context.destination);
  }
  if (context.state === 'suspended') context.resume();
  return context;
}

// Call from a click/tap handler before anything else, so the browser lets the context run.
export function unlockAudio() { ensureContext(); }

export function isMuted() { return muted; }

export function setMuted(nextMuted) {
  muted = nextMuted;
  writeMuted(muted);
  if (master && context) master.gain.setTargetAtTime(muted ? 0 : 1, context.currentTime, 0.02);
  return muted;
}

export function toggleMuted() { return setMuted(!muted); }

function noiseBuffer(ctx, seconds = 1, brown = false) {
  const frames = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < frames; i += 1) {
    const white = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * white) / 1.02; data[i] = last * 3.5; } else data[i] = white;
  }
  return buffer;
}

function envelope(ctx, node, { attack = 0.005, peak = 0.5, decay = 0.2, at = ctx.currentTime }) {
  node.gain.setValueAtTime(0.0001, at);
  node.gain.exponentialRampToValueAtTime(peak, at + attack);
  node.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
}

function tone(ctx, { frequency, type = 'sine', peak = 0.3, decay = 0.25, at = ctx.currentTime, slideTo = null }) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, at);
  if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, at + decay);
  envelope(ctx, gain, { peak, decay, at });
  oscillator.connect(gain).connect(master);
  oscillator.start(at);
  oscillator.stop(at + decay + 0.05);
}

function burst(ctx, { peak = 0.4, decay = 0.3, filterFrequency = 800, filterType = 'lowpass', at = ctx.currentTime, sweepTo = null }) {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, decay + 0.1);
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(filterFrequency, at);
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, at + decay);
  const gain = ctx.createGain();
  envelope(ctx, gain, { peak, decay, at });
  source.connect(filter).connect(gain).connect(master);
  source.start(at);
  source.stop(at + decay + 0.1);
}

export const sfx = {
  cast() { const ctx = ensureContext(); if (ctx) burst(ctx, { peak: 0.25, decay: 0.35, filterType: 'bandpass', filterFrequency: 600, sweepTo: 2400 }); },
  splash() { const ctx = ensureContext(); if (ctx) burst(ctx, { peak: 0.35, decay: 0.45, filterFrequency: 1200, sweepTo: 300 }); },
  bite() {
    const ctx = ensureContext(); if (!ctx) return;
    tone(ctx, { frequency: 880, type: 'square', peak: 0.12, decay: 0.08 });
    tone(ctx, { frequency: 1320, type: 'square', peak: 0.12, decay: 0.12, at: ctx.currentTime + 0.09 });
    burst(ctx, { peak: 0.3, decay: 0.3, filterFrequency: 900, sweepTo: 250, at: ctx.currentTime + 0.05 });
  },
  reelTick() { const ctx = ensureContext(); if (ctx) tone(ctx, { frequency: 2200, type: 'triangle', peak: 0.05, decay: 0.03 }); },
  land(rarity = 'common') {
    const ctx = ensureContext(); if (!ctx) return;
    const notes = { common: 2, uncommon: 3, rare: 4, epic: 5, legendary: 7 }[rarity] || 2;
    const scale = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98, 2093];
    for (let i = 0; i < notes; i += 1) tone(ctx, { frequency: scale[i], type: 'triangle', peak: 0.2, decay: 0.35, at: ctx.currentTime + i * 0.09 });
  },
  record() {
    const ctx = ensureContext(); if (!ctx) return;
    [0, 0.12, 0.24].forEach((offset, index) => tone(ctx, { frequency: 1046.5 * (index === 2 ? 1.5 : 1), type: 'sine', peak: 0.22, decay: 0.5, at: ctx.currentTime + offset }));
  },
  snap() {
    const ctx = ensureContext(); if (!ctx) return;
    burst(ctx, { peak: 0.5, decay: 0.08, filterType: 'highpass', filterFrequency: 3000 });
    tone(ctx, { frequency: 140, type: 'sine', peak: 0.3, decay: 0.3, slideTo: 50 });
  },
  lost() { const ctx = ensureContext(); if (ctx) tone(ctx, { frequency: 330, type: 'triangle', peak: 0.15, decay: 0.5, slideTo: 165 }); },
  coin(gain = true) {
    const ctx = ensureContext(); if (!ctx) return;
    tone(ctx, { frequency: gain ? 1568 : 784, type: 'sine', peak: 0.15, decay: 0.12 });
    tone(ctx, { frequency: gain ? 2093 : 523, type: 'sine', peak: 0.15, decay: 0.25, at: ctx.currentTime + 0.07 });
  },
  travel(vehicle = 'truck') {
    const ctx = ensureContext(); if (!ctx) return;
    if (vehicle === 'boat') {
      tone(ctx, { frequency: 110, type: 'sawtooth', peak: 0.12, decay: 0.9 });
      tone(ctx, { frequency: 165, type: 'sawtooth', peak: 0.08, decay: 0.9 });
    } else {
      burst(ctx, { peak: 0.2, decay: 1.4, filterFrequency: 180 });
      tone(ctx, { frequency: 70, type: 'sawtooth', peak: 0.1, decay: 1.4, slideTo: 120 });
    }
  },
  tap() { const ctx = ensureContext(); if (ctx) tone(ctx, { frequency: 660, type: 'square', peak: 0.06, decay: 0.05 }); },
};

// The ambient bed: filtered brown noise as water, a slow swell on its level, plus wind offshore
// and crickets on fresh water after dark. Rebuilt whenever the biome or period changes.
const FRESH_WATER = ['river', 'mountainlake', 'swamp'];

function stopAmbience() {
  if (!ambience) return;
  const { nodes, gain } = ambience;
  if (context) gain.gain.setTargetAtTime(0.0001, context.currentTime, 0.4);
  setTimeout(() => nodes.forEach((node) => { try { node.stop(); } catch (error) { /* already stopped */ } }), 1200);
  ambience = null;
}

export function setAmbience(biome, period) {
  const ctx = ensureContext();
  if (!ctx) return;
  if (ambience && ambience.key === `${biome}:${period}`) return;
  stopAmbience();
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 1.5);
  gain.connect(master);
  const nodes = [];

  const water = ctx.createBufferSource();
  water.buffer = noiseBuffer(ctx, 4, true);
  water.loop = true;
  const waterFilter = ctx.createBiquadFilter();
  waterFilter.type = 'lowpass';
  waterFilter.frequency.value = biome === 'offshore' || biome === 'canyon' ? 320 : biome === 'river' ? 900 : 520;
  const waterGain = ctx.createGain();
  waterGain.gain.value = biome === 'river' ? 0.16 : 0.11;
  const swell = ctx.createOscillator();
  swell.frequency.value = biome === 'offshore' || biome === 'canyon' ? 0.12 : 0.25;
  const swellDepth = ctx.createGain();
  swellDepth.gain.value = 0.05;
  swell.connect(swellDepth).connect(waterGain.gain);
  water.connect(waterFilter).connect(waterGain).connect(gain);
  water.start(); swell.start();
  nodes.push(water, swell);

  if (biome === 'offshore' || biome === 'canyon' || biome === 'shoreline') {
    const wind = ctx.createBufferSource();
    wind.buffer = noiseBuffer(ctx, 4);
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windFilter.Q.value = 0.6;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.035;
    const gust = ctx.createOscillator();
    gust.frequency.value = 0.07;
    const gustDepth = ctx.createGain();
    gustDepth.gain.value = 0.02;
    gust.connect(gustDepth).connect(windGain.gain);
    wind.connect(windFilter).connect(windGain).connect(gain);
    wind.start(); gust.start();
    nodes.push(wind, gust);
  }

  if (FRESH_WATER.includes(biome) && (period === 'night' || period === 'dusk')) {
    const cricket = ctx.createOscillator();
    cricket.type = 'sine';
    cricket.frequency.value = 4300;
    const chirp = ctx.createOscillator();
    chirp.type = 'square';
    chirp.frequency.value = 14;
    const chirpDepth = ctx.createGain();
    chirpDepth.gain.value = 0.012;
    const cricketGain = ctx.createGain();
    cricketGain.gain.value = 0.0001;
    const pulse = ctx.createOscillator();
    pulse.frequency.value = 0.9;
    const pulseDepth = ctx.createGain();
    pulseDepth.gain.value = 0.012;
    chirp.connect(chirpDepth).connect(cricketGain.gain);
    pulse.connect(pulseDepth).connect(cricketGain.gain);
    cricket.connect(cricketGain).connect(gain);
    cricket.start(); chirp.start(); pulse.start();
    nodes.push(cricket, chirp, pulse);
  }

  ambience = { key: `${biome}:${period}`, nodes, gain };
}

export function stopAllAudio() { stopAmbience(); }
