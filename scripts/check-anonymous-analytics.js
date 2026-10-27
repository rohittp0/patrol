// Real SDK requests are intercepted; no synthetic analytics are uploaded.
async (basePage) => {
  const origin = new URL(basePage.url()).origin;
  const context = await basePage.context().browser().newContext({
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  });
  const page = await context.newPage(), packets = [], checks = [], errors = [], forbiddenRequests = [];
  const check = (ok, label) => { if (!ok) throw new Error(label); checks.push(label); };
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (/facebook\.(net|com)|recorder|survey/.test(request.url())) forbiddenRequests.push(request.url()); });
  await context.addInitScript(() => {
    localStorage.setItem("patrol:player:v1", JSON.stringify({ id: "PRIVATE_PROFILE", name: "PRIVATE_NAME", photo: null }));
    localStorage.setItem("ph_phc_qvnmtmJK9HVoMtGsY6HHS66U6dcbfqBpR3ZBhkgCW54G_posthog", JSON.stringify({ distinct_id: "PRIVATE_OLD_IDENTIFIED", $user_state: "identified", $device_id: "PRIVATE_DEVICE" }));
  });
  await context.addCookies([{ name: "ph_phc_qvnmtmJK9HVoMtGsY6HHS66U6dcbfqBpR3ZBhkgCW54G_posthog", value: encodeURIComponent(JSON.stringify({ distinct_id: "PRIVATE_OLD_IDENTIFIED", $user_state: "identified" })), url: origin }]);
  await context.route("**/*posthog.com/**", async route => {
    const request = route.request();
    try {
      if (request.method() === "POST" && /\/e\/?|\/capture\/?/.test(new URL(request.url()).pathname)) {
        const bytes = Array.from(request.postDataBuffer() || []);
        const decoded = await page.evaluate(async bytes => {
          const data = new Uint8Array(bytes);
          if (data[0] === 31 && data[1] === 139)
            return await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
          return new TextDecoder().decode(data);
        }, bytes);
        const body = JSON.parse(decoded);
        packets.push(...(Array.isArray(body) ? body : body.batch || [body]));
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: 1, featureFlags: {}, surveys: [] }) });
    } catch (error) { errors.push("Payload decode: " + error); await route.abort(); }
  });
  const events = name => packets.filter(packet => packet.event === name);
  const recent = () => page.evaluate(() => window.__PATROL_TELEMETRY__.recent);
  const flush = async () => { await page.waitForTimeout(5500); };
  const move = async order => {
    await page.locator(`[data-action="select-squad"][data-squad="${order.squad}"]`).click();
    const post = page.locator(`[data-border="${order.border}"]`);
    for (let i = 0; i < 4; i++) {
      const box = await post.boundingBox(), dock = await page.locator(".squad-dock").boundingBox();
      if (box && box.x > 0 && box.x + box.width < 390 && box.y > 85 && box.y + box.height < dock.y) break;
      await page.mouse.move(150, 350); await page.mouse.wheel(0, 250);
    }
    await post.click();
    await page.locator('[data-action="deploy"]').click();
    await page.waitForFunction(() => document.querySelector(".capture-moment") || document.querySelector("#journey")?.textContent?.includes("Time paused"));
  };
  try {
    await page.goto(origin + "/?local=1&telemetry_debug=1");
    await page.locator('[data-action="choose"][data-level="1"]').waitFor();
    const coldReadinessMs = await page.evaluate(() => performance.getEntriesByName("patrol-ready").at(-1)?.startTime);
    await page.waitForFunction(() => window.__PATROL_TELEMETRY__?.ready);
    await flush();
    check(events("app_open").length === 1, "Queued app entry reaches the real SDK transport");
    const firstId = events("app_open")[0].properties.distinct_id;
    check(firstId && !firstId.includes("PRIVATE"), "Formerly identified browser gets a fresh anonymous ID");
    const levels = await page.evaluate(async () => (await (await fetch("/data/india-campaign.json")).json()).levels);
    await page.locator('.bottom-nav [data-action="levels"]').click();
    await page.locator('.level-card[data-level="15"]').click();
    await page.locator('[data-action="close-modal"]').click();
    check((await recent()).some(p => p.name === "level_briefing" && p.params.locked && p.params.hunt_number === 15), "Locked case previews have the correct level");
    await page.locator('.bottom-nav [data-action="home"]').click();
    await page.locator('[data-action="choose"][data-level="1"]').click();
    for (const id of ["patrol-1", "patrol-2", "patrol-3"]) await page.locator(`[data-action="add-squad"][data-id="${id}"]`).click();
    check((await recent()).filter(p => p.name === "page_view" && p.params.screen === "roster").length === 1, "Roster rerenders do not spam page views");
    await page.locator('[data-action="start"]').click();
    await page.locator("#map .border-post").first().waitFor();
    await move(levels[0].witness[0]);
    await flush();
    await page.reload();
    await page.locator("#map .border-post").first().waitFor();
    const warmReadinessMs = await page.evaluate(() => performance.getEntriesByName("patrol-ready").at(-1)?.startTime);
    await page.waitForFunction(() => window.__PATROL_TELEMETRY__?.ready);
    await move(levels[0].witness[1]);
    await page.locator('#result-panel [data-action="next"]').click();
    await page.locator('[data-action="start"]').click();
    await page.locator("#map .border-post").first().waitFor();
    for (const order of levels[1].witness) await move(order);
    await page.locator('#result-panel [data-action="next"]').click();
    await page.locator('.roster-footer [data-action="academy"]').click();
    await page.locator('[data-action="purchase"][data-id="rapid"]').click();
    if (await page.locator('dialog[open] [data-action="close-modal"]').count()) await page.locator('dialog[open] [data-action="close-modal"]').last().click();
    await page.locator('[data-action="train"][data-id="rapid"]').click();
    await page.locator('[data-action="lesson-done"]').click();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(m => [m.name, m.value]));
    const before = await metrics();
    const frameTimes = await page.evaluate(() => new Promise(resolve => {
      const frames = [], start = performance.now();
      const frame = t => { frames.push(t); if (t - start < 1000) requestAnimationFrame(frame); else resolve(frames); };
      requestAnimationFrame(frame);
    }));
    const after = await metrics();
    await cdp.detach();
    const deltas = frameTimes.slice(1).map((t, i) => t - frameTimes[i]).sort((a, b) => a - b);
    const performanceSample = { coldReadinessMs, warmReadinessMs, frameMedianMs: deltas[Math.floor(deltas.length / 2)], frameP95Ms: deltas[Math.floor(deltas.length * .95)], browserTaskMs: (after.TaskDuration - before.TaskDuration) * 1000, heapMiB: after.JSHeapUsedSize / 1048576 };
    await page.clock.install();
    await page.clock.fastForward(31000);
    await page.clock.resume();
    await page.locator('[data-action="choose"][data-level="3"]').click();
    await page.locator('[data-action="remove-slot"][data-slot="1"]').click();
    await page.locator('[data-action="remove-slot"][data-slot="2"]').click();
    await page.locator('[data-action="add-squad"][data-id="rapid"]').click();
    await page.locator('[data-action="start"]').click();
    await page.locator("#map .border-post").first().waitFor();
    await flush();
    const secondId = events("app_open")[1]?.properties.distinct_id;
    check(secondId && secondId !== firstId, "Refreshing rotates the anonymous identity");
    check(events("level_start").length === 3 && events("game_resume").some(p => p.properties.source === "refresh"), "Refresh resumes without duplicating level start");
    check(events("level_end").length === 2 && events("level_end").every(p => p.properties.success === 1 && p.properties.moves_used === 2 && p.properties.moves_left === 13), "Each capture records one outcome with current move counts");
    for (const lesson of ["field", "academy"]) check(events("guide_complete").filter(p => p.properties.lesson === lesson && p.properties.duration_ms > 0).length === 1, lesson + " lesson completes once with elapsed time");
    const training = events("squad_training")[0]?.properties;
    check(events("squad_purchase").length === 1 && training?.squad_type === "rapid" && training.upgrade_rank === 2 && training.training_seconds === 30 && training.hunt_number === 3, "Academy purchase and training carry the correct level, rank and duration");
    check(events("level_start").some(p => p.properties.hunt_number === 3 && p.properties.empty_slots === 1 && p.properties.rapid_rank === 2 && p.properties.squad_count === 2), "Upgraded specialist ranks and empty slots reflect the deployed roster");
    check(!packets.some(p => /map_gesture|move_issued|helicopter_deploy|post_select|squad_select|guide_step|\$identify|\$snapshot/.test(p.event)), "No gesture, move, selection, identity or replay event is uploaded");
    check(packets.every(p => p.properties.$process_person_profile === false && p.properties.$is_identified === false && p.properties.$geoip_disable === true), "Every real outbound event is unidentified with GeoIP disabled");
    check(!JSON.stringify(packets).includes("PRIVATE") && !packets.some(p => Object.keys(p.properties).some(k => /attempt_id|uid|email|\$device_id|\$set|url|referrer/i.test(k))), "No profile, account, save identity, URLs or person updates escape");
    check(forbiddenRequests.length === 0, "Meta, replay and survey resources are never requested");
    check(errors.length === 0, "No browser or payload errors");
    return { performanceSample, checks: checks.length, passed: checks, uploadedPackets: packets.length, names: [...new Set(packets.map(p => p.event))] };
  } finally { await context.close(); }
}
