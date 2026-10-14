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
 * - Every challenge has a verified exact minimum solution length, remains
 *   winnable within its budget, and is ordered by measured difficulty.
 *
 * Add new tuning values to this file as mechanics are agreed. Current boards
 * and winning setup sequences are generated and checked; balance still needs
 * playtesting. See docs/level-design.md for sources and geometry limitations.
 */
export const PLAYTEST_CONFIG = {
  hosting: {
    /** AGREED: production origin, without a path or trailing slash. */
    productionOrigin: "https://rohittp.com",

    /**
     * AGREED: public asset base, including both slashes.
     * The Vite build and public asset URLs must use this for /patrol/ hosting.
     */
    basePath: "/patrol/",

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
    /**
     * AGREED: remote MapLibre-compatible style owned by the project owner.
     * Load this URL directly. Its resource URLs already include the MapTiler
     * key; do not copy the key or a downloaded style into the repository.
     * Browser access must allow both production and local development origins.
     */
    styleUrl: "https://dashboard.lascadian.com/maps/default.json",

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
    },

    /** STARTER: camera edge margin in CSS pixels; HUD clearance is added automatically. */
    fitPaddingPx: 50,
    /** STARTER: minimum zoom when using Focus runner; a closer zoom is preserved. */
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
    searchDepth: 3,
    /** STARTER: cap on candidate starting positions examined per region. */
    runnerCandidatesPerRegion: 12,
    /** STARTER: deterministic seed used by the offline setup preparation script. */
    preparationSeed: 42,
    /** STARTER: avoid filling the entire pool with one runner region. */
    maxSetupsPerRegion: 3,
    /** STARTER: nearest border posts considered for initial squads, plus all enclosure borders. */
    initialBorderCandidates: 16,
    /** STARTER: bound offline search per runner region; a failed search is not an impossibility proof. */
    maxAttemptsPerRegion: 12000,
    /** STARTER: spread search effort across runner positions instead of exhausting one spawn. */
    maxAttemptsPerRunner: 1000,
    /** STARTER: adjacent administrative regions considered as one enclosure during setup search. */
    maxEnclosureRegions: 3,
  },

  progression: {
    /** STARTER: nearest legal opening orders probed for successful continuations. */
    openingProbeCount: 12,
    /** STARTER: difficulty weights; order weight must exceed both tie-break weights combined. */
    weights: { minimumOrders: 1000, openingScarcity: 100, escapePressure: 100 },
  },

  hints: {
    /** AGREED: hints consume no orders or points. Cost is fixed at zero for this prototype. */
    cost: 0,
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
    /** AGREED: show on first visit; How to play always reopens slide one. */
    showOnFirstVisit: true,
    /** STARTER: increment to show an updated briefing to returning players. */
    version: 1,
    /** STARTER: locally generated GIF size, frames per second and duration.
     * Run npm run prepare:tutorial after changing these positive values. */
    animation: { widthPx: 640, heightPx: 360, framesPerSecond: 10, durationSeconds: 6 },
  },

  deviceGate: {
    /** AGREED: phones get a non-dismissible request to play on a laptop. */
    enabled: true,
    /** STARTER: maximum viewport width in CSS pixels for the small-screen gate.
     * Narrow desktop windows also show the message until enlarged. */
    maxViewportWidthPx: 767,
    /** STARTER: maximum short screen side for coarse-pointer devices, in CSS
     * pixels. Keeps phones blocked in landscape; larger tablets are allowed. */
    maxTouchScreenShortSidePx: 767,
  },

  /**
   * Ordered level sequence. Array order is progression order; do not sort it
   * automatically by country name, size, or coastline.
   *
   * India precedes Hungary. Prepared challenges prove their required solution
   * depth and satisfy separate escape-pressure bands. Opening choices and
   * pressure order challenges within a country; playtesting refines these metrics.
   *
   * countryCodes uses ISO 3166-1 alpha-2 codes. Each entry currently contains
   * one non-island country. The array leaves room for future combined zones
   * made from adjoining countries; it does not implement that feature.
   * For a combined zone, escape would apply to the outer boundary of the union,
   * while shared national boundaries would be internal to the patrol zone.
   */
  levels: [
    {
      /** Stable level identifier; keep it unchanged when reordering levels. */
      id: "india",
      /** Display name for this level's patrol zone. */
      name: "India",
      countryCodes: ["IN"],
      /** STARTER: positive integer; per-country squad allocation. */
      squadCount: 3,
      /** STARTER: exact minimum winning orders, verified by exhausting shorter solutions. */
      solutionOrders: 2,
      /** STARTER: runner-step / open escape-route distance; low pressure for the introductory country. */
      escapePressureRange: { min: 0, max: 0.1 },
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
      /** STARTER: positive integer; tune independently of India's allocation. */
      squadCount: 4,
      /** STARTER: exact minimum winning orders; strictly harder than India's two-order puzzles. */
      solutionOrders: 3,
      /** STARTER: tighter escape pressure than India, without near-instant escape. */
      escapePressureRange: { min: 0.12, max: 0.35 },
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
