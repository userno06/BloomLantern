/* =========================================================================
   BLOOM LANTERN — music player

   Three ambient tracks are composed live in the browser with the Web Audio API,
   so there are no audio files to download and nothing to license.
   You can also add your own songs (the + button, or the MUSIC_FILES list in script.js).

   The player exposes a smoothed loudness value (getLevel) that the 3D scene uses
   to make the lantern glow breathe with the music.
   ========================================================================= */

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));


export const GENERATED_TRACKS = [
  {
    id: "midnight-garden",
    title: "Midnight Garden",
    sub: "Ambient · made live in your browser",
    kind: "gen",
    preset: {
      chordDur: 9,
      padCut: 950,
      padGain: 0.05,
      bassGain: 0.13,
      chords: [
        { bass: 38, pad: [57, 60, 64, 65] }, // Dm9
        { bass: 34, pad: [53, 57, 62, 65] }, // Bbmaj7
        { bass: 43, pad: [58, 62, 65, 69] }, // Gm9
        { bass: 45, pad: [55, 60, 64, 67] }  // Am7
      ],
      pluck: { mode: "random", every: [1.6, 4.2], prob: 0.8, gain: 1, oct: [12, 24], decay: 3.2 },
      delay: { time: 0.47, fb: 0.42, wet: 0.55 },
      crickets: 0.01,
      air: 0.008
    }
  },
  {
    id: "warm-embers",
    title: "Warm Embers",
    sub: "Slow and glowy · made live in your browser",
    kind: "gen",
    preset: {
      chordDur: 11,
      padCut: 800,
      padGain: 0.05,
      bassGain: 0.14,
      chords: [
        { bass: 36, pad: [55, 59, 62, 64] }, // Cmaj9
        { bass: 41, pad: [53, 57, 60, 64] }, // Fmaj7
        { bass: 45, pad: [55, 59, 60, 64] }, // Am9
        { bass: 40, pad: [55, 59, 62, 66] }  // Em9
      ],
      pluck: { mode: "random", every: [2.4, 6], prob: 0.7, gain: 0.9, oct: [12, 24], decay: 4 },
      delay: { time: 0.62, fb: 0.5, wet: 0.6 },
      crickets: 0,
      air: 0.01
    }
  },
  {
    id: "firefly-hour",
    title: "Firefly Hour",
    sub: "Music-box lullaby · made live in your browser",
    kind: "gen",
    preset: {
      chordDur: 8,
      padCut: 1100,
      padGain: 0.04,
      bassGain: 0.12,
      chords: [
        { bass: 45, pad: [57, 60, 64, 71] }, // Am(add9)
        { bass: 41, pad: [53, 57, 60, 65] }, // F
        { bass: 36, pad: [55, 60, 64, 67] }, // C
        { bass: 43, pad: [55, 59, 62, 67] }  // G
      ],
      pluck: { mode: "arp", step: 0.5, rest: 0.22, gain: 0.9, decay: 2.2 },
      delay: { time: 0.375, fb: 0.35, wet: 0.5 },
      crickets: 0.008,
      air: 0.006
    }
  }
];

/* ---------- The generative engine ---------- */
class Generative {
  constructor(ctx, out, preset) {
    this.ctx = ctx;
    this.p = preset;
    this.live = new Set();
    this.timer = 0;

    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(out);

    // A soft echo that the plucks feed into (gives that dreamy tail)
    this.send = ctx.createGain();
    this.send.gain.value = preset.delay.wet;
    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = preset.delay.time;
    this.fb = ctx.createGain();
    this.fb.gain.value = preset.delay.fb;
    this.dlp = ctx.createBiquadFilter();
    this.dlp.type = "lowpass";
    this.dlp.frequency.value = 2200;
    this.send.connect(this.delay);
    this.delay.connect(this.dlp);
    this.dlp.connect(this.fb);
    this.fb.connect(this.delay);
    this.dlp.connect(this.bus);
  }

