// Playwright CLI run-code callback. Firebase emulators + the real PostHog SDK.
// Open about:blank first; every test context installs interception before navigation.
async basePage => {
  const baseURL = new URL(basePage.url());
  const origin = baseURL.protocol === "about:" ? "http://localhost:3000" : baseURL.origin;
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
    throw new Error("Run this check against the local emulator-backed Vite server.");
  // Optional carrier: about:blank#firestore_emulator_port=18080 (8080 by default).
  const options = new URLSearchParams(baseURL.hash.slice(1));
  const firestoreEmulatorPort = Number(options.get("firestore_emulator_port") || baseURL.searchParams.get("firestore_emulator_port") || 8080);
  if (!Number.isInteger(firestoreEmulatorPort) || firestoreEmulatorPort < 1 || firestoreEmulatorPort > 65535)
    throw new Error("Invalid Firestore emulator port");
  const contexts = [], scenarios = [], fixture = Date.now().toString(36);
  const persistenceKey = "ph_patrol_anonymous_v1";
  const rrwebEvents = packet => {
    const data = packet.properties?.$snapshot_data;
    return (Array.isArray(data) ? data : data ? [data] : []).filter(event => event && typeof event === "object");
  };
  const sample = packet => {
    if (!packet) return null;
    const keys = ["distinct_id", "$anon_distinct_id", "$session_id", "$process_person_profile", "$is_identified",
      "signed_in", "app_version", "screen", "reason", "email", "name", "email_verified", "auth_provider"];
    const properties = Object.fromEntries(Object.entries(packet.properties || {}).filter(([key]) => keys.includes(key))
      .map(([key, value]) => [key, key === "email" || key === "name" ? "[synthetic " + key + "]" : value]));
    if (packet.event === "$snapshot") {
      const events = rrwebEvents(packet), timestamps = events.map(event => event.timestamp).filter(Number.isFinite);
      properties.$snapshot_data = { eventCount: events.length, types: [...new Set(events.map(event => event.type))],
        earliestTimestamp: timestamps.length ? Math.min(...timestamps) : null,
        latestTimestamp: timestamps.length ? Math.max(...timestamps) : null };
    }
    return { event: packet.event, properties };
  };
  const make = async () => {
    const context = await basePage.context().browser().newContext({
      viewport: { width: 390, height: 844 }, serviceWorkers: "block",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    });
    contexts.push(context);
    const packets = [], uploads = [], errors = [], safety = { posthogPosts: 0, metaRequests: 0, productionFirebaseRequests: 0 };
    // Do not decode on the app page: reload can destroy its execution context.
    const decoder = await context.newPage();
    await context.route("**/*posthog.com/**", async route => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() === "GET" && (/^\/array\/[^/]+\/config(?:\.js)?\/?$/.test(url.pathname) || /^\/static\/.*\.js$/.test(url.pathname)))
        return route.continue();
      if (request.method() === "POST") {
        safety.posthogPosts++;
        if (/\/(e|s|batch|capture)\/?$/.test(url.pathname)) {
          const upload = { receivedAt: Date.now(), path: url.pathname, packets: [] };
          uploads.push(upload);
          try {
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
            upload.packets = Array.isArray(body) ? body : body.batch || [body];
            packets.push(...upload.packets);
          } catch (error) { errors.push("Payload decode: " + error.message); }
        }
      }
      // Every non-GET request is answered locally, including unknown POST paths.
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
    const waitFor = async (predicate, label, timeout = 45000) => {
      const deadline = Date.now() + timeout;
      while (!await predicate()) {
        if (errors.length) throw new Error(errors.join("; "));
        if (Date.now() >= deadline) throw new Error("Timed out: " + label);
        await page.waitForTimeout(100);
      }
    };
    return { context, page, packets, uploads, errors, safety, waitFor };
  };
  const run = async (id, title, body) => {
    const result = { id, title, status: "PASS", checks: [], sample: null };
    const check = (ok, label) => { if (!ok) throw new Error(label); result.checks.push(label); };
    try { await body(check, result); }
    catch (error) { result.status = "FAIL"; result.error = error.message; }
    scenarios.push(result);
  };
  const enter = async session => {
    await session.page.goto(origin + "/?telemetry_debug=1", { waitUntil: "domcontentloaded" });
    await session.waitFor(() => session.packets.some(packet => packet.event === "app_open"), "app_open upload");
    await session.page.locator('[data-action="choose"][data-level="1"]').waitFor();
  };
  const link = async (session, tag) => session.page.evaluate(async ({ tag, fixture }) => {
    const source = performance.getEntriesByType("resource").find(entry => /\/node_modules\/\.vite\/deps\/firebase_auth\.js/.test(entry.name));
    if (!source) throw new Error("Firebase Auth module was not loaded");
    const { getAuth, linkWithCredential, GoogleAuthProvider } = await import(source.name);
    const auth = getAuth();
    if (auth.emulatorConfig?.port !== 9099 || !["127.0.0.1", "localhost"].includes(auth.emulatorConfig?.host))
      throw new Error("Refusing credential linking without the local Auth emulator");
    if (!auth.currentUser?.isAnonymous) throw new Error("Expected an anonymous Firebase user before linking");
    const jwt = [{ alg: "none", typ: "JWT" }, { iss: "https://accounts.google.com", aud: "emulator-client", sub: crypto.randomUUID(),
      email: `${tag}-${fixture}@example.test`, name: `Officer ${tag}`, email_verified: true,
      iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }]
      .map(value => btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")).join(".") + ".";
    const before = auth.currentUser.uid;
    const result = await linkWithCredential(auth.currentUser, GoogleAuthProvider.credential(jwt));
    if (result.user.uid !== before) throw new Error("Credential linking unexpectedly changed the Firebase uid");
    return result.user.uid;
  }, { tag, fixture });
  const sdkReady = async session => {
    let ready;
    await session.waitFor(async () => {
      ready = await session.page.evaluate(async () => {
        // Import the exact Vite URL so this observes the application's SDK singleton.
        const source = performance.getEntriesByType("resource").find(entry => /\/node_modules\/\.vite\/deps\/posthog-js\.js/.test(entry.name));
        if (!source) return null;
        const sdk = (await import(source.name)).default;
        if (!sdk.__loaded) return null;
        const { PLAYTEST_CONFIG } = await import("/src/game/playtest.config.ts");
        return { observedAt: Date.now(), timeoutMs: PLAYTEST_CONFIG.telemetry.replayReadyTimeoutMs };
      });
      return ready;
    }, "PostHog SDK initialization");
    return ready;
  };
  const privacy = packet => !Object.hasOwn(packet, "$set") && !Object.hasOwn(packet, "$set_once") &&
    !Object.keys(packet.properties || {}).some(key => key === "uid" || key === "$set" || key === "$set_once" ||
      key === "$current_url" || key === "$referrer" || key.startsWith("$initial_") || key === "$geoip_disable");
  const snapshotAfter = (session, distinctId, after, previousSession) => session.packets.find(packet =>
    packet.event === "$snapshot" && packet.properties.distinct_id === distinctId &&
    packet.properties.$session_id && packet.properties.$session_id !== previousSession &&
    rrwebEvents(packet).some(event => Number.isFinite(event.timestamp) && event.timestamp > after));
  const readSeed = async session => {
    const seed = await session.page.evaluate(key => JSON.parse(localStorage.getItem(key) || "null"), persistenceKey);
    if (seed?.$user_state !== "identified" || !seed.$sesid?.[1] || !seed.$session_recording_remote_config?.enabled)
      throw new Error("A live identified replay store is required for the startup scenarios");
    return seed;
  };
  const seedIdentity = async (session, seed, uid) => {
    await session.context.addInitScript(({ origin, persistenceKey, seed, uid }) => {
      if (location.origin !== origin) return;
      const state = { ...seed, distinct_id: uid, $user_state: "identified", $sesid: [Date.now(), seed.$sesid[1], seed.$sesid[2]] };
      localStorage.setItem(persistenceKey, JSON.stringify(state));
      document.cookie = persistenceKey + "=" + encodeURIComponent(JSON.stringify({ distinct_id: uid, $user_state: "identified", $device_id: seed.$device_id })) + "; path=/; SameSite=Lax";
    }, { origin, persistenceKey, seed, uid });
  };
  let restoreSession, restoredUid, replaySeed;
  try {
    await run(3, "Google link, sign-out privacy, and replay after reload", async (check, result) => {
      const session = await make();
      result.networkSafety = session.safety;
      await enter(session);
      const guest = session.packets.find(packet => packet.event === "app_open");
      result.sample = { guest: sample(guest) };
      check(guest.properties.$process_person_profile === false, "Initial guest does not process a person profile");
      await session.page.locator('.bottom-nav [data-action="levels"]').click();
      await session.waitFor(() => session.packets.some(packet => packet.event === "$snapshot" && rrwebEvents(packet).length), "guest replay snapshot upload");
      const beforeLink = session.packets.length;
      const uid = await link(session, "link");
      await session.page.locator('.bottom-nav [data-action="home"]').click();
      await session.waitFor(() => session.packets.slice(beforeLink).some(packet => packet.event === "$identify") &&
        session.packets.slice(beforeLink).some(packet => packet.event === "page_view" && packet.properties.signed_in === true), "identify and signed-in gameplay uploads");
      const linked = session.packets.slice(beforeLink), identifies = linked.filter(packet => packet.event === "$identify");
      const signed = linked.find(packet => packet.event === "page_view" && packet.properties.signed_in === true);
      result.sample.identify = sample(identifies[0]);
      result.sample.signedIn = sample(signed);
      check(identifies.length === 1 && identifies[0].properties.distinct_id === uid, "Linking emits exactly one identify with the unchanged Firebase uid");
      check(identifies[0].properties.$anon_distinct_id === guest.properties.distinct_id, "Identify merges the preceding browser guest ID");
      check(privacy(identifies[0]) && !Object.hasOwn(identifies[0].properties, "email") && !Object.hasOwn(identifies[0].properties, "name"), "Identify has no person properties, URL, or referrer");
      check(signed.properties.distinct_id === uid && signed.properties.$process_person_profile === true, "Signed-in gameplay uses the uid and processes its profile");
      check(signed.properties.email === `link-${fixture}@example.test` && signed.properties.name === "Officer link" && signed.properties.email_verified === true && signed.properties.auth_provider === "google.com", "Existing signed-in email/name/provider event properties remain intact");
      check(signed.properties.$session_id === guest.properties.$session_id, "Guest and signed-in events keep one replay session");
      const beforeSignOut = session.packets.length;
      await session.page.locator('[data-action="account"]').click();
      await session.page.locator('[data-action="sign-out"]').click();
      await session.waitFor(() => session.page.evaluate(async () => {
        const source = performance.getEntriesByType("resource").find(entry => /\/node_modules\/\.vite\/deps\/firebase_auth\.js/.test(entry.name));
        return (await import(source.name)).getAuth().currentUser?.isAnonymous === true;
      }), "Firebase sign-out and replacement guest");
      await session.page.locator('[data-action="choose"][data-level="1"]').waitFor();
      const signOutAt = await session.page.evaluate(() => Date.now());
      await session.page.locator('.bottom-nav [data-action="levels"]').click();
      await session.waitFor(() => session.packets.slice(beforeSignOut).some(packet => packet.event === "page_view" && packet.properties.signed_in === false), "post-sign-out guest event");
      const signedOut = session.packets.slice(beforeSignOut).find(packet => packet.event === "page_view" && packet.properties.signed_in === false);
      result.sample.signedOut = sample(signedOut);
      check(!!signedOut.properties.distinct_id && signedOut.properties.distinct_id !== uid && signedOut.properties.distinct_id !== guest.properties.distinct_id && signedOut.properties.$process_person_profile === false, "Sign-out rotates to a new guest identity without person processing");
      check(!!signedOut.properties.$session_id && signedOut.properties.$session_id !== signed.properties.$session_id, "Sign-out rotates the previous replay session");
      check(!signedOut.properties.email && !signedOut.properties.name, "Sign-out clears the account event properties");
      result.signOutAt = signOutAt;
      const snapshotsAfterSignOut = () => session.packets.filter(packet => packet.event === "$snapshot" &&
        rrwebEvents(packet).some(event => Number.isFinite(event.timestamp) && event.timestamp > signOutAt));
      const staleReplay = () => snapshotsAfterSignOut().filter(packet =>
        packet.properties.distinct_id === uid || packet.properties.$session_id === signed.properties.$session_id);
      // The approved SDK limitation permits a replay pause until reload. Keep
      // observing uploads after a visible action and reject old-account leakage.
      await session.page.waitForTimeout(5500);
      result.replayObservation = { beforeReloadMs: 5500, snapshotsBeforeReload: snapshotsAfterSignOut().length };
      result.sample.unsafeReplay = staleReplay().map(sample);
      check(staleReplay().length === 0, "No replay activity recorded after sign-out uses the prior Firebase uid or session");
      check(session.packets.filter(packet => packet.event === "app_open").length === 1, "app_open fires exactly once on this page despite both identity transitions");

      await session.page.reload({ waitUntil: "domcontentloaded" });
      await session.waitFor(() => session.packets.filter(packet => packet.event === "app_open").length > 1, "guest app_open after sign-out and reload");
      const reloaded = session.packets.filter(packet => packet.event === "app_open")[1];
      result.sample.reloadedGuest = sample(reloaded);
      check(reloaded.properties.distinct_id === signedOut.properties.distinct_id && reloaded.properties.signed_in === false && reloaded.properties.$process_person_profile === false, "Reload preserves the new guest identity without person processing");
      check(!!reloaded.properties.$session_id && reloaded.properties.$session_id !== signed.properties.$session_id, "Reload stays outside the signed-in replay session");
      const resumedAt = await session.page.evaluate(() => Date.now());
      await session.page.locator('.bottom-nav [data-action="home"]').click();
      await session.waitFor(() => snapshotAfter(session, signedOut.properties.distinct_id, resumedAt, signed.properties.$session_id), "guest replay with new rrweb activity after reload");
      const replay = snapshotAfter(session, signedOut.properties.distinct_id, resumedAt, signed.properties.$session_id);
      result.sample.replayAfterReload = sample(replay);
      result.replayObservation.resumedAt = resumedAt;
      result.replayObservation.snapshotsAfterSignOut = snapshotsAfterSignOut().length;
      result.sample.unsafeReplay = staleReplay().map(sample);
      check(!!replay, "Replay resumes after reload under the new guest ID and a different session with newly recorded activity");
      check(staleReplay().length === 0, "All post-sign-out replay activity, including reload, excludes the prior Firebase uid and session");
      check(session.packets.filter(packet => packet.event === "app_open").length === 2, "The two page loads each emit app_open exactly once");
      check(session.packets.filter(packet => packet.event !== "$snapshot").every(privacy), "Gameplay and identify payloads keep the privacy allow-list");
      check(session.packets.filter(packet => !packet.event.startsWith("$")).every(packet => packet.properties.app_version === "2.1.0"), "Every observed collected gameplay event carries app_version 2.1.0");
      check(session.errors.length === 0, "No page or payload errors");
      result.networkSafety = session.safety;
      await session.context.close();
    });
    await run(4, "Restore a linked Firebase account", async (check, result) => {
      restoreSession = await make();
      await enter(restoreSession);
      restoredUid = await link(restoreSession, "restore");
      await restoreSession.page.locator('.bottom-nav [data-action="levels"]').click();
      await restoreSession.waitFor(() => restoreSession.packets.some(packet => packet.event === "$identify" && packet.properties.distinct_id === restoredUid), "linked account identify upload");
      const previous = restoreSession.packets.filter(packet => packet.event === "app_open").length;
      await restoreSession.page.reload({ waitUntil: "domcontentloaded" });
      await restoreSession.waitFor(() => restoreSession.packets.filter(packet => packet.event === "app_open").length > previous, "restored app_open upload");
      const entry = restoreSession.packets.filter(packet => packet.event === "app_open").slice(previous)[0];
      result.sample = sample(entry);
      check(entry.properties.distinct_id === restoredUid && entry.properties.signed_in === true && entry.properties.$process_person_profile === true, "First restored app_open already belongs to the Firebase uid");
      check(entry.properties.app_version === "2.1.0" && privacy(entry), "Restored entry retains the version and excludes URL/person updates");
      await restoreSession.page.locator('.bottom-nav [data-action="home"]').click();
      await restoreSession.waitFor(() => restoreSession.packets.some(packet => packet.event === "$snapshot" && packet.properties.distinct_id === restoredUid && rrwebEvents(packet).length), "linked replay snapshot for startup fixture");
      replaySeed = await readSeed(restoreSession);
      check(restoreSession.errors.length === 0, "No page or payload errors");
      result.networkSafety = restoreSession.safety;
    });
    await run(6, "Failed campaign fetch waits for the guest fallback", async (check, result) => {
      if (!replaySeed) throw new Error("Scenario 4 did not produce an active identified replay fixture");
      const session = await make();
      const staleUid = "stale-startup-" + fixture;
      await seedIdentity(session, replaySeed, staleUid);
      let abortedCampaignRequests = 0, authRequests = 0;
      await session.context.route("**/data/*-campaign.json", route => { abortedCampaignRequests++; return route.abort(); });
      await session.context.route("http://127.0.0.1:9099/**", route => { authRequests++; return route.continue(); });
      await session.page.goto(origin + "/?telemetry_debug=1", { waitUntil: "domcontentloaded" });
      const ready = await sdkReady(session);
      await session.page.waitForTimeout(Math.max(0, ready.timeoutMs - 300));
      check(session.uploads.length === 0, "No gameplay or snapshot upload occurs while Auth is unresolved before the fallback");
      await session.waitFor(() => session.packets.some(packet => packet.event === "country_load_error"), "fallback country_load_error upload");
      const failure = session.packets.find(packet => packet.event === "country_load_error");
      const firstUpload = session.uploads[0];
      result.sample = sample(failure);
      result.timing = { fallbackTimeoutMs: ready.timeoutMs, firstUploadAfterObservedSdkReadyMs: firstUpload.receivedAt - ready.observedAt };
      check(firstUpload.receivedAt - ready.observedAt >= ready.timeoutMs - 100, "First upload follows the fallback timeout (100 ms observation tolerance)");
      check(abortedCampaignRequests > 0 && authRequests === 0, "Campaign failure happens before ProgressClient or any Auth request exists");
      check(failure.properties.distinct_id !== staleUid && failure.properties.distinct_id !== replaySeed.distinct_id && failure.properties.$process_person_profile === false, "Fallback resets the stale account and sends the failure under a new anonymous ID");
      check(failure.properties.reason === "initialization_failed" && failure.properties.app_version === "2.1.0" && privacy(failure), "Failure uses the bounded reason, current version, and gameplay privacy filter");
      check(!session.packets.some(packet => packet.event === "$identify"), "Guest fallback never identifies the stale account");
      check(session.errors.length === 0, "No page or payload errors");
      result.networkSafety = session.safety;
      await session.context.close();
    });
    await run(7, "Delayed Auth reconciles a different persisted account", async (check, result) => {
      if (!restoreSession || !restoredUid || !replaySeed) throw new Error("Scenario 4 did not produce a persisted linked account and active replay fixture");
      const session = restoreSession, staleUid = "different-account-" + fixture;
      // Drain the previous document's replay before measuring the reload gate.
      await session.page.evaluate(async () => {
        const source = performance.getEntriesByType("resource").find(entry => /\/node_modules\/\.vite\/deps\/posthog-js\.js/.test(entry.name));
        (await import(source.name)).default.stopSessionRecording();
      });
      await session.page.waitForTimeout(1500);
      await seedIdentity(session, replaySeed, staleUid);
      let releaseAuth;
      const gate = new Promise(resolve => { releaseAuth = resolve; });
      const held = [];
      await session.context.route("http://127.0.0.1:9099/**", async route => {
        const path = new URL(route.request().url()).pathname;
        if (!/accounts:lookup|\/token$/.test(path)) return route.continue();
        const response = await route.fetch();
        held.push(path);
        await gate;
        return route.fulfill({ response });
      });
      const uploadStart = session.uploads.length, packetStart = session.packets.length;
      try {
        await session.page.reload({ waitUntil: "domcontentloaded" });
        await session.waitFor(() => held.length > 0, "held Auth token/account-lookup response", 10000);
        const ready = await sdkReady(session);
        await session.page.waitForTimeout(3000);
        check(3000 < ready.timeoutMs, "Auth is released before the configured fallback deadline");
        check(session.uploads.length === uploadStart, "No gameplay or snapshot upload occurs while restored Auth responses are held");
        const releasedAt = await session.page.evaluate(() => Date.now());
        releaseAuth();
        await session.waitFor(() => session.packets.slice(packetStart).some(packet => packet.event === "app_open"), "app_open after delayed Auth resolution");
        const after = session.packets.slice(packetStart), entry = after.find(packet => packet.event === "app_open");
        const identify = after.filter(packet => packet.event === "$identify");
        result.sample = { identify: sample(identify[0]), appOpen: sample(entry) };
        result.heldAuthResponses = held;
        check(identify.length === 1 && identify[0].properties.distinct_id === restoredUid, "Exactly one identify resolves to the actual restored Firebase uid");
        check(!!identify[0].properties.$anon_distinct_id && identify[0].properties.$anon_distinct_id !== staleUid && identify[0].properties.$anon_distinct_id !== restoredUid, "A fresh anonymous predecessor proves reset happened before identify");
        check(entry.properties.distinct_id === restoredUid && entry.properties.$process_person_profile === true && entry.properties.signed_in === true, "The startup queue flushes under the resolved account");
        check(entry.properties.$session_id !== replaySeed.$sesid[1], "Account reconciliation rotates the seeded replay session");
        check(after.filter(packet => packet.event !== "$snapshot").every(privacy), "Reconciliation preserves the gameplay and identify privacy filter");
        await session.page.locator('.bottom-nav [data-action="levels"]').click();
        await session.waitFor(() => snapshotAfter(session, restoredUid, releasedAt, replaySeed.$sesid[1]), "replay after delayed Auth with a fresh session and timestamp");
        result.sample.replay = sample(snapshotAfter(session, restoredUid, releasedAt, replaySeed.$sesid[1]));
        check(!!result.sample.replay, "Replay starts only after identity resolution with newly recorded events");
        check(session.packets.slice(packetStart).filter(packet => packet.event === "app_open").length === 1, "The resolved queue sends app_open once");
        check(session.errors.length === 0, "No page or payload errors");
        result.networkSafety = session.safety;
      } finally { releaseAuth(); }
    });
    return { status: scenarios.every(result => result.status === "PASS") ? "PASS" : "FAIL", firestoreEmulatorPort, scenarios };
  } finally { for (const context of contexts) await context.close(); }
}
