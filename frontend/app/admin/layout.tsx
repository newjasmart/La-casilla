import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminAuthProvider } from "@/components/admin/auth-provider";
import "../globals.css";

export const metadata: Metadata = {
  title: {
    default: "Gestió",
    template: "%s | Gestió La Casilla",
  },
  robots: { index: false, follow: false },
};

// A second, independent root layout (Next.js "multiple root layouts"
// pattern): /admin is an internal Catalan-only tool, not part of the
// localized public site under app/(marketing)/[locale], so it needs its own
// <html>/<body> rather than sharing the marketing route group's.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ca">
      <body>
        <AdminAuthProvider>{children}</AdminAuthProvider>
      </body>
    </html>
  );
}
