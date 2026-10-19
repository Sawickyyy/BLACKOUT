import type { Metadata, Viewport } from "next";
// Self-hosted fonts: work offline (PWA), no third-party request, and keep
// visual-regression screenshots deterministic.
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "BLACKNET OS",
  description:
    "BLACKNET to realistyczny symulator hakera w fikcyjnym, odizolowanym internecie. Prawdziwy terminal, misje cyberbezpieczeństwa, trwały postęp.",
  manifest: "/manifest.webmanifest",
  applicationName: "BLACKNET OS",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BLACKNET",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

// iOS standalone launch images (apple-touch-startup-image). Each matches a
// device's physical resolution; iOS picks the one whose media query fits.
const APPLE_SPLASH: { href: string; w: number; h: number; ratio: number }[] = [
  { href: "/icons/apple-splash-1125-2436.png", w: 375, h: 812, ratio: 3 },
  { href: "/icons/apple-splash-1170-2532.png", w: 390, h: 844, ratio: 3 },
  { href: "/icons/apple-splash-1179-2556.png", w: 393, h: 852, ratio: 3 },
  { href: "/icons/apple-splash-1290-2796.png", w: 430, h: 932, ratio: 3 },
];

export const viewport: Viewport = {
  themeColor: "#070B10",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Android/Chrome resize the layout for the keyboard; iOS Safari ignores
  // this, so the OS shell also tracks visualViewport (see useViewport).
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" data-theme="green" data-contrast="normal" data-motion="full" data-scale="100">
      <head>
        {APPLE_SPLASH.map((s) => (
          <link
            key={s.href}
            rel="apple-touch-startup-image"
            href={s.href}
            media={`(device-width: ${s.w}px) and (device-height: ${s.h}px) and (-webkit-device-pixel-ratio: ${s.ratio}) and (orientation: portrait)`}
          />
        ))}
      </head>
      <body>{children}</body>
    </html>
  );
}
