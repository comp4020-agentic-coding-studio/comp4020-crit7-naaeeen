/**
 * Run after `mise exec -- pnpm build`. This boots the built server with an
 * anonymous temporary database; it cannot target production or real bookings.
 * Supply PLAYWRIGHT_MODULE (an installed Playwright module path) when the package
 * is external to this repo, and optionally PLAYWRIGHT_CHROMIUM_EXECUTABLE.
 * Evidence goes to the gitignored .data/verification directory. --extended adds
 * separate restored-page recovery probes; the default keeps the required flows focused.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const entry = join(root, "dist/server/entry.mjs");
const artifacts = join(root, ".data/verification");
const report = { startedAt: new Date().toISOString(), server: "isolated built server", checks: [], screenshots: [], firstViewport: [], console: [], externalRequests: [], unverified: ["Network interruption/reconnect is not exercised: the observed Chromium151 offline-emulation attempt kept the existing SSE stream open."], failures: [] };
const temporary = mkdtempSync(join(tmpdir(), "common-room-browser-"));
let server;
let browser;
let baseUrl;
let serverOutput = "";
const delay = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
const checked = (name) => { report.checks.push(name); console.log(`PASS ${name}`); };

function tomorrowInCanberra(days = 1) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const field = (name) => Number(parts.find((part) => part.type === name).value);
  return new Date(Date.UTC(field("year"), field("month") - 1, field("day") + days, 12)).toISOString().slice(0, 10);
}

async function exited(child, milliseconds) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((done) => {
    const finish = (result) => { clearTimeout(timer); child.off("exit", onExit); done(result); };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), milliseconds);
    child.once("exit", onExit);
  });
}

async function cleanup() {
  try { await browser?.close(); }
  finally {
    if (server) {
      if (server.exitCode === null && server.signalCode === null) server.kill("SIGTERM");
      if (!(await exited(server, 2_000))) {
        server.kill("SIGKILL");
        assert(await exited(server, 2_000), "Owned verification server must exit before removing its database.");
      }
    }
    rmSync(temporary, { recursive: true, force: true });
  }
}

async function boot() {
  assert(existsSync(entry), "Build the app first with mise exec -- pnpm build.");
  const port = await new Promise((done, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close((error) => error ? reject(error) : done(address.port));
    });
  });
  let startupError;
  server = spawn(process.execPath, [entry], {
    cwd: root,
    env: { PATH: process.env.PATH, NODE_ENV: "production", HOST: "127.0.0.1", PORT: String(port), DATABASE_PATH: join(temporary, "browser.db") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.once("error", (error) => { startupError = error; });
  for (const stream of [server.stdout, server.stderr]) {
    stream.on("data", (chunk) => { serverOutput = (serverOutput + chunk.toString()).slice(-4_000); });
  }
  baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (startupError || server.exitCode !== null || server.signalCode !== null) break;
    try {
      const response = await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(700) });
      await response.body?.cancel();
      if (response.ok) return;
    } catch { /* Startup is bounded; no shared or external server is accepted. */ }
    await delay(100);
  }
  throw new Error(`Built server failed readiness: ${startupError?.message ?? serverOutput}`);
}

async function context(options = {}) {
  const value = await browser.newContext(options);
  value.setDefaultTimeout(6_000);
  value.setDefaultNavigationTimeout(12_000);
  // The exercise is entirely local, including all fonts and images.
  await value.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === baseUrl || ["data:", "blob:"].includes(url.protocol)) return route.continue();
    report.externalRequests.push(`${url.origin}${url.pathname}`);
    return route.abort();
  });
  value.on("page", (page) => {
    page.on("pageerror", (error) => report.console.push({ type: "pageerror", message: error.message, url: page.url(), stack: error.stack }));
    page.on("console", (message) => {
      if (!["error", "warning"].includes(message.type())) return;
      report.console.push({ type: message.type(), message: message.text(), url: message.location().url });
    });
  });
  return value;
}

