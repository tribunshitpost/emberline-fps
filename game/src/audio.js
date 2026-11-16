// Procedural WebAudio: every sound is synthesized, no audio files and no
// network. The context is created on the first user gesture; screenshot runs
// never create one.
export function createAudio() {
  let ctx = null;
  let master = null;
  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
    return ctx;
  }
  function noiseBurst(duration, filterFreq, gainValue, type = 'lowpass') {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(t);
  }
  function tone(freq, duration, gainValue, type = 'square', slideTo = null) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + duration);
  }
  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    shot(weaponId) {
      if (weaponId === 'smg') { noiseBurst(0.09, 2400, 0.5); tone(190, 0.07, 0.25, 'square', 90); }
      else if (weaponId === 'pistol') { noiseBurst(0.08, 1800, 0.4); tone(150, 0.06, 0.2, 'square', 80); }
      else { noiseBurst(0.12, 1400, 0.6); tone(120, 0.1, 0.3, 'square', 55); }
    },
    enemyShot() { noiseBurst(0.1, 900, 0.25); },
    hit() { tone(1400, 0.05, 0.2, 'sine'); },
    kill() { tone(880, 0.09, 0.25, 'sine'); tone(1320, 0.12, 0.2, 'sine'); },
    reload() { tone(500, 0.05, 0.15, 'square'); setTimeout(() => tone(700, 0.05, 0.15, 'square'), 180); },
    empty() { tone(300, 0.05, 0.15, 'square'); },
    plantBeep() { tone(1100, 0.08, 0.2, 'sine'); },
    explode() { noiseBurst(0.7, 300, 0.9); tone(60, 0.6, 0.4, 'sine', 30); },
    roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.16, 0.2, 'triangle'), i * 110)); },
    roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.18, 0.2, 'triangle'), i * 130)); },
    buy() { tone(980, 0.06, 0.18, 'sine'); },
  };
}
