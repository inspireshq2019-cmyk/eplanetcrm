import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const figtree = localFont({
  variable: "--font-figtree",
  display: "swap",
  src: [
    { path: "./fonts/figtree-latin-400-normal.woff2", weight: "400" },
    { path: "./fonts/figtree-latin-500-normal.woff2", weight: "500" },
    { path: "./fonts/figtree-latin-600-normal.woff2", weight: "600" },
    { path: "./fonts/figtree-latin-700-normal.woff2", weight: "700" },
  ],
});
const poppins = localFont({
  variable: "--font-poppins",
  display: "swap",
  src: [
    { path: "./fonts/poppins-latin-600-normal.woff2", weight: "600" },
    { path: "./fonts/poppins-latin-700-normal.woff2", weight: "700" },
  ],
});

export const metadata: Metadata = {
  title: { default: "Eplanet CRM", template: "%s · Eplanet CRM" },
  description: "Student, application, visa and finance management for Eplanet International.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#16245a" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${figtree.variable} ${poppins.variable}`}>
      <body>{children}</body>
    </html>
  );
}
