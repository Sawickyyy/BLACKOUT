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
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

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
      <body>{children}</body>
    </html>
  );
}
