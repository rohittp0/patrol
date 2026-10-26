import { PLAYTEST_CONFIG } from "./playtest.config";
export type SoundEffect =
  | "select"
  | "target"
  | "deploy"
  | "arrive"
  | "win"
  | "lose"
  | "purchase"
  | "train"
  | "ready"
  | "error";
/** Original procedural score and effects: no audio downloads or third-party SDK.
 * Audio starts on a gesture, uses a short look-ahead clock, and suspends hidden. */
export class GameAudio {
  private context: AudioContext | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private next = 0;
  private beat = 0;
  private mode: "base" | "pursuit" = "base";
  enabled = true;
  constructor() {
    try {
      this.enabled = localStorage.getItem("patrol:audio") !== "off";
    } catch {}
  }
  unlock() {
    if (!this.enabled) return;
    if (!this.context) {
      const Audio =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!Audio) return;
      try {
        this.context = new Audio();
        this.music = this.context.createGain();
        this.effects = this.context.createGain();
        this.music.gain.value = PLAYTEST_CONFIG.audio.musicVolume;
        this.effects.gain.value = PLAYTEST_CONFIG.audio.effectsVolume;
        this.music.connect(this.context.destination);
        this.effects.connect(this.context.destination);
      } catch {
        return;
      }
    }
    if (this.enabled && !document.hidden)
      void this.context
        .resume()
        .then(() => this.schedule())
        .catch(() => {});
  }
  toggle() {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem("patrol:audio", this.enabled ? "on" : "off");
    } catch {}
    if (this.enabled) this.unlock();
    else this.pause();
    return this.enabled;
  }
  scene(mode: "base" | "pursuit") {
    this.mode = mode;
  }
  visibility() {
    if (document.hidden) this.pause();
    else if (this.enabled && this.context) this.unlock();
  }
  private pause() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.next = 0;
    void this.context?.suspend().catch(() => {});
  }
  private tone(
    midi: number,
    start: number,
    length: number,
    gain: number,
    bus: GainNode,
    wave: OscillatorType = "sine",
  ) {
    const c = this.context!;
    const osc = c.createOscillator(),
      envelope = c.createGain();
    osc.type = wave;
    osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(gain, start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(envelope);
    envelope.connect(bus);
    osc.start(start);
    osc.stop(start + length + 0.02);
    osc.onended = () => {
      osc.disconnect();
      envelope.disconnect();
    };
  }
  private schedule() {
    const c = this.context;
    if (!c || !this.enabled || document.hidden || this.timer) return;
    if (this.next < c.currentTime) this.next = c.currentTime + 0.04;
    while (this.next < c.currentTime + 0.18) {
      const step = this.beat % 16,
        bar = Math.floor(this.beat / 16) % 4;
      const roots = [50, 46, 48, 45],
        root = roots[bar];
      const note =
        [12, 19, 15, 22, 19, 15, 24, 19][Math.floor(step / 2) % 8] + root;
      if (step % 2 === 0)
        this.tone(note, this.next, 0.5, 0.12, this.music!, "sine");
      if (step % 4 === 0)
        this.tone(root - 12, this.next, 0.65, 0.17, this.music!, "triangle");
      if (step === 0) {
        this.tone(root + 7, this.next, 2.3, 0.045, this.music!, "sine");
        this.tone(root + 15, this.next, 2.1, 0.035, this.music!, "sine");
      }
      if (this.mode === "pursuit" && step % 2 === 1)
        this.tone(
          step % 4 === 1 ? 86 : 81,
          this.next,
          0.035,
          0.018,
          this.music!,
          "triangle",
        );
      this.next +=
        60 /
        (this.mode === "pursuit"
          ? PLAYTEST_CONFIG.audio.pursuitBpm
          : PLAYTEST_CONFIG.audio.baseBpm) /
        2;
      this.beat++;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.schedule();
    }, 100);
  }
  effect(kind: SoundEffect) {
    if (
      !this.enabled ||
      !this.context ||
      this.context.state !== "running" ||
      !this.effects ||
      document.hidden
    )
      return;
    const t = this.context.currentTime + 0.01,
      bus = this.effects;
    const play = (
      notes: number[],
      length = 0.12,
      gain = 0.23,
      gap = 0.075,
      wave: OscillatorType = "sine",
    ) =>
      notes.forEach((note, i) =>
        this.tone(note, t + i * gap, length, gain, bus, wave),
      );
    if (kind === "select") play([77], 0.065, 0.15);
    if (kind === "target") play([74, 81], 0.1, 0.19, 0.06);
    if (kind === "deploy") play([45, 57, 69], 0.14, 0.2, 0.045, "triangle");
    if (kind === "arrive") play([69, 74], 0.14, 0.17, 0.06);
    if (kind === "purchase") play([86, 93, 89], 0.1, 0.18, 0.055);
    if (kind === "train") play([62, 65, 69], 0.19, 0.2, 0.09, "triangle");
    if (kind === "ready") play([74, 78, 81], 0.23, 0.2, 0.1);
    if (kind === "win")
      play([62, 66, 69, 74, 78, 81, 86], 0.42, 0.23, 0.09, "triangle");
    if (kind === "lose") play([57, 53, 50, 45], 0.4, 0.22, 0.15, "triangle");
    if (kind === "error") play([42, 40], 0.1, 0.12, 0.06, "triangle");
  }
}
