import { expect, test, type Page } from "@playwright/test";

// E2E for BLACKNET OS 2.0 against a production build in local (guest) mode.
// Boot animation is disabled and prefers-reduced-motion is forced so the UI
// is deterministic for screenshots and assertions.

const VIEWPORTS = [
  { name: "iphone-se", width: 375, height: 667, mobile: true },
  { name: "iphone-15-pro", width: 393, height: 852, mobile: true },
  { name: "iphone-pro-max", width: 430, height: 932, mobile: true },
  { name: "tablet", width: 768, height: 1024, mobile: false },
  { name: "laptop", width: 1366, height: 768, mobile: false },
  { name: "desktop", width: 1920, height: 1080, mobile: false },
] as const;

async function disableBoot(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("blacknet:ui", JSON.stringify({ bootAnimation: false, ambient: false }));
    } catch {
      /* ignore */
    }
  });
}

async function startGame(page: Page, name: string) {
  await disableBoot(page);
  await page.goto("/");
  await page.getByPlaceholder("np. ghost_01").fill(name);
  await page.getByRole("button", { name: /Uruchom BLACKNET OS/ }).click();
  await expect(page.getByTestId("terminal")).toBeVisible();
}

async function typeLine(page: Page, line: string) {
  await page.locator('[data-testid="terminal"] .xterm-helper-textarea').focus();
  await page.keyboard.type(line);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(140);
}

test.describe("BLACKNET OS — gameplay", () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });

  test("login, play the tutorial, mission completes and a backup is taken", async ({ page }) => {
    await startGame(page, "e2e_player");

    // Mission Control opens by default on desktop.
    const missionCard = page.locator('[data-window="missions"]');
    await expect(missionCard.getByText("Rozruch systemu")).toBeVisible();

    for (const l of ["cat README.txt", "whoami", "help", "touch pierwszy.txt"]) await typeLine(page, l);

    // Milestone saves immediately.
    await expect(page.locator("[data-save-state='saved']").first()).toBeVisible();

    // Completing it moves the card from "Do zrobienia" to the "Ukończone" tab.
    await missionCard.getByRole("tab", { name: /Ukończone/ }).click();
    await expect(
      missionCard.locator("li").filter({ hasText: "Rozruch systemu" }).first(),
    ).toBeVisible({ timeout: 8000 });

    // A reward overlay appears on completion — dismiss it, then open Settings.
    const reward = page.getByRole("status").getByRole("button", { name: /Zlecenie.*ukończone/i });
    if (await reward.isVisible().catch(() => false)) await reward.click();
    await page.locator('[data-dock="settings"]').click();
    await expect(page.getByTestId("backup-list")).toContainText("misja M01 ukończona", { timeout: 8000 });
  });

  test("a networking command reveals the host in Network Intelligence", async ({ page }) => {
    await startGame(page, "e2e_net");
    await typeLine(page, "nmap www.aurora.example");
    await page.getByLabel("Network Intelligence").first().click();
    await expect(page.locator('[data-window="network"]')).toContainText(/aurora|www/i, { timeout: 8000 });
  });

  test("progress survives closing the tab right after a command", async ({ page }) => {
    await startGame(page, "e2e_pagehide");
    await typeLine(page, "echo dowod-pagehide > /home/operator/dowod.txt");
    await page.goto("about:blank"); // fires pagehide → synchronous flush
    await disableBoot(page);
    await page.goto("/");
    await expect(page.getByTestId("terminal")).toBeVisible();
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("blacknet:save:local:e2e_pagehide:0") || "{}").data ?? "",
    );
    expect(saved).toContain("dowod-pagehide");
  });

  test("a second tab takes over and the first one pauses", async ({ page, context }) => {
    await startGame(page, "e2e_tabs");
    const second = await context.newPage();
    await disableBoot(second);
    await second.goto("/");
    await expect(second.getByTestId("terminal")).toBeVisible();
    await expect(page.getByTestId("tab-takeover")).toBeVisible({ timeout: 8000 });
  });

  test("command palette opens and launches an app", async ({ page }) => {
    await startGame(page, "e2e_palette");
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: "Paleta poleceń" })).toBeVisible();
    await page.getByPlaceholder(/Szukaj aplikacji/).fill("Portfel");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-window="wallet"]')).toBeVisible();
  });

  test("the editor opens and shows the current host's files", async ({ page }) => {
    await startGame(page, "e2e_editor");
    await page.locator('[data-dock="editor"]').click();
    const win = page.locator('[data-window="editor"]');
    await expect(win.getByRole("button", { name: /Zapisz/ })).toBeVisible();
    // The file tree lists the home directory (README.txt is seeded there).
    await expect(win.getByText("README.txt")).toBeVisible({ timeout: 8000 });
  });

  test("CCTV: no feeds until an NVR is taken over, then live view renders", async ({ page }) => {
    await startGame(page, "e2e_cctv");

    // Empty state before any camera access.
    await page.locator('[data-dock="cctv"]').click();
    await expect(page.locator('[data-window="cctv"]')).toContainText(/Brak dostępnych kamer/);

    // Unlock the Vertex NVR: recon + default-credential SSH login.
    for (const l of [
      "cat README.txt",
      "whoami",
      "help",
      "touch p.txt",
      "nslookup aurora.example",
      "ping -c1 www.aurora.example",
      "nmap -sV www.aurora.example",
      "nmap -sV nvr.vertex-sec.example",
      "ssh cctv@nvr.vertex-sec.example --password cctv1234",
      "exit",
    ]) {
      await typeLine(page, l);
    }

    // Now the CCTV app shows a live feed with its clock overlay.
    await page.locator('[data-dock="cctv"]').click();
    await expect(page.getByTestId("cctv-canvas")).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId("cctv-clock")).toBeVisible();
    // Jumping to the motion event and watching satisfies the "watch" objective.
    await expect(page.getByTestId("cctv-timeline")).toBeVisible();
  });
});

test.describe("BLACKNET OS — responsywność", () => {
  for (const vp of VIEWPORTS) {
    test(`${vp.name} (${vp.width}×${vp.height}) — brak poziomego scrolla, nawigacja widoczna`, async ({ browser }) => {
      const usesMobileShell = vp.width < 900; // matches MOBILE_QUERY (max-width:899px)
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        reducedMotion: "reduce",
        hasTouch: usesMobileShell,
        isMobile: usesMobileShell,
      });
      const page = await context.newPage();
      await startGame(page, "e2e_rwd");
      await typeLine(page, "whoami");

      // No accidental horizontal scrolling anywhere.
      const overflow = await page.evaluate(() => {
        const el = document.scrollingElement || document.documentElement;
        return el.scrollWidth - el.clientWidth;
      });
      expect(overflow, "poziomy scroll").toBeLessThanOrEqual(1);

      // The right shell chrome is present for the form factor.
      if (usesMobileShell) {
        await expect(page.locator('nav[aria-label="Aplikacje"]')).toBeVisible();
      } else {
        await expect(page.locator('nav[aria-label="Dock aplikacji"]')).toBeVisible();
      }

      await page.screenshot({ path: `test-results/os-${vp.name}.png`, fullPage: false });
      await context.close();
    });
  }
});