async function screenshot(page, name, fullPage = true) {
  const path = join(artifacts, `${name}.png`);
  await page.waitForFunction(() => document.getAnimations().every((animation) =>
    animation.playState !== "running" || animation.effect?.getTiming().iterations === Infinity), null, { timeout: 3_000 });
  await page.screenshot({ path, fullPage, animations: "allow" });
  if (!report.screenshots.includes(path)) report.screenshots.push(path);
}

async function noOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth,
  }));
  if (dimensions.document > dimensions.width + 1 || dimensions.body > dimensions.width + 1) {
    const offenders = await page.evaluate(() => [...document.querySelectorAll("main *")].filter((element) => {
      const box = element.getBoundingClientRect();
      return box.width > innerWidth || box.right > innerWidth + 1;
    }).slice(0, 12).map((element) => ({ element: element.tagName, class: element.getAttribute("class"),
      width: Math.round(element.getBoundingClientRect().width), minWidth: getComputedStyle(element).minWidth })));
    throw new Error(`${label}: horizontal overflow ${JSON.stringify(dimensions)}; elements=${JSON.stringify(offenders)}`);
  }
  const clipped = await page.locator("main input, main select, main button").evaluateAll((elements) => elements.filter((element) => {
    const style = getComputedStyle(element);
    if (!element.getClientRects().length || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const box = element.getBoundingClientRect();
    return box.left < -1 || box.right > innerWidth + 1;
  }).map((element) => element.getAttribute("aria-label") || element.getAttribute("name") || element.textContent.trim()));
  assert.deepEqual(clipped, [], `${label}: visible controls must not be horizontally clipped.`);
}

async function focused(_page, locator, label) {
  const active = await _page.evaluate(() => ({ tag: document.activeElement?.tagName, id: document.activeElement?.id,
    name: document.activeElement?.getAttribute("name"), text: document.activeElement?.textContent?.trim().slice(0, 80) }));
  assert(await locator.evaluate((element) => element === document.activeElement), `${label}: keyboard focus must reach the control; active=${JSON.stringify(active)}`);
  const visible = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== "none";
  });
  assert(visible, `${label}: focused control needs a visible focus indicator.`);
}

async function connectedSearch(page, action) {
  const connected = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/events" && response.status() === 200);
  await Promise.all([connected, Promise.resolve().then(action)]);
  await page.locator("[data-results]").waitFor();
}

async function updatedSearch(page, action) {
  const oldRegion = await page.locator("[data-results]").elementHandle();
  assert(oldRegion, "A search update needs its existing result region.");
  const response = page.waitForResponse((value) => new URL(value.url()).origin === baseUrl &&
    new URL(value.url()).pathname === "/" && value.request().method() === "GET" && value.status() === 200);
  try {
    await Promise.all([response, Promise.resolve().then(action)]);
    await oldRegion.waitForElementState("hidden");
    await page.locator("[data-results]").waitFor({ state: "visible" });
  } finally { await oldRegion.dispose(); }
}

async function refreshObserver(page) {
  await page.locator("[data-availability-update]").waitFor({ state: "visible" });
  await updatedSearch(page, () => page.getByRole("button", { name: "Refresh results" }).click());
}

