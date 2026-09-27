/**
 * Run after `mise exec -- pnpm build`. This boots the built server with an
 * anonymous temporary database; it cannot target production or real bookings.
 * Supply PLAYWRIGHT_MODULE (an installed Playwright module path) when the package
 * is external to this repo, and optionally PLAYWRIGHT_CHROMIUM_EXECUTABLE.
 * Evidence goes to the gitignored .data/verification directory.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const entry = join(root, "dist/server/entry.mjs");
const artifacts = join(root, ".data/verification");
const report = { startedAt: new Date().toISOString(), server: "isolated built server", checks: [], screenshots: [], firstViewport: [], console: [], externalRequests: [], expectedOfflineFailures: [] };
const intentionallyOfflinePages = new WeakSet();
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
    page.on("pageerror", (error) => report.console.push({ type: "pageerror", message: error.message }));
    page.on("console", (message) => {
      if (!["error", "warning"].includes(message.type())) return;
      const detail = { type: message.type(), message: message.text(), url: message.location().url };
      const offlineStream = intentionallyOfflinePages.has(page) && detail.url === `${baseUrl}/api/events` &&
        /net::ERR_(INTERNET_DISCONNECTED|NETWORK_CHANGED|FAILED|CONNECTION_CLOSED)/.test(detail.message);
      if (offlineStream) report.expectedOfflineFailures.push(detail);
      else report.console.push(detail);
    });
  });
  return value;
}

async function screenshot(page, name, fullPage = true) {
  const path = join(artifacts, `${name}.png`);
  await page.screenshot({ path, fullPage, animations: "disabled" });
  report.screenshots.push(path);
}

async function noOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth,
  }));
  assert(dimensions.document <= dimensions.width + 1 && dimensions.body <= dimensions.width + 1,
    `${label}: horizontal overflow ${JSON.stringify(dimensions)}`);
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
    report.firstViewport.push({ label, ...viewport, searchButtonBottom: searchButton.y + searchButton.height });
    await screenshot(page, `${label}-landing`);
    await screenshot(page, `${label}-landing-viewport`, false);

    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await focused(page, skip, `${label} skip link`);
    await Promise.all([
      page.waitForURL((url) => url.hash === "#main-content", { waitUntil: "load" }),
      skip.press("Enter"),
    ]);
    console.log("SKIP DIAGNOSTIC", JSON.stringify(await page.evaluate(() => ({
      active: document.activeElement?.outerHTML.slice(0, 180), target: document.getElementById("main-content")?.outerHTML.slice(0, 100),
      href: document.querySelector(".skip-link")?.getAttribute("href"), url: location.href,
      navigation: performance.getEntriesByType("navigation").map((entry) => ({ type: entry.type, name: entry.name })),
    }))));
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

async function reconnectRecovery() {
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
    intentionallyOfflinePages.add(page);
    await reader.setOffline(true);
    await page.locator("[data-availability-update]").waitFor({ state: "visible", timeout: 10_000 });
    await other.goto(detailsUrl);
    await other.getByRole("button", { name: "Confirm booking", exact: true }).click();
    await other.getByRole("heading", { name: "You’re booked in.", exact: true }).waitFor();
    const reopened = page.waitForResponse((response) => response.url() === `${baseUrl}/api/events` && response.status() === 200, { timeout: 15_000 });
    await Promise.all([reopened, reader.setOffline(false)]);
    assert(await page.locator("[data-availability-update]").isVisible(), "Reconnect must leave a visible refresh notice for possibly missed updates.");
    assert.equal(await date.inputValue(), draftDate, "Reconnect must preserve an unfinished date edit.");
    assert(await date.evaluate((element) => element === document.activeElement), "Reconnect notice must not steal form focus.");
    assert.equal(new URL(page.url()).searchParams.get("date"), day, "Reconnect must not silently rewrite the current search.");
    await date.fill(day);
    await refreshObserver(page);
    await page.locator('[data-space-id="chifley-room-1"]').getByText("Taken for part of your session", { exact: true }).waitFor();
    checked("Offline/reconnect warns about missed updates, preserves draft input and focus, and refreshes a booking made in another browser");

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

async function withoutJavaScript() {
  const native = await context({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  try {
    const page = await native.newPage();
    await page.goto(baseUrl);
    await page.getByLabel("Date", { exact: true }).fill(tomorrowInCanberra(3));
    await page.getByLabel("Start time", { exact: true }).selectOption("11:00");
    await page.getByRole("button", { name: "Find a space", exact: true }).click();
    await page.getByRole("link", { name: "Review & book", exact: true }).first().click();
    await page.getByRole("button", { name: "Confirm booking", exact: true }).click();
    await page.getByRole("heading", { name: "You’re booked in.", exact: true }).waitFor();
    await page.reload();
    assert.equal(await page.locator(".booking-card").count(), 1);
    await page.locator("summary").filter({ hasText: /^Cancel booking$/ }).click();
    await page.getByRole("button", { name: "Yes, cancel booking", exact: true }).click();
    await page.getByText("Booking cancelled. Thanks for making room.", { exact: true }).waitFor();
    await noOverflow(page, "no JavaScript cancellation");
    checked("Mobile search, booking, reload and cancellation work with JavaScript disabled");
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
      await page.getByRole("button", { name: "Find a space", exact: true }).waitFor();
      await screenshot(page, `${name}-landing-viewport`, false);
    } finally { await preview.close(); }
  }
  await journey("desktop", { width: 1920, height: 1080 }, 1);
  await journey("mobile", { width: 390, height: 844 }, 2);
  await reducedMotion();
  await reconnectRecovery();
  await withoutJavaScript();
  assert.deepEqual(report.externalRequests, [], "No external network dependency is expected for the booking flow.");
  assert.deepEqual(report.console, [], "Browser console must have no warnings, errors or uncaught exceptions.");
  checked("No unexpected browser warnings/errors and all application resources served locally; intentional offline SSE errors recorded separately");
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
