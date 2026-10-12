import type { Metadata } from "next";
import { AppShell } from "@/components/weblog/app-shell";

export const metadata: Metadata = {
  title: "NN Weblog | Order Management System",
  description: "High-performance Customer Order Management & Steadfast Courier Integration",
};

export default function WeblogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
