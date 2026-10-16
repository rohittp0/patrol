import type { CaptureReport } from "./game/capture-report";
import { PLAYTEST_CONFIG as CONFIG } from "./game/playtest.config";
import { locationPhrase } from "./game/presentation";

export const GAME_URL = `${CONFIG.hosting.productionOrigin}${CONFIG.hosting.basePath}`.replace(/\/$/, "");
export function playerName(value: string) { return [...value.replace(/\s+/g, " ").trim()].slice(0, CONFIG.poster.maxNameLength).join("") || "Captain You"; }

export function newspaperCopy(report: CaptureReport, inputName: string) {
  const name = playerName(inputName);
  return {
    kicker: `${report.file.shortName}'s great escape?`,
    headline: "NOT TODAY.",
    byline: `${name} closes the net ${locationPhrase(report.region)}`,
    deck: `${name} closes the net ${locationPhrase(report.region)}. ${report.moves} moves. No way out.`,
    lead: `${report.region}, ${report.country} — ${report.file.shortName} had an escape plan. ${name} had a better one: a ${report.squads}-squad cordon, ${report.moves} moves, and absolutely nowhere left to run.`,
    follow: `The squad earned ${report.score} points. The fugitive earned a long, awkward ride back. Our map desk is calling it a very good day's clicking.`,
    quote: report.score > 0 ? "“They had a head start. I had a map.”" : "“Last move. Last exit. Perfect timing.”",
    archive: `${report.file.intro} ${report.file.ending}`,
    caption: `An imagined capture ${locationPhrase(report.region)}. Very real bragging rights.`,
    invitation: "A map. A fugitive. Your move.",
    share: `🗞️ ${report.file.shortName}'s great escape? Not today. I closed the net in ${report.moves} moves with ${report.squads} squads on Patrol. Your turn to make the front page: ${GAME_URL}`,
  };
}
