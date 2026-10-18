import { describe, expect, it } from "vitest";
import { GameEngine } from "@/engine/game";
import { newSaveGame } from "@/engine/world/seed";
import { buyItem, bankDeposit, bankWithdraw } from "@/engine/economy";

function engine(): GameEngine {
  return new GameEngine(newSaveGame("tester"));
}

function status(g: GameEngine, id: string) {
  return g.player.missions[id]?.status;
}

describe("mission m01 (tutorial)", () => {
  it("completes through real actions and pays out", () => {
    const g = engine();
    const credits0 = g.player.credits;
    g.run("cat README.txt");
    g.run("whoami");
    g.run("help");
    const r = g.run("touch pierwszy.txt");
    expect(r.completedMissions).toContain("m01");
    expect(status(g, "m01")).toBe("completed");
    expect(g.player.credits).toBe(credits0 + 100);
    // m02 unlocked
    expect(status(g, "m02")).toBe("available");
  });
});

describe("mission chain m02 → m06", () => {
  it("recon, discovery, access and privilege escalation", () => {
    const g = engine();
    // m01
    g.run("cat README.txt");
    g.run("whoami");
    g.run("help");
    g.run("touch pierwszy.txt");

    // m02 recon
    g.run("nslookup aurora.example");
    g.run("ping -c1 www.aurora.example");
    g.run("nmap -sV www.aurora.example");
    expect(status(g, "m02")).toBe("completed");

    // m03 hidden paths
    g.run("curl http://www.aurora.example/robots.txt");
    g.run("curl http://www.aurora.example/backup/deploy.yml");
    expect(status(g, "m03")).toBe("completed");

    // m05 first access (needs m03)
    g.run("ssh deploy@www.aurora.example --password 'Aur0ra$Deploy!'");
    expect(status(g, "m05")).toBe("completed");
    expect(g.player.accessByHost["aurora-web"]).toContain("deploy");

    // m06 privesc + flag
    g.run("sudo -s");
    g.run("cat /root/flag.txt");
    expect(status(g, "m06")).toBe("completed");
  });
});

describe("mission m09 (crypto) decode path", () => {
  it("fetch, decode base64, discover the board", () => {
    const g = engine();
    // unlock m02 prerequisite chain quickly
    g.run("cat README.txt");
    g.run("whoami");
    g.run("help");
    g.run("touch pierwszy.txt");
    // m09 needs m02
    g.run("nslookup aurora.example");
    g.run("ping -c1 www.aurora.example");
    g.run("nmap www.aurora.example");
    expect(status(g, "m09")).toBe("available");

    const leak = g.run("curl http://www.newswire.example/leak");
    expect(leak.stdout).toMatch(/UHJ6/); // base64 payload present
    // decode it the way a player would
    const decoded = g.run("curl -s http://www.newswire.example/leak | tail -n 1 | base64 -d");
    expect(decoded.stdout).toContain("board.hollow");
    // visit the board → discovery completes objective
    g.run("curl http://board.hollow/");
    expect(status(g, "m09")).toBe("completed");
  });
});

describe("economy", () => {
  it("bank deposit/withdraw keeps conservation", () => {
    const g = engine();
    const total = g.player.credits + g.player.bankBalance;
    bankDeposit(g.player, 200);
    expect(g.player.bankBalance).toBe(200);
    bankWithdraw(g.player, 50);
    expect(g.player.credits + g.player.bankBalance).toBe(total);
  });

  it("rejects overdraft", () => {
    const g = engine();
    const res = bankDeposit(g.player, g.player.credits + 1);
    expect(res.ok).toBe(false);
  });

  it("buying unlocks a capability and deducts credits", () => {
    const g = engine();
    g.player.credits = 2000;
    const res = buyItem(g.player, "hydra");
    expect(res.ok).toBe(true);
    expect(g.player.capabilities).toContain("hydra");
    expect(g.player.credits).toBe(800);
    // cannot buy twice
    expect(buyItem(g.player, "hydra").ok).toBe(false);
  });

  it("store purchase is reflected in terminal buy command", () => {
    const g = engine();
    g.player.credits = 1000;
    const r = g.run("buy vpn");
    expect(r.stdout).toContain("Kupiono");
    expect(g.player.capabilities).toContain("vpn");
  });
});

describe("persistence round-trip", () => {
  it("serializes and restores a mid-game state", () => {
    const g = engine();
    g.run("cat README.txt");
    g.run("whoami");
    g.run("help");
    g.run("touch pierwszy.txt");
    g.run("ssh root@does-not-exist"); // no-op failure
    g.run("mkdir -p /home/operator/proj && echo save-state > /home/operator/proj/state.txt");

    const json = JSON.parse(JSON.stringify(g.toSave()));
    const g2 = new GameEngine(json);

    // mission progress preserved
    expect(g2.player.missions["m01"]?.status).toBe("completed");
    // filesystem preserved
    expect(g2.run("cat /home/operator/proj/state.txt").stdout).toBe("save-state\n");
    // credits preserved
    expect(g2.player.credits).toBe(g.player.credits);
  });
});

describe("detection", () => {
  it("scanning the bank raises suspicion; own box does not", () => {
    const g = engine();
    g.run("ls"); // local, quiet
    const before = g.player.suspicion.heat;
    g.run("nmap -p 1-200 www.meridian-bank.example");
    expect(g.player.suspicion.heat).toBeGreaterThanOrEqual(before);
    expect(g.player.suspicion.byHost["bank-web"] ?? 0).toBeGreaterThan(0);
  });
});
