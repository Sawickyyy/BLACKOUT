import { describe, expect, it } from "vitest";
import { GameEngine } from "@/engine/game";
import { newSaveGame } from "@/engine/world/seed";
import { scorePassphrase, securityExplainer } from "@/engine/wifi";

function engine(): GameEngine {
  const g = new GameEngine(newSaveGame("wifi"));
  g.run("cat README.txt");
  g.run("whoami");
  g.run("help");
  g.run("touch pierwszy.txt");
  g.run("nslookup aurora.example");
  g.run("ping -c1 www.aurora.example");
  g.run("nmap -sV www.aurora.example");
  return g;
}

describe("passphrase strength meter (defensive)", () => {
  it("rates a surname+year passphrase as weak", () => {
    const s = scorePassphrase("Kowalski2015", ["Kowalski", "2015"]);
    expect(s.score).toBeLessThanOrEqual(1);
  });
  it("rates a long multi-word passphrase as strong", () => {
    const s = scorePassphrase("korale-wiatrak-77-lustro-ogien");
    expect(s.score).toBe(4);
  });
  it("flags common passwords", () => {
    expect(scorePassphrase("haslo123").score).toBeLessThanOrEqual(1);
  });
  it("explains WPA2 vs WPA3 limits", () => {
    expect(securityExplainer("wpa2").limits).toMatch(/offline|zgadywanie/i);
    expect(securityExplainer("wpa3").limits).toMatch(/niewykonalny|offline/i);
  });
});

describe("Wi-Fi reachability gating", () => {
  it("home-LAN devices are unreachable until the network is joined", () => {
    const g = engine();
    // Not connected: router does not resolve.
    const before = g.run("nmap 192.168.1.1");
    expect(before.stdout + before.stderr).toMatch(/nie|unreach|route|resolve|0 host|down/i);
    expect(g.player.accessByHost["home-router"] ?? []).toHaveLength(0);
  });
});

describe("mission m23 (authorized Wi-Fi assessment)", () => {
  it("completes through scan, analysis, deduction, join, device login and report", () => {
    const g = engine();
    expect(g.player.missions["m23"]?.status).toBe("available");

    g.run("curl http://dom.kowalski.example/zlecenie.txt");
    g.run("wifi mon on");
    g.run("wifi scan");
    g.run("wifi analyze Kowalski_2.4");
    // WPA3 network refuses offline guessing.
    const w3 = g.run("wifi connect Kowalski_5G Kowalski2015");
    expect(w3.stderr).toMatch(/WPA3|offline/i);
    expect(g.player.wifiConnected).toBeUndefined();

    // Deduced weak passphrase joins the WPA2 network.
    g.run("wifi connect Kowalski_2.4 Kowalski2015");
    expect(g.player.wifiConnected).toBe("Kowalski_2.4");

    // Now the router is reachable; separate admin login is still required.
    g.run("ssh admin@192.168.1.1 --password admin");
    expect(g.player.accessByHost["home-router"]).toContain("admin");

    g.run("exit");
    const r = g.run("echo 'Slabe haslo WPA2 Kowalski_2.4: Kowalski2015. Zalecenie: WPA3 + dluga fraza.' > /home/operator/wifi_audyt.txt");
    const done = r.completedMissions.includes("m23") || g.player.missions["m23"]?.status === "completed";
    expect(done).toBe(true);
  });
});
