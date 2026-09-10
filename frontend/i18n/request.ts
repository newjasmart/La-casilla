import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import type { AbstractIntlMessages } from "next-intl";
import ca from "../messages/ca.json";
import en from "../messages/en.json";
import es from "../messages/es.json";
import fr from "../messages/fr.json";
import nl from "../messages/nl.json";
import { routing } from "./routing";

// Statically imported (not a dynamic `import(`../messages/${locale}.json`)`)
// so Turbopack bundles every locale's messages up front instead of lazily
// compiling a fresh module graph on the first request that happens to hit
// each one — that lazy path was intermittently racing with something else
// on the very first request after `next dev` starts ("Unexpected end of
// JSON input"), regardless of which locale that first request used.
const MESSAGES: Record<(typeof routing.locales)[number], AbstractIntlMessages> = {
  ca, es, en, nl, fr,
};

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: MESSAGES[locale],
  };
});
