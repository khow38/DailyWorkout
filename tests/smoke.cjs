const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { pathToFileURL } = require("node:url");
const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"));
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
});
const executablePath =
  process.env.BROWSER_PATH ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(fs.existsSync);
let browser;
async function main() {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  assert.equal(await page.title(), "FORM — Own your progress");
  const matrixCount = await page.evaluate(() => {
    let n = 0;
    for (const level of [0, 1, 2])
      for (const days of [3, 4, 6])
        for (const equipment of [[], ["bar"], ["dip"], ["bar", "dip"]])
          for (const goal of GOALS)
            for (const skill of ["balance", "lsit"]) {
              const p = { level, days, equipment, goal, skill },
                plan = generate(p);
              if (plan.workouts.length !== days) throw Error("Wrong split");
              for (const w of plan.workouts) {
                if (!validWorkout(w)) throw Error("Invalid prescription");
                if (
                  !["warm", "main", "skill", "cool"].every((phase) =>
                    w.items.some((x) => x.phase === phase),
                  )
                )
                  throw Error("Missing workout phase");
                if (new Set(w.items.map((x) => x.id)).size !== w.items.length)
                  throw Error("Duplicate movement");
                if (
                  w.items.some(
                    (x) => E[x.id].gear && !equipment.includes(E[x.id].gear),
                  )
                )
                  throw Error("Equipment leak");
                if (
                  goal === "Skill" &&
                  w.items.findIndex((x) => x.phase === "skill") >
                    w.items.findIndex((x) => x.phase === "main")
                )
                  throw Error("Skill order");
              }
              n++;
            }
    return n;
  });
  assert.equal(matrixCount, 288);
  console.log(
    `PASS ${matrixCount} profile combinations: splits, phases, unique exercises, equipment, skill order`,
  );
  const act = (action, selector = "") =>
    page.locator(`[data-action="${action}"]${selector}`).first().click();
  await page.locator('.hero [data-view="build"]').click();
  await act("choice", '[data-value="1"]');
  await act("next");
  await act("choice", '[data-value="4"]');
  await act("next");
  await act("choice", '[data-value="bar"]');
  await act("choice", '[data-value="dip"]');
  await act("next");
  await act("choice", '[data-value="Muscle"]');
  await act("generate");
  assert.deepEqual(await page.evaluate(() => S.profile), {
    level: 1,
    days: 4,
    equipment: ["bar", "dip"],
    goal: "Muscle",
    skill: "balance",
  });
  await act("start");
  await page.reload();
  await page.locator('nav [data-view="active"]').click();
  assert.equal(
    await page.locator(".workout-heading").textContent(),
    "Wrist rocks",
  );
  const mainIndex = await page.evaluate(() =>
    S.active.workout.items.findIndex((x) => x.phase === "main"),
  );
  await act("exercise", `[data-index="${mainIndex}"]`);
  await page.locator('[data-field="value"][data-set="0"]').fill("-1");
  await act("log", '[data-set="0"]');
  assert.equal(
    await page.evaluate(() => S.active.logs[S.active.index][0].done),
    false,
  );
  await page.locator('[data-field="value"][data-set="0"]').fill("12");
  await act("log", '[data-set="0"]');
  assert.equal(await page.evaluate(() => S.active.timer.status), "running");
  await act("timer-toggle");
  const paused = await page.evaluate(() => S.active.timer.remaining);
  await page.reload();
  await page.locator('nav [data-view="active"]').click();
  assert.equal(await page.evaluate(() => S.active.timer.status), "paused");
  assert.equal(await page.evaluate(() => S.active.timer.remaining), paused);
  await act("timer-toggle");
  await page.evaluate(() => {
    S.active.timer.deadline = Date.now() - 100;
    save();
    tick();
  });
  assert.equal(
    await page.locator("#timer-state").textContent(),
    "Time complete",
  );
  await act("timer-skip");
  assert.equal(await page.evaluate(() => S.active.timer.status), "idle");
  const items = await page.evaluate(() => S.active.workout.items);
  for (let i = 0; i < items.length; i++) {
    await act("exercise", `[data-index="${i}"]`);
    for (let j = 0; j < items[i].sets; j++) {
      const done = await page.evaluate(({ i, j }) => S.active.logs[i][j].done, {
        i,
        j,
      });
      if (!done) {
        await page
          .locator(`[data-field="value"][data-set="${j}"]`)
          .fill(String(items[i].high));
        await act("log", `[data-set="${j}"]`);
      }
    }
    if (["main", "skill"].includes(items[i].phase))
      await page.locator('[data-field="form"]').check();
  }
  await act("finish");
  await act("finish-confirm");
  const full = await page.evaluate(() => ({
    complete: S.history[0].complete,
    cursor: S.plan.cursor,
    active: S.active,
    stats: stats(),
    suggestions: suggestions(),
  }));
  assert.equal(full.complete, true);
  assert.equal(full.cursor, 1);
  assert.equal(full.active, null);
  assert.equal(full.stats.streak, 1);
  assert.ok(full.stats.reps > 0 && full.stats.seconds > 0);
  assert.ok(full.suggestions.length > 0);
  await page.reload();
  assert.equal(await page.evaluate(() => S.history.length), 1);
  const ruleChecks = await page.evaluate(() => {
    const original = structuredClone(S.history),
      candidate = suggestions()[0],
      h = S.history[0],
      i = h.workout.items.findIndex((x) => x.id === candidate.id);
    h.form[i] = false;
    const noForm = !suggestions().some((x) => x.id === candidate.id);
    h.form[i] = true;
    h.logs[i][0].rpe = 10;
    const excessiveEffort = !suggestions().some((x) => x.id === candidate.id);
    h.logs[i][0].rpe = h.workout.items[i].rpe;
    h.logs[i][0].value = 0;
    const insufficient = !suggestions().some((x) => x.id === candidate.id);
    S.history = original;
    return { noForm, excessiveEffort, insufficient };
  });
  assert.ok(Object.values(ruleChecks).every(Boolean));
  await act("upgrade");
  await act("upgrade-confirm");
  assert.equal(await page.evaluate(() => Object.keys(S.upgrades).length), 1);
  console.log(
    "PASS onboarding, reload recovery, validation, timer pause/resume/expiry, complete session, progression gating",
  );
  await page.locator('nav [data-view="active"]').click();
  await act("start");
  const coreIndex = await page.evaluate(() =>
    S.active.workout.items.findIndex((x) => x.phase === "main"),
  );
  await act("exercise", `[data-index="${coreIndex}"]`);
  await act("regress");
  await act("regress-confirm");
  assert.equal(
    await page.evaluate(() => E[S.active.workout.items[S.active.index].id].id),
    "quarter",
  );
  await act("log", '[data-set="0"]');
  await page.setViewportSize({ width: 320, height: 740 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Active mobile overflow",
  );
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({
      path: path.join(process.env.SCREENSHOT_DIR, "form-active.png"),
      fullPage: true,
    });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await act("finish");
  await act("finish-confirm");
  assert.equal(await page.evaluate(() => S.history.at(-1).complete), false);
  assert.equal(await page.evaluate(() => S.plan.cursor), 1);
  console.log(
    "PASS exercise regression and partial sessions retain schedule position",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  for (const v of ["home", "build", "active", "history"]) {
    await page.locator(`nav [data-view="${v}"]`).click();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Mobile overflow: ${v}`,
    );
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator('nav [data-view="home"]').click();
  await page.evaluate(() => {
    clearTimeout(toastTimeout);
    $("#toast").textContent = "";
  });
  if (process.env.SCREENSHOT_DIR) {
    await page.screenshot({
      path: path.join(process.env.SCREENSHOT_DIR, "form-mobile.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.screenshot({
      path: path.join(process.env.SCREENSHOT_DIR, "form-desktop.png"),
      fullPage: true,
    });
  }
  assert.deepEqual(errors, []);
  const streakCheck = await page.evaluate(() => {
    const saved = structuredClone(S.history),
      h = saved[0];
    const dateAgo = (n) => {
      const d = new Date();
      d.setDate(d.getDate() - n);
      return d.getTime();
    };
    S.history = [0, 0, 1, 2, 4].map((n) => ({
      ...structuredClone(h),
      endedAt: dateAgo(n),
    }));
    const consecutive = stats().streak;
    S.history = [1, 2, 3].map((n) => ({
      ...structuredClone(h),
      endedAt: dateAgo(n),
    }));
    const yesterday = stats().streak;
    S.history = [2].map((n) => ({
      ...structuredClone(h),
      endedAt: dateAgo(n),
    }));
    const broken = stats().streak;
    S.history = saved;
    return { consecutive, yesterday, broken };
  });
  assert.deepEqual(streakCheck, { consecutive: 3, yesterday: 3, broken: 0 });
  const otherTab = await page.context().newPage();
  await otherTab.goto(url);
  await otherTab.evaluate(() => {
    S.sound = !S.sound;
    save();
  });
  await page.waitForFunction(() => externalChange);
  assert.ok(
    (await page.locator("#storage-banner").textContent()).includes(
      "another tab",
    ),
  );
  await otherTab.close();
  const corrupt = await browser.newPage();
  await corrupt.goto(url);
  await corrupt.evaluate(() => localStorage.setItem(KEY, "{broken"));
  await corrupt.reload();
  assert.ok(
    (await corrupt.locator("#storage-banner").textContent()).includes(
      "could not be read",
    ),
  );
  assert.equal(
    await corrupt.evaluate(() => localStorage.getItem(KEY)),
    "{broken",
  );
  await corrupt.evaluate(() => {
    const d = fresh();
    S.profile = defaultProfile();
    S.plan = generate(S.profile);
    start(0);
    d.active = structuredClone(S.active);
    localStorage.setItem(KEY, JSON.stringify(d));
  });
  await corrupt.reload();
  assert.ok(
    (await corrupt.locator("#storage-banner").textContent()).includes(
      "could not be read",
    ),
  );
  await corrupt.close();
  const blocked = await browser.newPage();
  await blocked.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
  });
  await blocked.goto(url);
  await blocked.evaluate(() => {
    S.profile = defaultProfile();
    S.plan = generate(S.profile);
    save();
  });
  assert.ok(
    (await blocked.locator("#storage-banner").textContent()).includes(
      "unavailable",
    ),
  );
  await blocked.close();
  const filePage = await browser.newPage();
  const requests = [];
  filePage.on("request", (r) => requests.push(r.url()));
  await filePage.goto(pathToFileURL(path.join(root, "index.html")).href);
  await filePage.evaluate(() => {
    S.profile = defaultProfile();
    S.plan = generate(S.profile);
    render();
  });
  assert.equal(await filePage.locator(".session-row").count(), 3);
  assert.equal(requests.filter((x) => /^https?:/.test(x)).length, 0);
  await filePage.close();
  console.log(
    "PASS 320px active view, mobile routes, streak dates, cross-tab protection, corruption preservation, storage failure, zero-network file execution",
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    server.close();
  });
