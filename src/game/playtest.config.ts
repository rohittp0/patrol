/**
 * Patrol's single source for playtest tuning values.
 *
 * Edit values here rather than copying numbers into future movement, level,
 * map, or rendering code. This module has no framework or MapTiler dependency.
 * The map compiler, game simulation, and interface share these values.
 *
 * Value status:
 * - AGREED: selected during the design discussion; still adjustable for testing.
 * - STARTER: an editable first experiment, not a measured or balanced value.
 *
 * Fixed rules are documented in CONTEXT.md and are not tuning switches:
 * - One order relocates one squad and advances runner travel before another order.
 * - The runner moves only during active orders; thinking time stays paused.
 * - A departing squad stops securing its origin immediately and starts securing
 *   its destination on arrival.
 * - Movement is across land, unrestricted by roads; ocean is impassable.
 * - The runner is always visible. The runner and travelling squads use icon
 *   markers; border posts remain circular markers.
 * - The runner anticipates squad arrivals when choosing a land escape route,
 *   and recalculates whenever a border opens or closes.
 * - Individual borders are non-closed segments, with a border post at the middle.
 * - A border post holds at most one squad; occupied posts are not destinations.
 * - Every border endpoint meets another border, coastline, or the zone's outer
 *   boundary; there are no loose ends inland.
 * - Squads can secure authored segments of internal borders and the patrol
 *   zone's outer land boundary.
 * - Containment seals every land escape route with secured borders and coastline.
 * - Crossing the zone's outer land boundary or exceeding the order budget loses.
 * - Winning score = the level's maxOrders minus orders used.
 * - Current levels use non-island countries, with detached islands excluded.
 * - Every challenge has a verified minimum move requirement and a replayed
 *   winning sequence within budget; introductions reset in each country.
 *
 * Add new tuning values to this file as mechanics are agreed. Current boards
 * and winning setup sequences are generated and checked; balance still needs
 * playtesting. See docs/level-design.md for sources and geometry limitations.
 */
