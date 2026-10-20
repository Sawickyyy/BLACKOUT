import { describe, expect, it } from "vitest";
import { advisoriesFor } from "@/engine/vulns";
import { GameEngine } from "@/engine/game";
import { newSaveGame } from "@/engine/world/seed";

describe("vulnerability advisories", () => {
  it("matches a service banner to fictional BLACKNET advisories", () => {
    const a = advisoriesFor("OpenSSH 8.4p1");
    expect(a.length).toBeGreaterThan(0);
    expect(a[0]!.id).toMatch(/^BN-/);
  });
  it("vulns lists advisories only after services are enumerated", () => {
    const g = new GameEngine(newSaveGame("v"));
    for (const l of ["cat README.txt","whoami","help","touch pierwszy.txt","nslookup aurora.example","ping -c1 www.aurora.example","nmap -sV www.aurora.example"]) g.run(l);
    const out = g.run("vulns www.aurora.example");
    expect(out.stdout).toMatch(/BN-\d/);
    expect(out.stdout).toMatch(/nginx|OpenSSH/);
  });
  it("note writes to the operator notebook", () => {
    const g = new GameEngine(newSaveGame("n"));
    g.run("note sprawdzic backup aurory");
    expect((g.player.notebook ?? []).some((e) => e.text.includes("backup") && !e.auto)).toBe(true);
  });
});

describe("realistic recon commands", () => {
  it("last reconstructs logins, crontab lists jobs, systemctl shows services", async () => {
    const { GameEngine } = await import("@/engine/game");
    const { newSaveGame } = await import("@/engine/world/seed");
    const g = new GameEngine(newSaveGame("r"));
    for (const l of ["cat README.txt","whoami","help","touch pierwszy.txt","nslookup aurora.example","ping -c1 www.aurora.example","nmap -sV www.aurora.example","curl http://www.aurora.example/robots.txt","curl http://www.aurora.example/backup/deploy.yml"]) g.run(l);
    g.run("ssh deploy@www.aurora.example --password 'Aur0ra$Deploy!'");
    g.run("sudo -s");
    expect(g.run("last").stdout).toMatch(/deploy\s+10\.13\.37\.2/);
    expect(g.run("systemctl status").stdout).toMatch(/nginx\.service|ssh\.service/);
    const hist = g.run("cat /home/deploy/.bash_history");
    expect(hist.stdout).toMatch(/history -c/);
  });
});
