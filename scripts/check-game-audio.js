async (basePage) => {
  const context = await basePage
      .context()
      .browser()
      .newContext({ viewport: { width: 390, height: 844 } }),
    page = await context.newPage();
  const checks = [];
  const check = (ok, label) => {
    if (!ok) throw new Error(label);
    checks.push(label);
  };
  await context.addInitScript(() => {
    const Base = window.AudioContext;
    window.__qaAudio = [];
    window.AudioContext = class extends Base {
      constructor(...args) {
        super(...args);
        this.voices = 0;
        this.meters = [];
        window.__qaAudio.push(this);
        const oscillator = this.createOscillator.bind(this);
        this.createOscillator = () => {
          this.voices++;
          return oscillator();
        };
        const makeGain = this.createGain.bind(this);
        this.createGain = () => {
          const gain = makeGain(),
            connect = gain.connect.bind(gain);
          gain.connect = (target, ...rest) => {
            if (target === this.destination) {
              const meter = this.createAnalyser();
              meter.fftSize = 512;
              this.meters.push(meter);
              connect(meter);
              meter.connect(target);
              return target;
            }
            return connect(target, ...rest);
          };
          return gain;
        };
      }
    };
  });
  try {
    await page.goto(new URL(basePage.url()).origin + "/");
    await page.locator('[data-action="choose"][data-level="1"]').waitFor();
    await page.bringToFront();
    check(
      await page.evaluate(() => window.__qaAudio.length === 0),
      "Loading and idle home do not autoplay audio",
    );
    await page.locator('[data-action="choose"][data-level="1"]').click();
    await page.waitForFunction(
      () =>
        window.__qaAudio[0]?.state === "running" &&
        window.__qaAudio[0].voices > 0,
    );
    const initial = await page.evaluate(() => window.__qaAudio[0].voices);
    await page.waitForFunction(
      (count) => window.__qaAudio[0].voices > count + 2,
      initial,
    );
    check(true, "Original music continues scheduling without extra clicks");
    const power = await page.waitForFunction(() => {
      const c = window.__qaAudio[0];
      return (
        Math.max(
          ...c.meters.map((m) => {
            const a = new Float32Array(m.fftSize);
            m.getFloatTimeDomainData(a);
            return Math.sqrt(a.reduce((sum, n) => sum + n * n, 0) / a.length);
          }),
        ) > 0.0001
      );
    });
    check(!!power, "Music produces non-silent audio samples");
    const before = await page.evaluate(() => window.__qaAudio[0].voices);
    await page.locator('[data-action="add-squad"][data-id="patrol-1"]').click();
    check(
      await page.evaluate((n) => window.__qaAudio[0].voices > n, before),
      "Squad selection plays its sound effect",
    );
    await page.locator('[data-action="toggle-audio"]').click();
    await page.waitForFunction(() => window.__qaAudio[0].state === "suspended");
    check(
      (await page
        .locator('[data-action="toggle-audio"]')
        .getAttribute("aria-pressed")) === "false",
      "Sound control mutes all audio",
    );
    await page.reload();
    await page.locator('[data-action="toggle-audio"]').waitFor();
    check(
      (await page
        .locator('[data-action="toggle-audio"]')
        .getAttribute("aria-pressed")) === "false",
      "Mute preference survives refresh",
    );
    await page.locator('[data-action="choose"][data-level="1"]').click();
    check(
      await page.evaluate(() => window.__qaAudio.length === 0),
      "Muted play does not create an audio engine",
    );
    await page.locator('[data-action="toggle-audio"]').click();
    await page.waitForFunction(() => window.__qaAudio[0]?.state === "running");
    check(true, "Audio can be re-enabled from the mandatory guide");
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForFunction(() => window.__qaAudio[0].state === "suspended");
    check(true, "Hidden pages suspend the soundtrack");
    return { checks: checks.length, passed: checks };
  } finally {
    await context.close();
  }
}