export const PLAYTEST_CONFIG = {
  progressionV2: {
    /** AGREED: India first for everybody; at least 15 consecutive levels. */
    version: 2, country: "india", levelCount: 15, maxMoves: 15, slots: 3,
    /** AGREED: extra slot purchases are future content, not enabled by this build. */
    futureSlots: [15, 25],
    /** STARTER: integer game-money amounts, never real currency. */
    baseReward: 30, rewardStep: 15,
    /** AGREED: real seconds per sequential upgrade. Each specialist's first
     * upgrade takes longer than the previous specialist's last. Values STARTER. */
    trainingSeconds: {
      rapid: [30, 60, 180, 600],
      helicopter: [900, 1800, 3600, 7200],
      marksman: [10800, 14400, 21600, 28800],
    },
    /** STARTER: game money charged for upgrade steps 1–4. */
    upgradeCosts: [20, 30, 50, 70],
    /** STARTER: unlock levels and prices; Rapid at Level 3 is AGREED. */
    catalog: {
      rapid: { name: "Rapid Action Squad", unlock: 3, price: 25, symbol: "↯", description: "Reach distant posts before the fugitive. Train for faster movement." },
      helicopter: { name: "Helicopter Squad", unlock: 6, price: 60, symbol: "✣", description: "Deploy to any free post. Temporary guarding; reusable throughout a level." },
      marksman: { name: "Marksman Squad", unlock: 10, price: 100, symbol: "◎", description: "A firing radius while stationed. Train to extend its reach." },
    },
    /** STARTER: km/h at upgrade steps 0–4; positive, strictly increasing. */
    rapidSpeeds: [180, 240, 320, 430, 580],
    /** STARTER: simulated hours and guarded subsequent moves at steps 0–4.
     * Alternate endurance and deployment-time improvements on one fixed track. */
    helicopterHours: [3, 3, 1.8, 1.8, 0.9],
    helicopterGuardMoves: [2, 3, 3, 4, 4],
    /** STARTER: firing radius in geographic km, positive and increasing. */
    marksmanRadiusKm: [25, 45, 70, 100, 140],
    /** STARTER: ground squad speed in simulated km/h, positive. */
    patrolSpeedKmh: 120,
    /** AGREED: one distinct illustrated opponent and independently tunable running
     * speed per India level. STARTER speeds are simulated km/h, positive and
     * increasing; fictional chase values, never historical athletic claims. */
    opponents: [
      { caseId: "veerappan", speedKmh: 48 },
      { caseId: "sobhraj", speedKmh: 52 },
      { caseId: "phoolan", speedKmh: 60 },
      { caseId: "raghav", speedKmh: 64 },
      { caseId: "tomar", speedKmh: 72 },
      { caseId: "malkhan", speedKmh: 80 },
      { caseId: "bulger", speedKmh: 84 },
      { caseId: "kelly", speedKmh: 88 },
      { caseId: "karpis", speedKmh: 92 },
      { caseId: "dillinger", speedKmh: 96 },
      { caseId: "barrow", speedKmh: 100 },
      { caseId: "nelson", speedKmh: 104 },
      { caseId: "ambrus", speedKmh: 108 },
      { caseId: "rozsa", speedKmh: 112 },
      { caseId: "savanyu", speedKmh: 116 },
    ],
    /** STARTER: runner minimum per move as fraction of sqrt(India land area). */
    travelFloorFraction: 0.008,
    /** STARTER: simulated seconds per real second, positive. One uniform clock
     * across all orders; never accelerate a long journey to meet a duration cap. */
    playbackScale: 6000,
    /** STARTER: worker search bounds; not a proof of impossibility. */
    searchBeam: 24, searchDepth: 15,
  },
  celebration: {
    /** STARTER: capture camera zoom (MapLibre zoom units) and milliseconds. */
    focusZoom: 8.2, cameraMs: 900, resultDelayMs: 700,
  },
  audio: {
    /** STARTER: normalized output gains, 0 (silent) to 1. Music is deliberately quiet. */
    musicVolume: 0.12, effectsVolume: 0.35,
    /** STARTER: beats per minute for the original menu and pursuit scores, positive. */
    baseBpm: 82, pursuitBpm: 96,
  },
  hosting: {
    /** AGREED: production origin, without a path or trailing slash. */
    productionOrigin: "https://patrol.rohittp.com",

    /**
     * AGREED: public asset base, including both slashes.
     * The Vite build and public asset URLs use the custom domain root.
     */
    basePath: "/",

    /**
     * AGREED: development port; the style allows http://localhost:3000.
     * Configure Vite with strictPort so a busy port fails instead of silently
     * choosing a different port whose browser origin may not be allowed.
     */
    devServerPort: 3000,
  },

  movement: {
    /**
     * STARTER: runner speed in geographic kilometres per simulated hour.
     * Must be positive. This is a gameplay value, not a real travel estimate.
     */
    runnerSpeedKmh: 60,

    /**
     * AGREED: squad speed = runnerSpeedKmh * squadSpeedMultiplier.
     * Must be positive. At 2, a squad journey of 100 km gives the runner up to
     * 50 km of travel along its own land route during the same interval.
     * Keep squad speed derived so changing runner speed preserves the ratio.
     */
    squadSpeedMultiplier: 2,

    /**
     * STARTER: runner travel floor per order as a fraction of sqrt(playable
     * land area in km²). At 0.04 this is about 70 km in India and 12 km in
     * Hungary. Must be non-negative. A short squad trip secures its post on
     * arrival, then the runner continues until the order's travel floor is met.
     * Escape or containment ends the order immediately; thinking stays paused.
     */
    minimumRunnerTravelFraction: 0.04,

    /**
     * STARTER: simulated seconds advanced per real second during an order.
     * Must be positive. At 3000 and the starter speeds, a 100 km squad journey
     * takes 1 real second to animate and allows up to 50 km of runner travel.
     * Apply this equally to both actors; it changes playback duration without
     * changing their travel distances per order. Between orders, time is paused.
     */
    simulatedSecondsPerRealSecond: 3000,

    /** STARTER: maximum real seconds for a long order's playback. Both actors
     * receive the same accelerated simulation time, preserving travel distances. */
    maxOrderPlaybackSeconds: 6,

    /** STARTER: seconds of wall time processed per frame at most; hidden tabs pause. */
    maxFrameSeconds: 0.1,

    /** Numerical distance tolerance in kilometres for reaching a route node. */
    arrivalToleranceKm: 0.000001,

    runnerRouting: {
      /** STARTER: nearest visible land nodes seeded from the runner's actual
       * position. Positive integer; bounds route search after a mid-path stop. */
      visibleLandStarts: 8,
      /** STARTER: visible crossings seeded per border or neighboring face.
       * Positive integer; higher values explore more escape approaches. */
      visibleCrossingsPerBorder: 3,
      /** STARTER: entries in each visibility/escape-route cache per board.
       * Positive integer; bounds hint-search memory. Eviction affects only
       * performance, never route choices or proof signatures. */
      cacheEntries: 256,
    },

    routeSmoothing: {
      /** STARTER: maximum corner rounding radius and direct-route bow, in kilometres. */
      cornerRadiusKm: 30,
      maxBowKm: 60,
      /** STARTER: direct-arc control offset as a fraction of endpoint distance. */
      bowFraction: 0.15,
      /** STARTER: fraction of each adjacent segment available for rounding, in (0, 0.5). */
      cornerTrimFraction: 0.35,
      /** STARTER: number of straight samples per quadratic curve, at least 4. */
      curveSamples: 20,
      /** STARTER: halve curvature this many times before falling back to the land route. */
      landSafetyAttempts: 6,
    },
  },

  map: {
    /** AGREED: Patrol owns its tactical style. Public OpenFreeMap vector data
     * and fonts require no key; attribution remains supplied by TileJSON. */
    tileJsonUrl: "https://tiles.openfreemap.org/planet",
    glyphsUrl: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",

    /**
     * STARTER: inclusive length limits for an individual authored border.
     * Units: kilometres along the border, not straight-line endpoint distance.
     * Require 0 < min <= max. These bounds do not permit a closed border or
     * guarantee that a set of borders can produce a playable enclosure.
     */
    borderLengthKm: {
      min: 25,
      max: 2500,
    },

    geometry: {
      /** STARTER: simplification tolerance in projected kilometres; rebuild maps after edits. */
      simplificationKm: 1.5,
      /** Source alignment tolerance in kilometres when classifying national land boundaries. */
      landBoundaryMatchKm: 1,
      /** Topology matching tolerance in projected kilometres. */
      junctionToleranceKm: 0.00001,
      /** Coordinate decimal places in generated GeoJSON and navigation data. */
      coordinateDecimals: 7,
      /** STARTER: remove mapped inland lakes at least this large from the USA
       * board, in projected km². Keeps the Great Lakes out of land routes. */
      minimumInlandLakeAreaKm2: 500,
    },

    /** STARTER: closest zoom allowed when fitting a starting or guided chase view, >= 0. */
    runnerFocusZoom: 7,
    /** STARTER: camera transition duration in milliseconds when revealing an actor. */
    focusDurationMs: 600,
  },

  appearance: {
    /**
     * STARTER: stable colours assigned to borders, retained when secured.
     * Assign each border a distinct palette entry. Expand the palette if a
     * level needs more borders; do not silently cycle or share entries.
     * Colour distinguishability needs visual playtesting on the chosen basemap.
     */
    borderPalette: Array.from({ length: 128 }, (_, index) => ({
      // Golden-angle hue spacing avoids repeating neighbouring border colours.
      secured: `hsl(${((index * 137.508) % 360).toFixed(3)}, 100%, 68%)`,
      open: `hsl(${((index * 137.508) % 360).toFixed(3)}, 18%, 48%)`,
    })),

    /** STARTER: opacity in [0, 1]; open borders are dim, secured ones bright. */
    borderOpacity: {
      open: 0.7,
      secured: 1,
    },

    /** STARTER: positive border widths in CSS pixels, independent of map zoom. */
    borderWidthPx: {
      open: 3,
      secured: 6,
    },

    /** STARTER: dark casing separates borders from roads and basemap labels. */
    borderCasing: { color: "#102129", opacity: 0.9, extraWidthPx: 3 },
    /** STARTER: selected border is highlighted before a squad is assigned. */
    selectedBorder: { color: "#edff9d", widthPx: 7 },
    /** STARTER: glow makes secured borders clearly brighter than open ones. */
    securedBorderGlow: { color: "#edffd8", widthPx: 12, blurPx: 3, opacity: 0.8 },

    borderPost: {
      /** STARTER: positive circle radius in CSS pixels. */
      radiusPx: 12,
      /** AGREED: border posts are white. */
      fillColor: "#FFFFFF",
      /** STARTER: outline for visibility against light map features. */
      outlineColor: "#172033",
      /** STARTER: non-negative outline width in CSS pixels. */
      outlineWidthPx: 2,
    },

    squadMarker: {
      /** STARTER: positive icon width and height in CSS pixels during travel. */
      sizePx: 32,
      /** STARTER: squad icon colour, independent of the border's identity. */
      iconColor: "#2563EB",
    },

    runnerMarker: {
      /** STARTER: positive icon width and height in CSS pixels; always visible. */
      sizePx: 32,
      /** STARTER: runner icon colour. */
      iconColor: "#E11D48",
    },
  },

  setups: {
    /** STARTER: number of independently replayed starting setups to keep per country. */
    poolSize: 6,
    /** STARTER: minimum stored winning-sequence length, an integer >= 2; one-order wins are separately rejected. */
    minWitnessOrders: 2,
    /** STARTER: deepest order sequence explored when preparing the initial pool. */
    searchDepth: 4,
    /** STARTER: cap on candidate starting positions examined per region. */
    runnerCandidatesPerRegion: 32,
    /** STARTER: maximum hunts at one spawn point. Positive integer; one keeps
     * every starting location distinct. The per-region cap also applies. */
    maxSetupsPerRunner: 1,
    /** STARTER: deterministic seed used by the offline setup preparation script. */
    preparationSeed: 42,
    /** STARTER: test previously prepared areas and nearby spawn candidates
     * first after tuning. Every result still requires fresh simulation proofs. */
    preferPreparedAreas: true,
    /** STARTER: prioritize traps on land exits, where an escaping fugitive is
     * naturally headed. All other eligible enclosures remain searchable. */
    preferLandExitEnclosures: true,
    /** STARTER: entries in the shared static-enclosure cache. Positive integer;
     * eviction affects performance only, not simulation or proof results. */
    enclosureCacheEntries: 50000,
    /** AGREED: every hunt in a country starts in a different state/province. */
    maxSetupsPerRegion: 1,
    /** STARTER: nearest border posts considered for initial squads, plus all enclosure borders. */
    initialBorderCandidates: 16,
    /** STARTER: bound offline search per runner region; a failed search is not an impossibility proof. */
    maxAttemptsPerRegion: 48000,
    /** STARTER: spread search effort across runner positions instead of exhausting one spawn. */
    maxAttemptsPerRunner: 1000,
    /** STARTER: temporary posts per squad considered for a necessary
     * repositioning move before the final trap is completed. Positive integer. */
    repositionCandidatesPerSquad: 4,
    /** STARTER: adjacent administrative regions considered as one enclosure during setup search. */
    maxEnclosureRegions: 3,
    /** STARTER: also test spawns in adjacent regions, allowing a chase into
     * an enclosure instead of requiring capture in the starting region. */
    neighboringSpawnCountries: ["usa", "india", "hungary"] as readonly string[],
  },

  persistence: {
    /** STARTER: milliseconds between saves during movement. Positive; starts,
     * arrivals, finished moves and page exit also save immediately. */
    autosaveIntervalMs: 1000,
  },

  progression: {
    /** AGREED: the first two hunts of EVERY country allow a two-move capture.
     * Every later hunt must reject all one- and two-move winning sequences. */
    introductoryHunts: 2,
    introductory: {
      minimumOrders: 2,
      maximumWitnessOrders: 2,
      /** STARTER: maximum share of the final trap guarded at spawn, in [0,1]. */
      maximumInitiallyGuardedFraction: 0.75,
      /** STARTER: mean squad journey / sqrt(country land area), dimensionless. */
      minimumMeanTravelFraction: 0,
    },
    main: {
      minimumOrders: 3,
      /** STARTER: allow a verified four-move route while proving no <=2 win.
       * A four-move witness alone is not a claim that three moves are impossible. */
      maximumWitnessOrders: 4,
      /** STARTER: at most one border of a three- or four-border trap starts
       * guarded. Most of the enclosure must be built during the chase. */
      maximumInitiallyGuardedFraction: 1 / 3,
      /** STARTER: country-scaled mean journey floor for later hunts. */
      minimumMeanTravelFraction: 0.02,
    },
    /** STARTER: difficulty weights; order weight must exceed both tie-break weights combined. */
    weights: { minimumOrders: 1000, extraSolutionMove: 200, travelFraction: 100, unguardedFraction: 100, escapePressure: 100 },
  },

  hints: {
    /** AGREED: hints consume no orders or points. Cost is fixed at zero for this prototype. */
    cost: 0,
    quota: {
      /** AGREED: successful hint recommendations available per browser. Positive integer. */
      capacity: 4,
      /** AGREED: refill all hints this many milliseconds after the final hint is used. */
      refillAfterMs: 30 * 60 * 1000,
      /** STARTER: countdown display refresh interval, in milliseconds, > 0. */
      countdownTickMs: 1000,
    },
    /** STARTER: worker search wall-time budget in milliseconds; must be positive.
     * A bounded search reports recommendations separately from proven shortest wins. */
    searchTimeMs: 6000,
    /** STARTER: maximum simulated orders per request; bounds memory/CPU on large maps. */
    maxSimulations: 6000,
    /** STARTER: connected administrative regions explored as potential enclosures. */
    maxEnclosureRegions: 5,
    /** STARTER: extra milliseconds before the UI replaces an unresponsive worker. */
    workerGraceMs: 3000,
  },

  tutorial: {
    /** AGREED: teach the opening hunt in-game; slides are an optional How to play reference. */
    showOnFirstVisit: false,
    /** STARTER: version of the optional slide reference. Positive integer. */
    version: 2,
    guide: {
      /** AGREED: require highlighted moves in the first campaign hunt, with Skip guidance. */
      enabled: true,
      /** STARTER: version of the browser-local completion/skip marker. Positive integer. */
      version: 1,
      /** STARTER: spotlight clearance around the actual control, in CSS pixels, >= 0. */
      spotlightPaddingPx: 10,
      /** STARTER: clearance around the moving actors and route, in CSS pixels, > 0. */
      movementPaddingPx: 42,
      /** STARTER: minimum card clearance from viewport edges, in CSS pixels, > 0. */
      viewportMarginPx: 16,
      /** STARTER: gap between spotlight and instruction card, in CSS pixels, > 0. */
      cardGapPx: 24,
      /** STARTER: instruction card width in CSS pixels, > 0; shrinks to fit the viewport. */
      cardWidthPx: 310,
      /** STARTER: pointer pulse period in milliseconds, > 0; disabled for reduced motion. */
      pointerPulseMs: 1100,
      /** STARTER: shade opacity outside the highlighted control, in [0,1]. */
      shadeOpacity: 0.42,
    },
    /** STARTER: locally generated GIF size, frames per second and duration.
     * Run npm run prepare:tutorial after changing these positive values. */
    animation: { widthPx: 640, heightPx: 360, framesPerSecond: 10, durationSeconds: 6 },
  },

  interface: {
    /** AGREED: all transient messages dismiss after 20,000 milliseconds. */
    toastDurationMs: 20000,
    /** STARTER: CSS-pixel clearance between visible controls and camera framing, >= 0. */
    mapClearancePx: 12,
    /** STARTER: maximum pointer displacement in CSS pixels for selecting a post, > 0.
     * Longer drags belong to map navigation and must not select a destination. */
    postTapSlopPx: 10,
  },

  poster: {
    /** AGREED: automatically introduce the newspaper after the second hunt's
     * capture in each country. Zero-based index, in [0, setups.poolSize). */
    introductionHuntIndex: 1,
    /** STARTER: version of the clipping artwork/layout, attached to its funnel. */
    designVersion: 4,
    /** STARTER: exported newspaper dimensions, in pixels, at a 4:5 aspect ratio. */
    widthPx: 1200, heightPx: 1500,
    /** STARTER: player-name length in Unicode characters; keeps headlines legible. */
    maxNameLength: 32,
    /** STARTER: largest accepted photo upload, in MiB. Original files stay local. */
    maxPhotoMiB: 15,
    /** STARTER: final circular head crop's side in pixels. Never store the original. */
    storedPhotoSizePx: 512,
    /** STARTER: crop preview size in pixels, zoom range, and arrow-key pan distance. */
    cropSizePx: 240, maxPhotoZoom: 3, keyboardPanPx: 10,
    /** STARTER: maximum per-channel difference (0–255) from corner ivory for
     * edge-connected newspaper portrait masking. Does not alter map artwork. */
    portraitMatteTolerance: 24,
    /** STARTER: decoded scene raster width, in pixels, > 0. Covers the 715px
     * print panel while bounding the cached RGBA buffer to about 1.5 MiB. */
    sceneRasterWidthPx: 768,
    /** STARTER: default officer's neck mask, fractions of portrait dimensions
     * in [0,1]. Keep the full face above shoulderY, only neck below it, and
     * discard the portrait's shirt so the scene supplies the uniform. */
    officerNeck: { shoulderY: .70, left: .34, right: .66, bottom: .86 },
    /** STARTER: vertical scene alignment in the photo crop, in [0,1].
     * 0 = top, 1 = bottom; top alignment leaves room for enlarged heads. */
    sceneVerticalAlign: 0,
    /** AGREED: India has its own illustration and default officer; USA and
     * Hungary share the existing art. Asset paths are relative to the base URL.
     * STARTER: each head slot uses centre x and bottom-of-neck y; width/height
     * bound the visible portrait. Fractions of scene width/height in [0,1].
     * playerPhoto retains the circular crop's previous printed scale/neck join. */
    artwork: {
      shared: {
        id: "shared_v3",
        scenePath: "newspaper/arrest-scene-v3.webp",
        officerPath: "newspaper/officer-portrait.webp",
        sceneHeads: {
          player: { x: .3236, y: .335, width: .153, height: .322 },
          playerPhoto: { x: .3236, y: .302, width: .1863, height: .2795 },
          fugitive: { x: .654, y: .340, width: .153, height: .322 },
        },
      },
      india: {
        id: "india_v1",
        scenePath: "newspaper/arrest-scene-india-v1.webp",
        officerPath: "newspaper/officer-portrait-india-v1.webp",
        sceneHeads: {
          player: { x: .3236, y: .335, width: .153, height: .322 },
          playerPhoto: { x: .3236, y: .302, width: .1863, height: .2795 },
          fugitive: { x: .654, y: .340, width: .153, height: .322 },
        },
      },
    },
  },

  telemetry: {
    /** AGREED: internal release uses Analytics without a consent-screen flow. */
    enabled: true,
    /** STARTER: do not send local playtests to production; ?telemetry_debug=1 opts in. */
    enableInDevelopment: false,
    /** STARTER: fraction of browser sessions with custom PostHog timing events, in [0,1].
     * Automatic network instrumentation is disabled; there are no frame traces. */
    performanceSampleRate: 0.1,
    /** STARTER: defer SDK loading until idle, with this millisecond fallback. */
    idleTimeoutMs: 3000,
    /** STARTER: max milliseconds to await the recorder before delivering queued
     * analytics. Only analytics waits; gameplay never waits for this timer. */
    replayReadyTimeoutMs: 8000,
    /** STARTER: recorder readiness poll interval in milliseconds, positive. */
    replayReadyPollMs: 100,
    /** STARTER: bounded early-event queue and local debug history. */
    maxQueuedEvents: 200,
  },

  campaign: {
    /** AGREED: unsupported or unavailable device timezones start in USA. */
    fallbackCountry: "usa",
    /** AGREED: prefer the supported home country using the device timezone,
     * without IP lookup or a location prompt. Include the older India alias. */
    timezoneCountries: {
      "Asia/Kolkata": "india",
      "Asia/Calcutta": "india",
      "Europe/Budapest": "hungary",
    },
  },

  /**
   * Authored default level sequence. Keep remaining countries in this relative
   * order after moving the player's opening country first; do not sort it
   * automatically by country name, size, or coastline.
   *
   * USA precedes India, then Hungary. Prepared challenges prove their required solution
   * depth and satisfy separate escape-pressure bands. Move count, squad travel,
   * initial trap coverage and pressure rank hunts within each country.
   *
   * countryCodes uses ISO 3166-1 alpha-2 codes. Each entry currently contains
   * one non-island country. The array leaves room for future combined zones
   * made from adjoining countries; it does not implement that feature.
   * For a combined zone, escape would apply to the outer boundary of the union,
   * while shared national boundaries would be internal to the patrol zone.
   */
  levels: [
    {
      /** AGREED: USA is the fallback opening country; detached Alaska and islands are excluded. */
      id: "usa",
      name: "USA",
      countryCodes: ["US"],
      /** Natural Earth administrative country code used by the map compiler. */
      admin0Code: "USA",
      /** AGREED: Great Lakes and other large inland waters are impassable. */
      excludeInlandWater: true,
      /** STARTER: allowed squads per hunt, in preparation preference order.
       * Existing verified allocations remain valid; each hunt owns its count. */
      squadCounts: [4],
      /** STARTER: runner travel floor / escape-route distance, in [0,1].
       * Spawn clearance and per-hunt move proofs determine eligibility too. */
      escapePressureRange: { min: 0, max: 0.3 },
      /** STARTER: one hunt per spawn state; at least four internal borders at
       * the start and four guarded borders in the final enclosure. Avoid easy
       * three-border coastal traps. Optional state changes can be tested later.
       * These constrain curation, not movement. */
      setupCuration: { maxPerSpawnRegion: 1, minimumSpawnInternalBorders: 4, minimumEnclosureBorders: 4, requireRunnerRegionChange: false },
      minimumInternalBorders: 50,
      /** STARTER: camera radius and spawn clearance distances, in kilometres. */
      initialViewRadiusKm: 400,
      minimumRunnerZoneEdgeKm: 30,
      minimumRunnerExitKm: 100,
      minimumRunnerInternalBorderKm: 15,
      /** AGREED starter budget, in moves. */
      maxOrders: 8,
    },
    {
      /** Stable level identifier; keep it unchanged when reordering levels. */
      id: "india",
      /** Display name for this level's patrol zone. */
      name: "India",
      countryCodes: ["IN"],
      admin0Code: "IND",
      /** AGREED: hunts in the same country may have different squad counts.
       * STARTER: prefer four for new traps; retain verified three-squad hunts.
       * Positive integers in preparation preference order. */
      squadCounts: [4, 3],
      /** STARTER: runner travel floor / escape-route distance, in [0,1].
       * Spawn clearance and per-hunt move proofs determine eligibility too. */
      escapePressureRange: { min: 0, max: 0.4 },
      /** STARTER: guard against accidentally reverting to a sparse internal network. */
      minimumInternalBorders: 30,
      /** STARTER: starting camera radius around the runner, in kilometres. */
      initialViewRadiusKm: 350,
      /** STARTER: minimum spawn distance from any coastline or outer land edge, in kilometres. */
      minimumRunnerZoneEdgeKm: 25,
      /** STARTER: minimum spawn distance from an outer land exit, in kilometres. */
      minimumRunnerExitKm: 75,
      /** STARTER: minimum spawn distance from internal borders, in kilometres. */
      minimumRunnerInternalBorderKm: 15,
      /** AGREED starter budget: positive integer; winning on order 8 scores 0. */
      maxOrders: 8,
    },
    {
      /** Stable level identifier; keep it unchanged when reordering levels. */
      id: "hungary",
      /** Display name for this level's patrol zone. */
      name: "Hungary",
      countryCodes: ["HU"],
      admin0Code: "HUN",
      /** STARTER: allowed squads per hunt, in preparation preference order. */
      squadCounts: [4],
      /** STARTER: runner travel floor / escape-route distance, in [0,1].
       * Spawn clearance and per-hunt move proofs determine eligibility too. */
      escapePressureRange: { min: 0, max: 0.5 },
      /** STARTER: guard against accidentally reverting to a sparse internal network. */
      minimumInternalBorders: 25,
      /** STARTER: starting camera radius around the runner, in kilometres. */
      initialViewRadiusKm: 100,
      /** STARTER: minimum spawn distance from the zone edge, in kilometres. */
      minimumRunnerZoneEdgeKm: 30,
      /** STARTER: minimum spawn distance from an outer land exit, in kilometres. */
      minimumRunnerExitKm: 30,
      /** STARTER: minimum spawn distance from internal borders, in kilometres. */
      minimumRunnerInternalBorderKm: 6,
      /** STARTER: positive integer; tune independently for this level. */
      maxOrders: 8,
    },
  ],
} as const;
