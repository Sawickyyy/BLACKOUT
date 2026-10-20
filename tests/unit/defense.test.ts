import { describe, expect, it } from "vitest";
import { GameEngine } from "@/engine/game";
import { newSaveGame } from "@/engine/world/seed";

function reachAurora(g: GameEngine) {
  for (const l of ["cat README.txt","whoami","help","touch pierwszy.txt","nslookup aurora.example","ping -c1 www.aurora.example","nmap -sV www.aurora.example"]) g.run(l);
}

describe("active defenders", () => {
  it("locks the host down after repeated noisy scans and filters further traffic", () => {
    const g = new GameEngine(newSaveGame("d"));
    reachAurora(g);
    let locked = false;
    for (let i = 0; i < 25 && !locked; i++) {
      const r = g.run("nmap -p 1-1024 www.aurora.example");
      if (r.defenderActions.some((a) => a.includes("zablokował"))) locked = true;
    }
    expect(locked).toBe(true);
    expect(g.world.hosts["aurora-web"]!.lockdown).toBe(true);
    // While locked, the host is filtered.
    const scan = g.run("nmap www.aurora.example");
    expect(scan.stdout).toMatch(/filtered|filtrowane|0 (otwartych|open)/i);
  });

  it("stands down again once the host goes quiet", () => {
    const g = new GameEngine(newSaveGame("d2"));
    reachAurora(g);
    for (let i = 0; i < 25; i++) g.run("nmap -p 1-1024 www.aurora.example");
    expect(g.world.hosts["aurora-web"]!.lockdown).toBe(true);
    // Quiet commands cool the host; eventually the admin relaxes.
    let relaxed = false;
    for (let i = 0; i < 300 && !relaxed; i++) {
      const r = g.run("whoami");
      if (r.defenderActions.some((a) => a.includes("zdjęta"))) relaxed = true;
    }
    expect(g.world.hosts["aurora-web"]!.lockdown).toBe(false);
  });
});

describe("player footprint", () => {
  it("writes an accepted-login line into the host auth.log", () => {
    const g = new GameEngine(newSaveGame("f"));
    reachAurora(g);
    g.run("curl http://www.aurora.example/robots.txt");
    g.run("curl http://www.aurora.example/backup/deploy.yml");
    g.run("ssh deploy@www.aurora.example --password 'Aur0ra$Deploy!'");
    const log = g.run("sudo cat /var/log/auth.log");
    expect(log.stdout).toMatch(/Accepted password for deploy from 10\.13\.37\.2/);
  });
});
