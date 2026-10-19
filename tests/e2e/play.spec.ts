import { expect, test } from "@playwright/test";

// Drives the real app in a browser: start a local game, run the tutorial
// commands in the xterm terminal, and verify the mission panel reflects
// completion — then reload and confirm the save resumed.

async function typeLine(page: import("@playwright/test").Page, line: string) {
  await page.locator(".xterm-helper-textarea").focus();
  await page.keyboard.type(line);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(120);
}

test("register (local), play the tutorial, and resume after reload", async ({ page }) => {
  // Each Playwright test gets an isolated context, so storage starts empty.
  await page.goto("/");

  // Landing / auth screen (guest mode: username + start).
  await expect(page.getByRole("heading", { name: "BLACKNET" })).toBeVisible();
  await page.getByPlaceholder("nazwa użytkownika").fill("e2e_operator");
  await page.getByRole("button", { name: /Rozpocznij grę/i }).click();

  // Game shell: the missions sidebar shows the first mission.
  const firstMission = page.locator("text=Rozruch systemu").first();
  await expect(firstMission).toBeVisible();

  // The terminal mounts (xterm).
  await expect(page.locator(".xterm")).toBeVisible();

  // Complete mission m01 with real commands.
  await typeLine(page, "cat README.txt");
  await typeLine(page, "whoami");
  await typeLine(page, "help");
  await typeLine(page, "touch pierwszy.txt");

  // The mission card for "Rozruch systemu" should now read "ukończona".
  const card = page
    .locator("div")
    .filter({ hasText: "Rozruch systemu" })
    .filter({ hasText: "ukończona" })
    .first();
  await expect(card).toBeVisible({ timeout: 10_000 });

  // Let the debounced autosave flush before reloading.
  await page.waitForTimeout(2000);

  // Reload → local save auto-resumes (no auth screen) and progress persists.
  await page.reload();
  await expect(page.locator(".xterm")).toBeVisible();
  const resumedCard = page
    .locator("div")
    .filter({ hasText: "Rozruch systemu" })
    .filter({ hasText: "ukończona" })
    .first();
  await expect(resumedCard).toBeVisible({ timeout: 10_000 });
});

test("networking command discovers a host in the network panel", async ({ page }) => {
  await page.goto("/");
  // Resume prior local identity or start fresh.
  const start = page.getByRole("button", { name: /Rozpocznij grę/i });
  if (await start.isVisible().catch(() => false)) {
    await page.getByPlaceholder("nazwa użytkownika").fill("e2e_operator");
    await start.click();
  }
  await expect(page.locator(".xterm")).toBeVisible();

  await typeLine(page, "nmap www.aurora.example");

  // Switch the desktop sidebar to the "Sieć" tab and expect the host listed.
  await page.getByRole("button", { name: "Sieć", exact: true }).click();
  await expect(page.locator("text=www.aurora.example").first()).toBeVisible({ timeout: 10_000 });
});

test("autosave: mission creates a backup, a second tab takes over safely", async ({ page, context }) => {
  await page.goto("/");
  await page.getByPlaceholder("nazwa użytkownika").fill("e2e_save");
  await page.getByRole("button", { name: /Rozpocznij grę/i }).click();
  await expect(page.locator(".xterm")).toBeVisible();
  for (const l of ["cat README.txt", "whoami", "help", "touch pierwszy.txt"]) await typeLine(page, l);

  // Milestone saves immediately — no debounce wait needed.
  await expect(page.locator("[data-save-state='saved']")).toBeVisible();

  // A backup of the completed mission lands in IndexedDB.
  await page.locator("aside").getByRole("button", { name: "Ustaw." }).click();
  await expect(page.getByTestId("backup-list")).toContainText("misja M01 ukończona");

  // Open the same save in a second tab: the first one steps back.
  const second = await context.newPage();
  await second.goto("/");
  await expect(second.locator(".xterm")).toBeVisible();
  await expect(page.getByTestId("tab-takeover")).toBeVisible();
  // The new tab starts from the freshest state (mission already done).
  await second.locator("aside").getByRole("button", { name: "Zlecenia" }).click();
  await expect(second.locator("div").filter({ hasText: "Rozruch systemu" }).filter({ hasText: "ukończona" }).first()).toBeVisible();
});

test("autosave: progress survives closing the tab right after a command", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("nazwa użytkownika").fill("e2e_pagehide");
  await page.getByRole("button", { name: /Rozpocznij grę/i }).click();
  await expect(page.locator(".xterm")).toBeVisible();
  await typeLine(page, "echo ostatnia-komenda > /home/operator/dowod.txt");
  // Leave immediately (no waiting for the debounce) — pagehide must flush.
  await page.goto("about:blank");
  await page.goto("/");
  await expect(page.locator(".xterm")).toBeVisible();
  await typeLine(page, "cat dowod.txt > /home/operator/kopia.txt");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("blacknet:save:local:e2e_pagehide:0") || "{}").data ?? "",
  );
  expect(saved).toContain("ostatnia-komenda");
});
