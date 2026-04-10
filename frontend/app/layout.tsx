import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CampusConnect – UniCart",
  description: "Class enrollment cart for CSUN students",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
