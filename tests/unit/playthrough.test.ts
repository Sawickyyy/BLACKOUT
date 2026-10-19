import { describe, expect, it } from "vitest";
import { GameEngine } from "@/engine/game";
import { newSaveGame } from "@/engine/world/seed";

// A full, scripted playthrough that completes every one of the 20 missions
// using only real terminal commands. If the seeded world and the mission
// checks are consistent, all 20 end up "completed". This is the end-to-end
// proof that the game is winnable.
describe("full playthrough", () => {
  it("completes all 20 missions", () => {
    const g = new GameEngine(newSaveGame("playthrough"));
    const run = (line: string) => g.run(line);

    // M01 — tutorial
    run("cat README.txt");
    run("whoami");
    run("help");
    run("touch pierwszy.txt");

    // M02 — recon aurora
    run("nslookup aurora.example");
    run("ping -c1 www.aurora.example");
    run("nmap -sV www.aurora.example");

    // M03 — hidden paths
    run("curl http://www.aurora.example/robots.txt");
    run("curl http://www.aurora.example/backup/deploy.yml");

    // M04 — gitlab leak
    run("curl http://git.aurora.example/web-deploy/raw/config/secrets.yml");

    // M05 — first SSH access
    run("ssh deploy@www.aurora.example --password 'Aur0ra$Deploy!'");

    // M06 — privilege escalation + flag
    run("sudo -s");
    run("cat /root/flag.txt");

    // M10 — forensics (still root on aurora)
    run("cat /etc/shadow");
    run("echo deploy > /root/forensics.txt");

    // M18 — identity audit (still root on aurora)
    run("cat /etc/passwd");
    run("grep www-data /etc/passwd > /root/audyt.txt");
    run("exit"); // back to deploy
    run("exit"); // back to operator@local

    // M07 — university weak password
    run("curl http://www.northgate.edu.example/status");
    run("ssh student@lab01.northgate.edu.example --password student");
    // M08 — log analysis (limited sudo on the lab box)
    run("sudo cat /var/log/auth.log");
    run("echo 192.0.2.200 > raport.txt");
    run("exit");

    // M09 — crypto leak + discover the board
    run("curl http://www.newswire.example/leak");
    run("curl http://board.hollow/");

    // M16 — infiltrate The Hollow
    run("curl http://board.hollow/t/nullsec");
    run("ssh ghost@board.hollow --password spookyhash");
    run("cat kontakty.txt");
    run("exit");

    // M11 — bank recon
    run("nmap www.meridian-bank.example");
    run("curl https://www.meridian-bank.example/.well-known/security.txt");
    run("curl https://www.meridian-bank.example/api/status");

    // M12 — responsible disclosure
    run("curl http://staging.meridian-bank.example:8080/debug");
    run("ssh qa@staging.meridian-bank.example --password qa-test-2024");
    run("cat /home/qa/bounty.txt");
    run("exit");
    run("echo 'BLACKNET{responsible_disclosure_meridian}' > zgloszenie.txt");

    // M13 — incident response (hosting)
    run("curl http://panel.heliohost.example/config.php.bak");
    run("ssh admin@shared1.heliohost.example --password panel-admin");
    run("cat /tmp/.nullsec/beacon.sh");
    run("sudo rm -rf /tmp/.nullsec");
    // M14 — hardening
    run("sudo rm /etc/cron.d/sysupdate");
    // M19 — correlation: read the log here, conclude locally
    run("sudo cat /var/log/auth.log");
    run("exit");
    run("echo 192.0.2.200 > korelacja.txt");

    // M17 — attribution
    run("nmap node.nullsec");
    run("curl http://node.nullsec/targets.txt");
    run("echo 192.0.2.200 > atrybucja.txt");

    // M15 — civic FOIA
    run("curl http://portal.civicdata.example/records?id=1");
    run("curl http://portal.civicdata.example/records?id=42");
    run("echo 'BLACKNET{foia_record_42_released}' > foia.txt");

    // M20 — finale
    run("echo 'BLACKNET operacja zamknieta, wezel 192.0.2.200' > raport_koncowy.txt");

    // M21 — CCTV: take over the Vertex NVR and watch the feeds.
    run("nmap -sV nvr.vertex-sec.example");
    run("curl http://nvr.vertex-sec.example:8080/device.json");
    run("ssh cctv@nvr.vertex-sec.example --password cctv1234");
    run("exit");
    g.viewCamera("vertex-nvr", "cam1");
    run("echo 'WX 8831K' > vertex_tablica.txt");

    // M22 — follow-up: read the lobby timeline + the server-room code.
    g.viewCamera("vertex-nvr", "cam2");
    run("echo 02:11 > vertex_czas.txt");
    run("echo VX-7731 > vertex_kod.txt");

    const ids = Array.from({ length: 22 }, (_, i) => `m${String(i + 1).padStart(2, "0")}`);
    const incomplete = ids.filter((id) => g.player.missions[id]?.status !== "completed");
    expect(incomplete).toEqual([]);
  });
});