async function journey(label, viewport, day) {
  const owner = await context({ viewport, timezoneId: "America/Los_Angeles", reducedMotion: "no-preference" });
  const observer = await context({ viewport, timezoneId: "Australia/Sydney" });
  try {
    const page = await owner.newPage();
    await connectedSearch(page, () => page.goto(baseUrl));
    await page.getByRole("button", { name: "Find a space", exact: true }).waitFor();
    await noOverflow(page, `${label} landing`);
    const searchButton = await page.getByRole("button", { name: "Find a space", exact: true }).boundingBox();
    assert(searchButton && searchButton.y + searchButton.height <= viewport.height, `${label}: initial viewport must contain the search action.`);
    await screenshot(page, `${label}-landing`);
    await screenshot(page, `${label}-landing-viewport`, false);

    const beforeSkip = await page.evaluate(() => performance.timeOrigin);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await focused(page, skip, `${label} skip link`);
    await Promise.all([
      page.waitForURL((url) => url.hash === "#main-content", { waitUntil: "load" }),
      skip.press("Enter"),
    ]);
    assert.equal(await page.evaluate(() => performance.timeOrigin), beforeSkip,
      "Fragment-only skip navigation must not reload the document and erase keyboard focus.");
    await page.keyboard.press("Tab");
    await focused(page, page.getByLabel("Date", { exact: true }), `${label} skip-link destination`);
    await page.getByLabel("Date", { exact: true }).fill(tomorrowInCanberra(day));
    await page.getByLabel("Start time", { exact: true }).selectOption("10:00");
    await page.getByLabel("How long?", { exact: true }).selectOption("60");
    await page.getByLabel("People", { exact: true }).selectOption("2");
    const refine = page.locator("summary").filter({ hasText: "Refine your space" });
    await refine.focus();
    await page.keyboard.press("Enter");
    await page.getByLabel("Library", { exact: true }).selectOption("Chifley Library");
    await page.getByLabel("Space type", { exact: true }).selectOption("room");
    await page.getByLabel("People", { exact: true }).focus();
    await page.keyboard.press("Tab");
    const submit = page.getByRole("button", { name: "Find a space", exact: true });
    await focused(page, submit, `${label} search submit`);
    await updatedSearch(page, () => page.keyboard.press("Enter"));
    assert(await page.locator("#results-title").evaluate((element) => element === document.activeElement), "Search results should receive focus after keyboard submission.");
    assert.equal(new URL(page.url()).searchParams.get("date"), tomorrowInCanberra(day));
    await noOverflow(page, `${label} results`);
    await screenshot(page, `${label}-results`);
    await page.getByLabel("Start time", { exact: true }).selectOption("11:00");
    await updatedSearch(page, () => page.getByRole("button", { name: "Find a space", exact: true }).click());
    assert.equal(new URL(page.url()).searchParams.get("start"), "11:00");
    await connectedSearch(page, () => page.goBack({ waitUntil: "load" }));
    assert.equal(await page.getByLabel("Start time", { exact: true }).inputValue(), "10:00");
    assert.equal(await page.getByLabel("Date", { exact: true }).inputValue(), tomorrowInCanberra(day));
    assert.equal(await page.getByLabel("Library", { exact: true }).inputValue(), "Chifley Library");
    checked(`${label}: enhanced search Back restores the previous query and visible filters`);
    const availableCard = page.locator("[data-space-id]").filter({ has: page.getByRole("link", { name: "Review & book", exact: true }) }).first();
    const spaceId = await availableCard.getAttribute("data-space-id");
    const spaceName = await availableCard.getByRole("heading", { level: 3 }).innerText();
    assert(spaceId && spaceName);
    const motionCard = await availableCard.elementHandle();
    assert(motionCard);
    try {
      await availableCard.hover();
      await page.waitForFunction((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m42 <= -2.5, motionCard);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForFunction((element) => matchMedia("(prefers-reduced-motion: reduce)").matches &&
        getComputedStyle(element).transform === "none" && getComputedStyle(element).animationName === "none", motionCard);
      assert.equal(await availableCard.evaluate((element) => getComputedStyle(element).transitionDuration), "0s");
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.mouse.move(0, 0);
    } finally { await motionCard.dispose(); }
    checked(`${label}: hover motion works and a live reduced-motion preference change removes it`);
    const watch = await observer.newPage();
    await connectedSearch(watch, () => watch.goto(page.url()));

    await availableCard.getByRole("link", { name: "Review & book", exact: true }).click();
    await page.getByRole("heading", { level: 1, name: spaceName, exact: true }).waitFor();
    const confirm = page.getByRole("button", { name: "Confirm booking", exact: true });
    await confirm.waitFor();
    await noOverflow(page, `${label} detail`);
    await screenshot(page, `${label}-detail`);
    await confirm.scrollIntoViewIfNeeded();
    await screenshot(page, `${label}-detail-action-viewport`, false);
    await page.setViewportSize({ width: 390, height: 844 });
    await noOverflow(page, `${label} detail resized to the 390px marking viewport`);
    await page.setViewportSize({ width: 320, height: 812 });
    await noOverflow(page, `${label} detail resized to 320px`);
    assert.equal(await page.locator('input[name="date"]').inputValue(), tomorrowInCanberra(day));
    await page.setViewportSize(viewport);
    await confirm.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await focused(page, confirm, `${label} confirmation`);
    await Promise.all([page.waitForURL(/\/bookings\/\?created=/), page.keyboard.press("Enter")]);
    await page.getByRole("heading", { name: "You’re booked in.", exact: true }).waitFor();
    const reference = await page.locator(".success-reference strong").innerText();
    assert.match(reference, /^CR-/);
    await noOverflow(page, `${label} confirmation`);
    await screenshot(page, `${label}-confirmed`);
    await screenshot(page, `${label}-confirmed-viewport`, false);
    await page.reload();
    assert.equal(await page.locator(".booking-card .booking-bottomline strong").innerText(), reference);
    assert.equal(await page.locator(".booking-card").count(), 1);
    await refreshObserver(watch);
    const observedCard = watch.locator(`[data-space-id="${spaceId}"]`);
    await observedCard.getByText("Taken for part of your session", { exact: true }).waitFor();
    assert.equal(await observedCard.getByRole("link", { name: "Review & book", exact: true }).count(), 0);
    checked(`${label}: keyboard search, detail, create, reload and independent-browser SSE reservation update`);

    const cancel = page.locator("summary").filter({ hasText: /^Cancel booking$/ });
    await cancel.focus();
    await page.keyboard.press("Enter");
    const keep = page.getByRole("button", { name: "Keep my booking", exact: true });
    await keep.click();
    assert.equal(await page.getByRole("button", { name: "Yes, cancel booking", exact: true }).isVisible(), false);
    await cancel.focus();
    await page.keyboard.press("Enter");
    const release = page.getByRole("button", { name: "Yes, cancel booking", exact: true });
    await release.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await focused(page, release, `${label} cancellation`);
    await Promise.all([page.waitForURL(/\/bookings\/\?cancelled=/), page.keyboard.press("Enter")]);
    await page.getByText("Booking cancelled. Thanks for making room.", { exact: true }).waitFor();
    await page.reload();
    assert.equal(await page.locator(".booking-card").count(), 0);
    await page.locator("summary").filter({ hasText: "Cancelled bookings" }).click();
    await page.locator(".cancelled-history").getByText(spaceName, { exact: true }).waitFor();
    await noOverflow(page, `${label} cancelled bookings`);
    await screenshot(page, `${label}-cancelled`);
    await refreshObserver(watch);
    await watch.locator(`[data-space-id="${spaceId}"]`).getByRole("link", { name: "Review & book", exact: true }).waitFor();
    await watch.getByRole("link", { name: "My bookings", exact: true }).click();
    await watch.getByText("No confirmed bookings here yet.", { exact: false }).waitFor();
    assert.equal(await watch.locator(".booking-card, .cancelled-history").count(), 0);
    checked(`${label}: cancellation confirmation, cancel/reload, SSE release and independent browser ownership`);
    checked(`${label}: visible keyboard focus, no horizontal overflow and resize during confirmation`);

    const emptyQuery = new URLSearchParams({ date: tomorrowInCanberra(day), start: "10:00", duration: "60", people: "8", kind: "desk" });
    await page.goto(`${baseUrl}/?${emptyQuery}`);
    await page.getByRole("heading", { name: "No spaces match this combination.", exact: true }).waitFor();
    await noOverflow(page, `${label} empty search`);
    await screenshot(page, `${label}-empty`);
    await page.goto(`${baseUrl}/?date=not-a-date&start=10%3A00&duration=60&people=2`);
    assert.equal(await page.getByLabel("Date", { exact: true }).getAttribute("aria-invalid"), "true");
    await page.getByLabel("Date", { exact: true }).fill(tomorrowInCanberra(day));
    await updatedSearch(page, () => page.getByRole("button", { name: "Find a space", exact: true }).click());
    assert.equal(await page.locator('.field-error, [aria-invalid="true"]').count(), 0,
      "A corrected enhanced search must clear stale field errors and accessibility error state.");
    assert.equal(await page.getByLabel("Date", { exact: true }).getAttribute("aria-describedby"), null);
    await noOverflow(page, `${label} corrected search`);
    await screenshot(page, `${label}-corrected-search`);
    const invalid = await page.goto(`${baseUrl}/spaces/chifley-room-1/?date=not-a-date&start=invalid&duration=60&people=2`);
    assert.equal(invalid.status(), 200, "Malformed detail filters must show recovery instead of a server error.");
    await page.getByText("Check your session details.", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Confirm booking", exact: true }).count(), 0);
    await noOverflow(page, `${label} invalid session`);
    await screenshot(page, `${label}-invalid-session`);
    await page.goto(`${baseUrl}/readme/`);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await noOverflow(page, `${label} README`);
    checked(`${label}: empty search, corrected field errors, malformed-session recovery and readable README route`);
  } finally { await Promise.all([owner.close(), observer.close()]); }
}

async function reducedMotion() {
  const reduced = await context({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  try {
    const page = await reduced.newPage();
    await connectedSearch(page, () => page.goto(baseUrl));
    assert(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches));
    const excessive = await page.evaluate(() => [...document.querySelectorAll("*")].filter((element) => {
      if (!element.getClientRects().length) return false;
      const style = getComputedStyle(element);
      const milliseconds = (list) => list.split(",").map((value) => parseFloat(value) * (value.trim().endsWith("ms") ? 1 : 1000));
      return [...milliseconds(style.transitionDuration), ...milliseconds(style.animationDuration)].some((duration) => duration > 50);
    }).map((element) => element.tagName + "." + element.className).slice(0, 10));
    assert.deepEqual(excessive, [], "Reduced-motion preference must shorten or remove visible animations.");
    await noOverflow(page, "reduced motion");
    await screenshot(page, "mobile-reduced-motion");
    checked("Reduced motion removes prolonged visible transitions and keeps search content available");
  } finally { await reduced.close(); }
}

async function availabilityRecovery() {
  const reader = await context({ viewport: { width: 390, height: 844 } });
  const writer = await context({ viewport: { width: 1920, height: 1080 } });
  try {
    const page = await reader.newPage();
    const other = await writer.newPage();
    const day = tomorrowInCanberra(4);
    const query = new URLSearchParams({ date: day, start: "13:00", duration: "60", people: "2", library: "Chifley Library", kind: "room" });
    const detailsUrl = `${baseUrl}/spaces/chifley-room-1/?${query}`;
    await connectedSearch(page, () => page.goto(`${baseUrl}/?${query}`));
    const date = page.getByLabel("Date", { exact: true });
    const draftDate = tomorrowInCanberra(5);
    await date.fill(draftDate);
    await other.goto(detailsUrl);
    await other.getByRole("button", { name: "Confirm booking", exact: true }).click();
    await other.getByRole("heading", { name: "You’re booked in.", exact: true }).waitFor();
    await page.locator("[data-availability-update]").waitFor({ state: "visible" });
    assert.equal(await date.inputValue(), draftDate, "An availability notice must preserve an unfinished date edit.");
    assert(await date.evaluate((element) => element === document.activeElement), "An availability notice must not steal form focus.");
    assert.equal(new URL(page.url()).searchParams.get("date"), day, "An availability notice must not silently rewrite the current search.");
    await date.fill(day);
    await refreshObserver(page);
    await page.locator('[data-space-id="chifley-room-1"]').getByText("Taken for part of your session", { exact: true }).waitFor();
    checked("Cross-browser availability notices preserve draft input, focus and query until explicitly refreshed");

    await date.focus();
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await page.locator("[data-availability-update]").waitFor({ state: "visible" });
    assert(await date.evaluate((element) => element === document.activeElement), "Restored-page notice must not steal form focus.");
    checked("Persisted pageshow handler shows a refresh notice without stealing focus (event simulated explicitly)");

    // Exercise actual browser Back separately; report whether Chromium used BFCache.
    await page.addInitScript(() => {
      window.addEventListener("pageshow", (event) => { Reflect.set(window, "__verificationPersisted", event.persisted); });
    });
    await page.goto(detailsUrl);
    await page.getByText("This session is no longer available.", { exact: true }).waitFor();
    await page.getByRole("link", { name: "My bookings", exact: true }).click();
    await page.getByRole("heading", { level: 1, name: "My bookings." }).waitFor();
    await other.locator("summary").filter({ hasText: /^Cancel booking$/ }).click();
    await other.getByRole("button", { name: "Yes, cancel booking", exact: true }).click();
    await other.getByText("Booking cancelled. Thanks for making room.", { exact: true }).waitFor();
    await page.goBack({ waitUntil: "load" });
    report.bfcacheRestorationObserved = await page.evaluate(() => Reflect.get(window, "__verificationPersisted") === true);
    if (await page.getByRole("button", { name: "Confirm booking", exact: true }).count() === 0) {
      await page.locator("[data-availability-update]").waitFor({ state: "visible" });
      await page.getByRole("link", { name: "Check availability", exact: true }).click();
    }
    await page.getByRole("button", { name: "Confirm booking", exact: true }).waitFor();
    checked("Actual browser Back shows current availability or offers a working detail refresh");

    const detailStream = page.waitForResponse((response) => response.url() === `${baseUrl}/api/events` && response.status() === 200);
    await Promise.all([detailStream, page.reload()]);
    const edit = page.getByRole("link", { name: "Change session details", exact: true });
    await edit.focus();
    await other.goto(detailsUrl);
    await other.getByRole("button", { name: "Confirm booking", exact: true }).click();
    await other.getByRole("heading", { name: "You’re booked in.", exact: true }).waitFor();
    await page.locator("[data-availability-update]").waitFor({ state: "visible" });
    assert(await edit.evaluate((element) => element === document.activeElement), "Live detail notice must not steal focus.");
    await page.getByRole("link", { name: "Check availability", exact: true }).click();
    await page.getByText("This session is no longer available.", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Confirm booking", exact: true }).count(), 0);
    await noOverflow(page, "mobile stale-detail recovery");
    await screenshot(page, "mobile-unavailable-detail-viewport", false);
    checked("Detail live updates preserve focus and Check availability removes a stale confirmation action");
  } finally { await Promise.all([reader.close(), writer.close()]); }
}

async function bookingRulesAndLimit() {
  const account = await context({ viewport: { width: 390, height: 844 } });
  try {
    const page = await account.newPage();
    const query = (day) => new URLSearchParams({ date: tomorrowInCanberra(day), start: "14:00", duration: "60", people: "2" });
    const detail = (day) => `${baseUrl}/spaces/hancock-room-1/?${query(day)}`;
    const count = async (expected) => {
      await page.getByRole("heading", { name: "Booking rules", exact: true }).waitFor();
      assert.equal((await page.locator("[data-active-count]").innerText()).replace(/\s+/g, " ").trim(), `${expected} of 2 active bookings`);
    };
    const daily = async (expected) => assert.match(await page.locator("[data-daily-allowance]").innerText(), new RegExp(`^${expected} minutes left`));
    const book = async (day, previous) => {
      await page.goto(detail(day));
      await count(previous);
      await page.getByRole("button", { name: "Confirm booking", exact: true }).click();
      await page.getByRole("heading", { name: "You’re booked in.", exact: true }).waitFor();
      await count(previous + 1);
    };

    await page.goto(`${baseUrl}/?${query(6)}`);
    await count(0);
    const rules = page.getByRole("complementary", { name: "Booking rules", exact: true });
    for (const label of ["2 active bookings", "120 minutes per day", "30 / 60 / 90 / 120 min", "14 days ahead"]) {
      await rules.getByText(label, { exact: true }).waitFor();
    }
    await book(6, 0);
    await page.goto(`${baseUrl}/?${query(6)}`);
    await daily(60);
    await page.getByLabel("Date", { exact: true }).fill(tomorrowInCanberra(7));
    await updatedSearch(page, () => page.getByRole("button", { name: "Find a space", exact: true }).click());
    await daily(120);
    await count(1);
    await page.getByRole("complementary", { name: "Booking rules", exact: true }).scrollIntoViewIfNeeded();
    await noOverflow(page, "mobile booking rules");
    await screenshot(page, "mobile-booking-rules-viewport", false);
    await book(7, 1);
    await page.goto(detail(8));
    await count(2);
    await page.locator(".allowance-limit").getByText(/Your active-booking limit is reached/).waitFor();
    await page.locator(".confirmation-allowance").scrollIntoViewIfNeeded();
    await screenshot(page, "mobile-active-limit-viewport", false);
    const refused = await account.request.post(`${baseUrl}/api/bookings`, {
      headers: { origin: baseUrl }, timeout: 6_000,
      data: { spaceId: "hancock-room-1", date: tomorrowInCanberra(8), start: "14:00", duration: 60, people: 2, requestId: randomUUID() },
    });
    assert.equal(refused.status(), 409);
    assert.equal((await refused.json()).error.code, "active_limit");
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get("error") === "active_limit"),
      page.getByRole("button", { name: "Confirm booking", exact: true }).click(),
    ]);
    await page.getByRole("alert").getByText(/Your demo account already has 2 active bookings/).waitFor();
    assert.equal(new URL(page.url()).searchParams.get("date"), tomorrowInCanberra(8));
    await count(2);
    await page.getByRole("link", { name: "My bookings", exact: true }).click();
    assert.equal(await page.locator(".booking-card").count(), 2);
    await page.locator(".booking-card").first().locator("summary").filter({ hasText: /^Cancel booking$/ }).click();
    await page.getByRole("button", { name: "Yes, cancel booking", exact: true }).click();
    await page.getByText("Booking cancelled. Thanks for making room.", { exact: true }).waitFor();
    await count(1);
    await page.goto(`${baseUrl}/?${query(6)}`);
    await daily(120);
    await book(8, 1);
    const listing = await account.request.get(`${baseUrl}/api/bookings`, { timeout: 6_000 });
    const confirmed = (await listing.json()).bookings.filter((booking) => booking.status === "confirmed");
    assert.equal(confirmed.length, 2);
    assert.deepEqual(confirmed.map((booking) => booking.date).sort(), [tomorrowInCanberra(7), tomorrowInCanberra(8)]);
    await noOverflow(page, "mobile recovered booking allowance");
    await screenshot(page, "mobile-limit-recovered-viewport", false);
    checked("Visible rules and date-specific allowance match actual bookings; max-two rejects API/native third bookings, and cancellation restores both count and daily allowance");
  } finally { await account.close(); }
}

async function withoutJavaScript() {
  const native = await context({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  try {
    const page = await native.newPage();
    await page.goto(baseUrl);
    await page.getByLabel("Date", { exact: true }).fill(tomorrowInCanberra(3));
    await page.getByLabel("Start time", { exact: true }).selectOption("11:00");
    await page.getByRole("button", { name: "Find a space", exact: true }).focus();
    await Promise.all([page.waitForURL((url) => url.searchParams.get("start") === "11:00"), page.keyboard.press("Enter")]);
    await page.getByRole("link", { name: "Review & book", exact: true }).first().focus();
    await Promise.all([page.waitForURL(/\/spaces\//), page.keyboard.press("Enter")]);
    await page.getByRole("button", { name: "Confirm booking", exact: true }).focus();
    await Promise.all([page.waitForURL(/\/bookings\/\?created=/), page.keyboard.press("Enter")]);
    await page.getByRole("heading", { name: "You’re booked in.", exact: true }).waitFor();
    await page.reload();
    assert.equal(await page.locator(".booking-card").count(), 1);
    await page.locator("summary").filter({ hasText: /^Cancel booking$/ }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Yes, cancel booking", exact: true }).focus();
    await Promise.all([page.waitForURL(/\/bookings\/\?cancelled=/), page.keyboard.press("Enter")]);
    await page.getByText("Booking cancelled. Thanks for making room.", { exact: true }).waitFor();
    await noOverflow(page, "no JavaScript cancellation");
    checked("Mobile native keyboard search, booking, reload and cancellation work with JavaScript disabled");
  } finally { await native.close(); }
}

try {
  mkdirSync(artifacts, { recursive: true });
  await boot();
  const module = process.env.PLAYWRIGHT_MODULE ?? "playwright";
  const { chromium } = await import(isAbsolute(module) ? pathToFileURL(module).href : module);
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  report.browserVersion = browser.version();
  for (const [name, viewport] of [["desktop", { width: 1920, height: 1080 }], ["mobile", { width: 390, height: 844 }]]) {
    const preview = await context({ viewport });
    try {
      const page = await preview.newPage();
      await page.goto(baseUrl);
      const button = page.getByRole("button", { name: "Find a space", exact: true });
      await button.waitFor();
      const box = await button.boundingBox();
      assert(box);
      report.firstViewport.push({ label: name, ...viewport, searchButtonBottom: box.y + box.height });
      await screenshot(page, `${name}-landing-viewport`, false);
    } finally { await preview.close(); }
  }
  // Independent contexts/dates let one failure still leave useful evidence for
  // the other required flows; every case remains bounded and closes its context.
  const extended = process.argv.includes("--extended");
  report.mode = extended ? "required plus extended recovery" : "required flows and booking rules";
  const cases = [
    ["desktop", () => journey("desktop", { width: 1920, height: 1080 }, 1)],
    ["mobile", () => journey("mobile", { width: 390, height: 844 }, 2)],
    ["booking rules and active limit", bookingRulesAndLimit], ["no JavaScript", withoutJavaScript],
  ];
  if (extended) cases.push(["reduced motion", reducedMotion], ["availability recovery", availabilityRecovery]);
  else report.unverified.push("Persisted-pageshow/BFCache recovery is excluded from this required-flow pass; use --extended for those additional probes.");
  for (const [name, run] of cases) {
    try { await run(); }
    catch (error) {
      report.failures.push({ name, error: error.stack ?? String(error) });
      console.error(`FAIL ${name}: ${error.stack ?? String(error)}`);
    }
  }
  assert.equal(report.failures.length, 0, "All browser journeys must pass; see individual failures in the report.");
  assert.deepEqual(report.externalRequests, [], "No external network dependency is expected for the booking flow.");
  assert.deepEqual(report.console, [], "Browser console must have no warnings, errors or uncaught exceptions.");
  checked("No browser warnings/errors and all application resources served locally");
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = error.stack ?? String(error);
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  try { await cleanup(); }
  catch (error) { report.passed = false; report.cleanupFailure = String(error); process.exitCode = 1; console.error(error); }
  report.finishedAt = new Date().toISOString();
  mkdirSync(artifacts, { recursive: true });
  writeFileSync(join(artifacts, "browser-report.json"), JSON.stringify(report, null, 2));
  console.log(`Browser report: ${join(artifacts, "browser-report.json")}`);
}
