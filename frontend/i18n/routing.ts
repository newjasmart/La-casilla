import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["ca", "es", "en", "nl", "fr"],
  defaultLocale: "ca",
  // Catalan (the default) keeps clean URLs ("/", "/#reserva"…); the other
  // four languages get a prefix ("/es", "/en", "/nl", "/fr").
  localePrefix: "as-needed",
});

export type AppLocale = (typeof routing.locales)[number];
