import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminAuthProvider } from "@/components/admin/auth-provider";

export const metadata: Metadata = {
  title: {
    default: "Gestió",
    template: "%s | Gestió La Casilla",
  },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminAuthProvider>{children}</AdminAuthProvider>;
}
