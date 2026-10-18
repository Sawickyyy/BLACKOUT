import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BLACKNET — Symulator Hakera",
  description:
    "BLACKNET to realistyczny symulator hakera w fikcyjnym, odizolowanym internecie. Prawdziwy terminal, misje cyberbezpieczeństwa, trwały postęp.",
  manifest: "/manifest.webmanifest",
  applicationName: "BLACKNET",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BLACKNET",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#060907",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Resize the layout (not overlay) when the iOS keyboard appears, so the
  // terminal input stays visible above it.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" data-theme="green" className="crt">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