  osc(type, freq, t0, t1) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.start(t0);
    o.stop(t1);
    this.live.add(o);
    o.onended = () => {
      this.live.delete(o);
      try { o.disconnect(); } catch (e) { /* already gone */ }
    };
    return o;
  }

  start() {
    const c = this.ctx;
    const now = c.currentTime;
    this.t0 = now + 0.15;
    this.nextChord = this.t0;
    this.nextPluck = this.t0 + 1.5;
    this.nextChirp = this.t0 + 2;
    this.arpStep = 0;

    this.bus.gain.setValueAtTime(0, now);
    this.bus.gain.linearRampToValueAtTime(1, now + 2.5);

    this.startAir();
    this.tick();
    // Look-ahead scheduling: we queue ~2.5s of sound at a time, so it stays smooth
    // even when the browser throttles timers in a background tab.
    this.timer = setInterval(() => this.tick(), 250);
  }

  chordAt(t) {
    const n = this.p.chords.length;
    const i = Math.max(0, Math.floor((t - this.t0) / this.p.chordDur));
    return this.p.chords[i % n];
  }

  tick() {
    const p = this.p;
    const horizon = this.ctx.currentTime + 2.5;

    while (this.nextChord < horizon) {
      const i = Math.round((this.nextChord - this.t0) / p.chordDur);
      this.playChord(p.chords[i % p.chords.length], this.nextChord);
      this.nextChord += p.chordDur;
    }

    const pl = p.pluck;
    if (pl.mode === "random") {
      while (this.nextPluck < horizon) {
        if (Math.random() < pl.prob) {
          const ch = this.chordAt(this.nextPluck);
          const pool = ch.pad.flatMap((n) => pl.oct.map((o) => n + o));
          this.pluckNote(pick(pool), this.nextPluck, rand(0.05, 0.11) * pl.gain, pl.decay);
        }
        this.nextPluck += rand(pl.every[0], pl.every[1]);
      }
    } else {
      const pattern = [0, 1, 2, 3, 4, 3, 2, 1];
      while (this.nextPluck < horizon) {
        const step = this.arpStep++;
        if (Math.random() > pl.rest) {
          const ch = this.chordAt(this.nextPluck);
          const notes = [...ch.pad].sort((a, b) => a - b).map((n) => n + 12);
          notes.push(notes[0] + 12);
          const accent = step % 8 === 0 ? 1.25 : 1;
          this.pluckNote(notes[pattern[step % pattern.length]], this.nextPluck, 0.075 * pl.gain * accent, pl.decay);
        }
        this.nextPluck += pl.step;
      }
    }

    if (this.p.crickets) {
      while (this.nextChirp < horizon) {
        this.chirp(this.nextChirp);
        this.nextChirp += rand(0.5, 2.2);
      }
    }
  }

  playChord(ch, t) {
    const c = this.ctx;
    const p = this.p;
    const dur = p.chordDur;
    const att = dur * 0.4;
    const rel = dur * 0.6;
    const stopAt = t + dur + rel + 0.1;

    // Pad: two slightly detuned triangle waves per note, through a warm low-pass
    const g = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = p.padCut;
    lp.Q.value = 0.3;
    g.connect(lp);
    lp.connect(this.bus);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(p.padGain, t + att);
    g.gain.setValueAtTime(p.padGain, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + rel);
    for (const n of ch.pad) {
      for (const d of [-7, 7]) {
        const o = this.osc("triangle", mtof(n), t, stopAt);
        o.detune.value = d;
        o.connect(g);
      }
    }

    // Soft sub bass
    const bg = c.createGain();
    bg.connect(this.bus);
    bg.gain.setValueAtTime(0, t);
    bg.gain.linearRampToValueAtTime(p.bassGain, t + att);
    bg.gain.setValueAtTime(p.bassGain, t + dur);
    bg.gain.linearRampToValueAtTime(0, t + dur + rel);
    this.osc("sine", mtof(ch.bass), t, stopAt).connect(bg);
  }

  pluckNote(note, t, vel, decay) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    const o1 = this.osc("sine", mtof(note), t, t + decay + 0.05);
    const o2 = this.osc("triangle", mtof(note) * 2, t, t + decay * 0.5 + 0.05);
    const g2 = c.createGain();
    g2.gain.value = 0.22;
    o1.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(this.bus);
    g.connect(this.send);
  }

  chirp(t) {
    const c = this.ctx;
    const f = rand(4300, 4900);
    const pulses = 3 + ((Math.random() * 3) | 0);
    for (let i = 0; i < pulses; i++) {
      const tt = t + i * 0.055;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.linearRampToValueAtTime(this.p.crickets, tt + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.035);
      this.osc("sine", f, tt, tt + 0.05).connect(g);
      g.connect(this.bus);
    }
  }

  // Very quiet night air: brown noise with a slow breathing swell
  startAir() {
    const c = this.ctx;
    const level = this.p.air;
    if (!level) return;
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 600;
    const g = c.createGain();
    g.gain.value = level;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = c.createGain();
    lfoGain.gain.value = level * 0.6;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.bus);
    src.start();
    lfo.start();
    this.live.add(src);
    this.live.add(lfo);
  }

  stop(fade = 0.9) {
    clearInterval(this.timer);
    const c = this.ctx;
    const now = c.currentTime;
    this.bus.gain.cancelScheduledValues(now);
    this.bus.gain.setValueAtTime(this.bus.gain.value, now);
    this.bus.gain.linearRampToValueAtTime(0, now + fade);
    setTimeout(() => this.teardown(), fade * 1000 + 150);
  }

  teardown() {
    clearInterval(this.timer);
    for (const o of this.live) {
      try { o.stop(); } catch (e) { /* already stopped */ }
    }
    this.live.clear();
    try { this.bus.disconnect(); } catch (e) { /* already gone */ }
  }
}

