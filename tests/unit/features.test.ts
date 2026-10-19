import { describe, expect, it } from "vitest";
import { GameEngine } from "@/engine/game";
import { migrateSave } from "@/engine/world/migrate";
import { newSaveGame } from "@/engine/world/seed";
import type { SaveGame } from "@/engine/types";

function fresh(name = "tester"): GameEngine {
  return new GameEngine(newSaveGame(name));
}

/** Fast-forward through m01 + m02 so m21 (prereq m02) is available. */
function reachM02(g: GameEngine) {
  g.run("cat README.txt");
  g.run("whoami");
  g.run("help");
  g.run("touch pierwszy.txt");
  g.run("nslookup aurora.example");
  g.run("ping -c1 www.aurora.example");
  g.run("nmap -sV www.aurora.example");
}

describe("save migration v1 → v2", () => {
  it("grafts new hosts/dns/orgs and player fields into an old save, preserving progress", () => {
    // Build a realistic "old" save: strip everything added in v2.
    const save = newSaveGame("veteran") as SaveGame;
    delete save.world.hosts["vertex-nvr"];
    save.world.dns = save.world.dns.filter((r) => !r.name.includes("vertex"));
    delete save.world.organizations["vertex"];
    delete save.player.hintsUsed;
    delete save.player.cctvViewed;
    delete save.player.tutorialSeen;
    save.version = 1;
    // Some pre-existing progress that must survive untouched.
    save.player.credits = 1234;
    save.player.discovered.push("aurora-web");

    const migrated = migrateSave(save);

    expect(migrated.version).toBe(2);
    expect(migrated.world.hosts["vertex-nvr"]).toBeDefined();
    expect(migrated.world.organizations["vertex"]).toBeDefined();
    expect(migrated.world.dns.some((r) => r.name === "nvr.vertex-sec.example")).toBe(true);
    expect(migrated.player.hintsUsed).toEqual({});
    expect(migrated.player.cctvViewed).toEqual([]);
    // Veteran (discovered > 2) should not get the first-run tutorial nag.
    expect(migrated.player.tutorialSeen).toBe(true);
    // Progress preserved.
    expect(migrated.player.credits).toBe(1234);
  });

  it("is idempotent and runs transparently inside the GameEngine", () => {
    const save = newSaveGame("x");
    save.version = 1;
    const g = new GameEngine(save);
    expect(g.save.version).toBe(2);
    // Running migrate again changes nothing structural.
    const before = Object.keys(g.world.hosts).length;
    migrateSave(g.save);
    expect(Object.keys(g.world.hosts).length).toBe(before);
  });
});

describe("camera missions (CCTV)", () => {
  it("M21 completes through discovery, access, watching the feed and reading the plate", () => {
    const g = fresh();
    reachM02(g);
    expect(g.player.missions["m21"]?.status).toBe("available");

    g.run("nmap -sV nvr.vertex-sec.example");
    expect(g.player.discovered).toContain("vertex-nvr");

    g.run("curl http://nvr.vertex-sec.example:8080/device.json");
    g.run("ssh cctv@nvr.vertex-sec.example --password cctv1234");
    expect(g.player.accessByHost["vertex-nvr"]).toContain("cctv");

    // Opening the feed is recorded; the plate is only knowable from the view.
    expect(g.viewCamera("vertex-nvr", "cam1")).toBe(true);

    // Back on the local rig, write the plate the player read off the screen.
    g.run("ssh cctv@nvr.vertex-sec.example --password cctv1234"); // ensure we can exit back
    g.run("exit");
    const r = g.run("echo 'WX 8831K' > /home/operator/vertex_tablica.txt");
    // Mission may complete on this run or the following state-eval.
    const done = r.completedMissions.includes("m21") || g.player.missions["m21"]?.status === "completed";
    expect(done).toBe(true);
  });

  it("cctvSystems only lists NVRs the player has access to", () => {
    const g = fresh();
    expect(g.cctvSystems()).toHaveLength(0);
    reachM02(g);
    g.run("nmap nvr.vertex-sec.example");
    g.run("ssh cctv@nvr.vertex-sec.example --password cctv1234");
    const systems = g.cctvSystems();
    expect(systems).toHaveLength(1);
    expect(systems[0]!.system!.feeds.length).toBeGreaterThan(0);
  });
});

describe("paid hints", () => {
  it("reveals the ladder and charges escalating credits", () => {
    const g = fresh();
    const c0 = g.player.credits;
    const h1 = g.revealHint(); // targets available m01
    expect(h1.ok).toBe(true);
    if (h1.ok) {
      expect(h1.cost).toBe(25);
      expect((h1.text ?? "").length).toBeGreaterThan(0);
    }
    expect(g.player.credits).toBe(c0 - 25);

    const h2 = g.revealHint("m01");
    expect(h2.ok).toBe(true);
    if (h2.ok) expect(h2.cost).toBe(50);
    expect(g.player.credits).toBe(c0 - 25 - 50);
  });

  it("refuses when the player cannot afford the hint", () => {
    const g = fresh();
    g.player.credits = 0;
    const r = g.revealHint("m01");
    expect(r.ok).toBe(false);
  });
});
