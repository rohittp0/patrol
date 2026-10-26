import { PLAYTEST_CONFIG } from "../src/game/playtest.config";
const source = await fetch(PLAYTEST_CONFIG.map.tileJsonUrl, {
  headers: { Origin: PLAYTEST_CONFIG.hosting.productionOrigin },
  signal: AbortSignal.timeout(15000),
});
const tileJSON = await source.json();
const tile = tileJSON.tiles[0]
  .replace("{z}", "5")
  .replace("{x}", "22")
  .replace("{y}", "13");
const font = PLAYTEST_CONFIG.map.glyphsUrl
  .replace("{fontstack}", "Noto%20Sans%20Regular")
  .replace("{range}", "0-255");
const checks = await Promise.all(
  [
    ["source", source],
    ...(await Promise.all(
      [
        ["tile", tile],
        ["font", font],
      ].map(async ([name, url]) => [
        name,
        await fetch(url, {
          headers: { Origin: PLAYTEST_CONFIG.hosting.productionOrigin },
          signal: AbortSignal.timeout(15000),
        }),
      ]),
    )),
  ].map(async ([name, value]) => {
    const response = value as Response;
    return {
      resource: name,
      status: response.status,
      cors: response.headers.get("access-control-allow-origin"),
    };
  }),
);
console.log(JSON.stringify(checks, null, 2));
if (
  checks.some(
    (check) =>
      check.status !== 200 ||
      !["*", PLAYTEST_CONFIG.hosting.productionOrigin].includes(
        check.cors ?? "",
      ),
  )
)
  process.exitCode = 1;