/* ---------- The player ---------- */
const VOL_KEY = "bloom-lantern:volume";
function readVolume() {
  try {
    const v = parseFloat(localStorage.getItem(VOL_KEY));
    if (!Number.isNaN(v)) return clamp(v, 0, 1);
  } catch (e) { /* storage unavailable */ }
  return 0.8;
}

export class MusicPlayer {
  constructor({ tracks, files = [] }) {
    this.tracks = [
      ...tracks,
      ...files.map((f, i) => ({
        id: "file-" + i,
        title: f.title,
        sub: f.sub || "Your music",
        kind: "file",
        src: f.src
      }))
    ];
    this.index = 0;
    this.playing = false;
    this.volume = readVolume();
    this.notice = "";
    this.noticeTimer = 0;
    this.lv = 0;
    this.ctx = null;
    this.current = null;
    this.audio = null;
    this.onChange = () => {};
    this.onStart = () => {};

    this.setupMediaSession();
    // Mobile browsers pause audio when the tab is hidden or a call comes in; wake it up again.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && this.playing && this.ctx && this.ctx.state !== "running") {
        this.ctx.resume().catch(() => {});
      }
    });
  }

  get track() {
    return this.tracks[this.index];
  }

  state() {
    return {
      title: this.track.title,
      sub: this.notice || this.track.sub,
      playing: this.playing,
      index: this.index,
      count: this.tracks.length
    };
  }

  emit() {
    this.onChange(this.state());
    this.updateMediaSession();
  }

  say(message) {
    this.notice = message;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => {
      this.notice = "";
      this.emit();
    }, 3500);
    this.emit();
  }

  // The audio context must be created from a tap / click, which is why we wait for play()
  ensureContext() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const ctx = new AC();
    this.ctx = ctx;

    this.pre = ctx.createGain();       // everything plays into here
    this.master = ctx.createGain();    // volume
    this.master.gain.value = this.volume * this.volume * 0.9;
    const comp = ctx.createDynamicsCompressor(); // keeps loud user files from clipping
    comp.threshold.value = -18;
    comp.ratio.value = 3;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.buf = new Uint8Array(this.analyser.fftSize);
    const silent = ctx.createGain();
    silent.gain.value = 0;

    this.pre.connect(this.master);
    this.master.connect(comp);
    comp.connect(ctx.destination);
    // Loudness is measured before the volume knob, so the lantern glow doesn't depend on it
    this.pre.connect(this.analyser);
    this.analyser.connect(silent);
    silent.connect(ctx.destination);
    return true;
  }

  getAudio() {
    if (this.audio) return this.audio;
    const a = new Audio();
    a.preload = "auto";
    a.setAttribute("playsinline", "");
    a.addEventListener("ended", () => this.next());
    a.addEventListener("error", () => {
      if (this.playing && this.track.kind === "file") this.fail(this.track);
    });
    this.ctx.createMediaElementSource(a).connect(this.pre);
    this.audio = a;
    return a;
  }

  play() {
    if (!this.ensureContext()) {
      this.say("Audio isn’t supported in this browser");
      return;
    }
    this.ctx.resume().catch(() => {});
    this.playing = true;
    this.startTrack();
    this.emit();
    this.onStart();
  }

  pause() {
    this.playing = false;
    this.stopCurrent();
    this.emit();
    // Let the fade-out finish, then put the audio engine to sleep to save battery
    setTimeout(() => {
      if (!this.playing && this.ctx && this.ctx.state === "running") this.ctx.suspend().catch(() => {});
    }, 1400);
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  startTrack() {
    this.stopCurrent();
    const t = this.track;
    if (t.kind === "gen") {
      this.current = new Generative(this.ctx, this.pre, t.preset);
      this.current.start();
    } else {
      const a = this.getAudio();
      a.src = t.src;
      const started = a.play();
      if (started && started.catch) {
        started.catch((err) => {
          if (err && err.name === "AbortError") return; // we just switched tracks
          if (err && err.name === "NotAllowedError") {
            this.playing = false;
            this.emit();
            return;
          }
          if (this.track === t) this.fail(t);
        });
      }
    }
  }

  stopCurrent() {
    if (this.current) {
      this.current.stop();
      this.current = null;
    }
    if (this.audio) this.audio.pause();
  }

  fail(t) {
    if (t.kind !== "file") return;
    const at = this.tracks.indexOf(t);
    if (at === -1) return;
    this.tracks.splice(at, 1);
    if (this.index >= this.tracks.length) this.index = 0;
    else if (at < this.index) this.index--;
    this.say("Couldn’t play “" + t.title + "”");
    if (this.playing) this.startTrack();
  }

  go(step) {
    const n = this.tracks.length;
    this.index = (this.index + step + n) % n;
    this.notice = "";
    if (this.playing) this.startTrack();
    this.emit();
  }
  next() { this.go(1); }
  prev() { this.go(-1); }

  addFiles(fileList) {
    const added = [];
    for (const f of fileList) {
      const looksAudio = (f.type && f.type.startsWith("audio")) || /\.(mp3|m4a|aac|wav|ogg|oga|flac|opus)$/i.test(f.name);
      if (!looksAudio) continue;
      added.push({
        id: "file-" + Date.now() + "-" + added.length,
        title: f.name.replace(/\.[^.]+$/, ""),
        sub: "Your music",
        kind: "file",
        src: URL.createObjectURL(f)
      });
    }
    if (!added.length) {
      this.say("Pick an audio file (mp3, m4a, wav…)");
      return;
    }
    this.tracks.push(...added);
    this.index = this.tracks.length - added.length;
    this.notice = "";
    if (this.playing) {
      this.startTrack();
      this.emit();
    } else {
      this.play();
    }
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    if (this.master) this.master.gain.setTargetAtTime(this.volume * this.volume * 0.9, this.ctx.currentTime, 0.03);
    try { localStorage.setItem(VOL_KEY, String(this.volume)); } catch (e) { /* ignore */ }
  }

  // 0..1, smoothed loudness. Cheap enough to call every frame.
  getLevel() {
    if (!this.analyser || !this.playing) {
      this.lv *= 0.92;
      return this.lv < 0.002 ? 0 : this.lv;
    }
    this.analyser.getByteTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) {
      const v = (this.buf[i] - 128) / 128;
      sum += v * v;
    }
    const target = clamp(Math.sqrt(sum / this.buf.length) * 5, 0, 1);
    this.lv += (target - this.lv) * 0.12;
    return this.lv;
  }

  // Lock-screen / headset controls
  setupMediaSession() {
    if (!("mediaSession" in navigator)) return;
    const set = (action, fn) => {
      try { navigator.mediaSession.setActionHandler(action, fn); } catch (e) { /* unsupported action */ }
    };
    set("play", () => this.play());
    set("pause", () => this.pause());
    set("nexttrack", () => this.next());
    set("previoustrack", () => this.prev());
  }

  updateMediaSession() {
    if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: this.track.title, artist: "Bloom Lantern" });
      navigator.mediaSession.playbackState = this.playing ? "playing" : "paused";
    } catch (e) { /* ignore */ }
  }
}

/* ---------- Hook the player up to the buttons in index.html ---------- */
export function initMusicUI(player) {
  const root = document.getElementById("player");
  if (!root) return;
  const playBtn = document.getElementById("mp-play");
  const prevBtn = document.getElementById("mp-prev");
  const nextBtn = document.getElementById("mp-next");
  const addBtn = document.getElementById("mp-add");
  const fileInput = document.getElementById("mp-file");
  const vol = document.getElementById("mp-vol");
  const title = document.getElementById("mp-title");
  const sub = document.getElementById("mp-sub");

  playBtn.addEventListener("click", () => player.toggle());
  prevBtn.addEventListener("click", () => player.prev());
  nextBtn.addEventListener("click", () => player.next());
  addBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files.length) player.addFiles(fileInput.files);
    fileInput.value = "";
  });
  vol.value = player.volume;
  vol.addEventListener("input", () => player.setVolume(parseFloat(vol.value)));

  player.onChange = (s) => {
    title.textContent = s.title;
    sub.textContent = s.sub;
    root.classList.toggle("playing", s.playing);
    playBtn.setAttribute("aria-label", s.playing ? "Pause music" : "Play music");
    playBtn.setAttribute("aria-pressed", s.playing ? "true" : "false");
  };
  player.emit();
}
