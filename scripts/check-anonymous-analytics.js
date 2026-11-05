// Playwright CLI run-code callback. Requires VITE_FIREBASE_EMULATORS=1.
// All analytics uploads and every Meta request are intercepted before navigation.
async basePage => {
  const baseURL = new URL(basePage.url());
  const origin = baseURL.protocol === "about:" ? "http://localhost:3000" : baseURL.origin;
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
    throw new Error("Run this check against the local emulator-backed Vite server.");
  // Safe CLI carrier: about:blank#firestore_emulator_port=18080 (8080 by default).
  const options = new URLSearchParams(baseURL.hash.slice(1));
  const firestoreEmulatorPort = Number(options.get("firestore_emulator_port") || baseURL.searchParams.get("firestore_emulator_port") || 8080);
  if (!Number.isInteger(firestoreEmulatorPort) || firestoreEmulatorPort < 1 || firestoreEmulatorPort > 65535)
    throw new Error("Invalid Firestore emulator port");
  const contexts = [], scenarios = [];
  const legacyKey = "ph_phc_qvnmtmJK9HVoMtGsY6HHS66U6dcbfqBpR3ZBhkgCW54G_posthog";
  const persistenceKey = "ph_patrol_anonymous_v1";
  const sample = packet => packet && ({
    event: packet.event,
    properties: Object.fromEntries(Object.entries(packet.properties || {}).filter(([key]) =>
      ["distinct_id", "$anon_distinct_id", "$session_id", "$process_person_profile", "$is_identified",
        "signed_in", "app_version", "utm_source", "utm_medium", "utm_campaign", "utm_content"].includes(key))),
  });
  const make = async () => {
    const context = await basePage.context().browser().newContext({
      viewport: { width: 390, height: 844 }, serviceWorkers: "block",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    });
    contexts.push(context);
    const packets = [], errors = [], safety = { posthogPosts: 0, metaRequests: 0, productionFirebaseRequests: 0 };
    // A separate blank page keeps decompression alive while the app reloads.
    const decoder = await context.newPage();
    await context.route("**/*posthog.com/**", async route => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() === "GET" && (/^\/array\/[^/]+\/config(?:\.js)?\/?$/.test(url.pathname) || /^\/static\/.*\.js$/.test(url.pathname)))
        return route.continue();
      if (request.method() === "POST") {
        safety.posthogPosts++;
        try {
          if (/\/(e|s|batch|capture)\/?$/.test(url.pathname)) {
            const body = await decoder.evaluate(async ({ bytes, compression }) => {
              const data = new Uint8Array(bytes);
              let text = compression === "gzip-js" || data[0] === 31 && data[1] === 139
                ? await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("gzip"))).text()
                : new TextDecoder().decode(data);
              if (text.startsWith("data=")) {
                text = new URLSearchParams(text).get("data");
                if (compression === "base64") text = new TextDecoder().decode(Uint8Array.from(atob(text), c => c.charCodeAt(0)));
              }
              return JSON.parse(text);
            }, { bytes: Array.from(request.postDataBuffer() || []), compression: url.searchParams.get("compression") });
            packets.push(...(Array.isArray(body) ? body : body.batch || [body]));
          }
        } catch (error) { errors.push("Payload decode: " + error.message); }
      }
      // Also fulfil unexpected PostHog methods/paths: never forward an upload.
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"status":1,"featureFlags":{}}' });
    });
    for (const pattern of ["https://www.facebook.com/**", "https://connect.facebook.net/**"])
      await context.route(pattern, route => { safety.metaRequests++; return route.fulfill({ status: 200, body: "" }); });
    for (const pattern of ["https://identitytoolkit.googleapis.com/**", "https://securetoken.googleapis.com/**", "https://firestore.googleapis.com/**"])
      await context.route(pattern, route => { safety.productionFirebaseRequests++; errors.push("Production Firebase request blocked"); return route.abort(); });
    if (firestoreEmulatorPort !== 8080)
      await context.route("http://127.0.0.1:8080/**", route => route.continue({ url: route.request().url().replace("127.0.0.1:8080", "127.0.0.1:" + firestoreEmulatorPort) }));
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    const waitFor = async (predicate, label) => {
      const deadline = Date.now() + 45000;
      while (!predicate()) {
        if (errors.length) throw new Error(errors.join("; "));
        if (Date.now() >= deadline) throw new Error("Timed out: " + label);
        await page.waitForTimeout(100);
      }
    };
    return { context, page, packets, errors, safety, waitFor };
  };
  const run = async (id, title, body) => {
    const result = { id, title, status: "PASS", checks: [], sample: null };
    const check = (ok, label) => { if (!ok) throw new Error(label); result.checks.push(label); };
    try { await body(check, result); }
    catch (error) { result.status = "FAIL"; result.error = error.message; }
    scenarios.push(result);
  };
  const privateKeys = packet => Object.keys(packet.properties || {}).filter(key =>
    key === "$current_url" || key === "$referrer" || key.startsWith("$initial_") || key === "$geoip_disable" || key === "uid");
  let guest;
  try {
    await run(1, "Tagged guest entry", async (check, result) => {
      guest = await make();
      await guest.page.goto(origin + "/?utm_source=meta&utm_medium=paid&telemetry_debug=1", { waitUntil: "domcontentloaded" });
      await guest.waitFor(() => guest.packets.some(packet => packet.event === "app_open"), "tagged app_open upload");
      const entry = guest.packets.find(packet => packet.event === "app_open");
      result.sample = sample(entry);
      check(entry.properties.utm_source === "meta" && entry.properties.utm_medium === "paid", "Ad tags survive the outbound allow-list");
      check(entry.properties.app_version === "2.1.0", "app_open carries release 2.1.0");
      check(entry.properties.$process_person_profile === false && entry.properties.signed_in === false, "Guest events do not process a person profile");
      check(privateKeys(entry).length === 0, "No URL, referrer, initial attribution, uid property, or GeoIP opt-out");
      check(guest.errors.length === 0, "No page, payload, or production Firebase errors");
      result.networkSafety = guest.safety;
    });
    await run(2, "Guest reload and fresh browser", async (check, result) => {
      if (!guest?.packets.some(packet => packet.event === "app_open")) throw new Error("Tagged entry did not produce the guest baseline");
      const first = guest.packets.find(packet => packet.event === "app_open");
      const before = guest.packets.filter(packet => packet.event === "app_open").length;
      await guest.page.reload({ waitUntil: "domcontentloaded" });
      await guest.waitFor(() => guest.packets.filter(packet => packet.event === "app_open").length > before, "reloaded app_open upload");
      const reloaded = guest.packets.filter(packet => packet.event === "app_open").at(-1);
      const fresh = await make();
      await fresh.page.goto(origin + "/?telemetry_debug=1", { waitUntil: "domcontentloaded" });
      await fresh.waitFor(() => fresh.packets.some(packet => packet.event === "app_open"), "fresh browser app_open upload");
      const freshEntry = fresh.packets.find(packet => packet.event === "app_open");
      result.sample = { first: sample(first), reloaded: sample(reloaded), freshBrowser: sample(freshEntry) };
      check(!!first.properties.distinct_id && reloaded.properties.distinct_id === first.properties.distinct_id, "Reload keeps the browser's anonymous identity");
      check(freshEntry.properties.distinct_id !== first.properties.distinct_id, "A fresh browser context gets a different anonymous identity");
      check(reloaded.properties.$process_person_profile === false && freshEntry.properties.$process_person_profile === false, "Both browser identities remain guests");
      check(!guest.packets.concat(fresh.packets).some(packet => packet.event === "$identify"), "Guest reload never identifies a person");
      check(guest.errors.length + fresh.errors.length === 0, "No page or payload errors");
      result.networkSafety = [guest.safety, fresh.safety];
    });
    await run(5, "Legacy identified store isolation", async (check, result) => {
      const legacy = await make();
      await legacy.context.addInitScript(({ origin, legacyKey }) => {
        if (location.origin !== origin) return;
        localStorage.setItem(legacyKey, JSON.stringify({ distinct_id: "PRIVATE_OLD_IDENTIFIED", $user_state: "identified", $device_id: "PRIVATE_DEVICE" }));
      }, { origin, legacyKey });
      await legacy.context.addCookies([{ name: legacyKey, value: encodeURIComponent(JSON.stringify({ distinct_id: "PRIVATE_OLD_IDENTIFIED", $user_state: "identified" })), url: origin }]);
      await legacy.page.goto(origin + "/?telemetry_debug=1", { waitUntil: "domcontentloaded" });
      await legacy.waitFor(() => legacy.packets.some(packet => packet.event === "app_open"), "legacy-store app_open upload");
      const entry = legacy.packets.find(packet => packet.event === "app_open");
      result.sample = sample(entry);
      const persisted = await legacy.page.evaluate(key => JSON.parse(localStorage.getItem(key) || "null"), persistenceKey);
      check(!!entry.properties.distinct_id && !entry.properties.distinct_id.includes("PRIVATE"), "Legacy identified ID is not reopened");
      check(persisted?.distinct_id === entry.properties.distinct_id, "The new anonymous ID persists in patrol_anonymous_v1");
      check(entry.properties.$process_person_profile === false && entry.properties.signed_in === false, "Legacy account is reconciled as a guest");
      check(!legacy.packets.some(packet => packet.event === "$identify"), "No identify event is sent for a guest");
      check(privateKeys(entry).length === 0, "Legacy profile and URL properties stay excluded");
      check(legacy.errors.length === 0, "No page or payload errors");
      result.networkSafety = legacy.safety;
    });
    return { status: scenarios.every(result => result.status === "PASS") ? "PASS" : "FAIL", firestoreEmulatorPort, scenarios };
  } finally { for (const context of contexts) await context.close(); }
}
