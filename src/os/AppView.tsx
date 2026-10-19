"use client";

import dynamic from "next/dynamic";
import type { AppId } from "./apps";
import { OSLoadingState } from "./ui";

const loading = () => <OSLoadingState label="Uruchamianie aplikacji…" lines={4} />;

// Everything except the terminal is code-split and loaded on first open.
const MissionsApp = dynamic(() => import("./apps/MissionsApp"), { ssr: false, loading });
const NetworkApp = dynamic(() => import("./apps/NetworkApp"), { ssr: false, loading });
const FilesApp = dynamic(() => import("./apps/FilesApp"), { ssr: false, loading });
const BrowserApp = dynamic(() => import("./apps/BrowserApp"), { ssr: false, loading });
const CctvApp = dynamic(() => import("./apps/CctvApp"), { ssr: false, loading });
const WifiApp = dynamic(() => import("./apps/WifiApp"), { ssr: false, loading });
const EditorApp = dynamic(() => import("./apps/EditorApp"), { ssr: false, loading });
const WalletApp = dynamic(() => import("./apps/WalletApp"), { ssr: false, loading });
const SettingsApp = dynamic(() => import("./apps/SettingsApp"), { ssr: false, loading });

/** Renders a non-terminal app (the terminal is mounted once by each shell). */
export default function AppView({ id, mobile }: { id: Exclude<AppId, "terminal">; mobile: boolean }) {
  switch (id) {
    case "missions":
      return <MissionsApp mobile={mobile} />;
    case "network":
      return <NetworkApp mobile={mobile} />;
    case "files":
      return <FilesApp mobile={mobile} />;
    case "browser":
      return <BrowserApp mobile={mobile} />;
    case "cctv":
      return <CctvApp mobile={mobile} />;
    case "wifi":
      return <WifiApp mobile={mobile} />;
    case "editor":
      return <EditorApp mobile={mobile} />;
    case "wallet":
      return <WalletApp mobile={mobile} />;
    case "settings":
      return <SettingsApp mobile={mobile} />;
  }
}
