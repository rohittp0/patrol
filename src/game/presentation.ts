import type { Border } from "./types";

/** Keep published geography/proof signatures stable while improving UI labels. */
export const borderName = (border: Border) => border.name.replace(/^Land frontier /, "Border crossing ");
export const locationPhrase = (region: string) => region.endsWith(" border") ? `at the ${region}` : `in ${region}`;
