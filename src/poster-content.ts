import type { CaptureReport } from "./game/capture-report";
import { PLAYTEST_CONFIG as CONFIG } from "./game/playtest.config";
import { locationPhrase } from "./game/presentation";

export const GAME_URL = `${CONFIG.hosting.productionOrigin}${CONFIG.hosting.basePath}`.replace(/\/$/, "");
export function playerName(value: string) { return [...value.replace(/\s+/g, " ").trim()].slice(0, CONFIG.poster.maxNameLength).join("") || "Captain You"; }

export function newspaperCopy(report: CaptureReport, inputName: string) {
  const name = playerName(inputName);
  return {
    headline: `${report.file.shortName} captured`,
    byline: `${name} closes the net ${locationPhrase(report.region)}`,
    deck: `${name} leads a ${report.squads}-squad operation ${locationPhrase(report.region)}; the chase ends in ${report.moves} moves`,
    lead: `${report.region.toUpperCase()}, ${report.country.toUpperCase()} — ${name} led a ${report.squads}-squad patrol that surrounded ${report.file.shortName} ${locationPhrase(report.region)}. The fugitive had nowhere left to run after ${report.moves} moves.`,
    follow: `The operation earned ${report.score} points, with ${report.score} moves left to spare. Sources close to the squad credit careful planning, excellent map reading, and a suspiciously well-timed click.`,
    cordon: `The final cordon cut off every route to the country's land border. With squads holding the surrounding posts, the fugitive could go no further.`,
    closing: `The capture adds another closed file to the command desk. The next pursuit will demand a fresh look at the map—and another carefully placed squad.`,
    archive: `${report.file.intro} ${report.file.ending}`,
    caption: `${report.file.shortName} is taken into custody ${locationPhrase(report.region)} in this imagined Patrol pursuit.`,
    share: `Front-page news: I caught ${report.file.shortName} in ${report.moves} moves with ${report.squads} squads on Patrol. 🗞️ Your turn—who can you catch? ${GAME_URL}`,
  };
}
