import { beforeEach, describe, expect, it } from "vitest";
import { GameEngine } from "@/engine/game";
import { newSaveGame } from "@/engine/world/seed";

function engine(): GameEngine {
  return new GameEngine(newSaveGame("tester"));
}

describe("shell basics", () => {
  let g: GameEngine;
  beforeEach(() => (g = engine()));

  it("echo and exit codes", () => {
    const r = g.run("echo hello world");
    expect(r.stdout).toBe("hello world\n");
    expect(r.code).toBe(0);
  });

  it("pipes stdout to stdin", () => {
    g.run("echo -e done"); // ensure no crash on unknown -e handling
    const r = g.run("echo foo | grep foo");
    expect(r.stdout).toContain("foo");
    const r2 = g.run("printf x | grep nope");
    void r2;
  });

  it("redirects to a file and reads it back", () => {
    g.run("echo persisted > /home/operator/out.txt");
    const r = g.run("cat /home/operator/out.txt");
    expect(r.stdout).toBe("persisted\n");
  });

  it("appends with >>", () => {
    g.run("echo a > /home/operator/log.txt");
    g.run("echo b >> /home/operator/log.txt");
    const r = g.run("cat /home/operator/log.txt");
    expect(r.stdout).toBe("a\nb\n");
  });

  it("&& short-circuits on failure", () => {
    const r = g.run("false 2>/dev/null; cat /nonexistent && echo SHOULD_NOT");
    expect(r.stdout).not.toContain("SHOULD_NOT");
  });

  it("|| runs on failure", () => {
    const r = g.run("cat /nonexistent 2>/dev/null || echo recovered");
    expect(r.stdout).toContain("recovered");
  });

  it("cd changes directory and pwd reflects it", () => {
    g.run("cd /tmp");
    expect(g.run("pwd").stdout).toBe("/tmp\n");
  });

  it("environment variable assignment and expansion", () => {
    g.run("export GREETING=czesc");
    expect(g.run("echo $GREETING").stdout).toBe("czesc\n");
  });

  it("word count through a pipe", () => {
    const r = g.run("printf 'a\\nb\\nc' | wc -l");
    expect(r.stdout.trim()).toBe("3");
  });

  it("unknown command returns 127", () => {
    const r = g.run("definitelynotacommand");
    expect(r.code).toBe(127);
    expect(r.stderr).toContain("nieznalezione");
  });
});

describe("filesystem commands", () => {
  let g: GameEngine;
  beforeEach(() => (g = engine()));

  it("ls -l shows permissions", () => {
    const r = g.run("ls -l /home/operator");
    expect(r.stdout).toMatch(/README\.txt/);
    expect(r.stdout).toMatch(/-rw/);
  });

  it("grep -n returns line numbers", () => {
    g.run("printf 'alpha\\nbeta\\ngamma' > /home/operator/g.txt");
    const r = g.run("grep -n beta /home/operator/g.txt");
    expect(r.stdout.trim()).toBe("2:beta");
  });

  it("chmod then stat reflects mode", () => {
    g.run("touch /home/operator/m.txt");
    g.run("chmod 640 /home/operator/m.txt");
    const r = g.run("stat /home/operator/m.txt");
    expect(r.stdout).toContain("0640");
  });

  it("tar round-trips files", () => {
    g.run("mkdir -p /home/operator/box");
    g.run("echo contents > /home/operator/box/a.txt");
    g.run("cd /home/operator && tar -cf box.tar box");
    g.run("rm -rf /home/operator/box");
    g.run("cd /home/operator && tar -xf box.tar");
    expect(g.run("cat /home/operator/box/a.txt").stdout).toBe("contents\n");
  });

  it("base64 pipe decodes", () => {
    const r = g.run("echo aGVsbG8= | base64 -d");
    expect(r.stdout).toBe("hello");
  });
});

describe("networking", () => {
  let g: GameEngine;
  beforeEach(() => (g = engine()));

  it("nslookup resolves a seeded name", () => {
    const r = g.run("nslookup www.aurora.example");
    expect(r.stdout).toContain("203.0.113.10");
  });

  it("ping reports reachability", () => {
    const r = g.run("ping -c 2 www.aurora.example");
    expect(r.stdout).toContain("PING");
    expect(r.stdout).toMatch(/packets transmitted/);
  });

  it("nmap finds open ports and marks host discovered", () => {
    const r = g.run("nmap -sV www.aurora.example");
    expect(r.stdout).toContain("80/tcp");
    expect(r.stdout).toMatch(/open/);
    expect(g.player.discovered).toContain("aurora-web");
  });

  it("curl fetches a seeded web page", () => {
    const r = g.run("curl http://www.aurora.example/robots.txt");
    expect(r.stdout).toContain("Disallow: /backup/");
  });

  it("firewall drops filtered ports on the bank", () => {
    const r = g.run("nmap -p 22,80,443 www.meridian-bank.example");
    // 22 and 80 are dropped (filtered); 443 is open
    expect(r.stdout).toMatch(/443\/tcp\s+open/);
    expect(r.stdout).not.toMatch(/22\/tcp open/);
  });

  it("ssh with correct password hops to the host", () => {
    const r = g.run("ssh deploy@www.aurora.example --password 'Aur0ra$Deploy!'");
    expect(r.sessionChanged).toBe(true);
    expect(g.run("whoami").stdout).toBe("deploy\n");
    expect(g.run("hostname").stdout).toBe("www.aurora.example\n");
    // exit returns home
    const e = g.run("exit");
    expect(e.sessionChanged).toBe(true);
    expect(g.run("whoami").stdout).toBe("operator\n");
  });

  it("ssh with wrong password is denied", () => {
    const r = g.run("ssh deploy@www.aurora.example --password wrong");
    expect(r.code).toBe(255);
    expect(r.stderr).toContain("Permission denied");
  });
});

describe("privilege escalation", () => {
  it("sudo -s on aurora yields root and reads the flag", () => {
    const g = engine();
    g.run("ssh deploy@www.aurora.example --password 'Aur0ra$Deploy!'");
    expect(g.run("sudo -l").stdout).toMatch(/ALL/);
    const s = g.run("sudo -s");
    expect(s.sessionChanged).toBe(true);
    expect(g.run("whoami").stdout).toBe("root\n");
    const flag = g.run("cat /root/flag.txt");
    expect(flag.stdout).toContain("BLACKNET{aurora_r00t_pivot_complete}");
  });

  it("sudo cat reads a root-only file without a full shell", () => {
    const g = engine();
    g.run("ssh deploy@www.aurora.example --password 'Aur0ra$Deploy!'");
    const r = g.run("sudo cat /root/flag.txt");
    expect(r.stdout).toContain("BLACKNET{");
  });
});
