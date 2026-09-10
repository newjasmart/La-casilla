import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Runs on every marketing route; explicitly skips /admin (its own,
  // non-localized tool), API-less here but reserved, Next internals and any
  // request for a static file (favicon, images, css…).
  matcher: ["/((?!api|admin|_next|_vercel|.*\\..*).*)"],
};
