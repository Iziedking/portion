import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portion",
  description: "Divides every payment you receive into the budget you approved. PayPal sandbox only.",
};

export const dynamic = "force-dynamic";

// Fonts load in the browser, not at build time, so a build never depends on Google's servers.
// If they fail to load, the system fonts in globals.css take over.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
