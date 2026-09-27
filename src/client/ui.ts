const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const searchForm = document.querySelector<HTMLFormElement>("[data-search-form]");
let searchController: AbortController | undefined;
let events: EventSource | undefined;
let connectionInterrupted = false;

function resultsRegion(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-results]");
}

function restoreSubmitButtons() {
  document.querySelectorAll<HTMLButtonElement>("button[data-original-label]").forEach((button) => {
    button.disabled = false;
    const label = button.querySelector("span") ?? button;
    label.textContent = button.dataset.originalLabel ?? "Continue";
    button.closest("form")?.removeAttribute("aria-busy");
  });
}

function availabilityScope(): HTMLElement | null {
  return resultsRegion() ?? document.querySelector<HTMLElement>("[data-availability-scope]");
}

function showAvailabilityNotice(message: string) {
  const notice = availabilityScope()?.querySelector<HTMLElement>("[data-availability-update]");
  if (!notice) return;
  const copy = notice.querySelector("p");
  if (copy && copy.textContent !== message) copy.textContent = message;
  if (notice.hidden) {
    notice.hidden = false;
    if (!reducedMotion.matches) notice.animate([{ opacity: 0, transform: "translateY(-5px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 200, easing: "ease-out" });
  }
}

function connectAvailability() {
  if (!availabilityScope() || typeof EventSource === "undefined" || events) return;
  events = new EventSource("/api/events");
  events.addEventListener("availability", (event: MessageEvent<string>) => {
    try {
      const update: unknown = JSON.parse(event.data);
      const scope = availabilityScope();
      if (!scope || !update || typeof update !== "object" || !("date" in update) || typeof update.date !== "string" || update.date !== scope.dataset.date) return;
      showAvailabilityNotice("Availability changed for this date. Refresh to see the latest spaces.");
    } catch {
      // A malformed notification must not interrupt a booking or its controls.
    }
  });
  events.addEventListener("error", () => {
    connectionInterrupted = true;
    showAvailabilityNotice("Live updates are interrupted. Refresh availability before choosing a space.");
  });
  events.addEventListener("open", () => {
    if (connectionInterrupted) showAvailabilityNotice("Live updates are back. Refresh availability to check changes you may have missed.");
    connectionInterrupted = false;
  });
}

if (searchForm && "fetch" in window && "DOMParser" in window && "AbortController" in window) {
  let renderedSearchKey = `${window.location.pathname}${window.location.search}`;
  const searchStatus = document.createElement("span");
  searchStatus.className = "sr-only";
  searchStatus.setAttribute("role", "status");
  searchForm.append(searchStatus);
  searchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const url = new URL(searchForm.action);
    url.search = new URLSearchParams([...new FormData(searchForm).entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string")).toString();
    url.hash = "results";
    searchController?.abort();
    const controller = new AbortController();
    searchController = controller;
    const oldRegion = resultsRegion();
    const focusAtSubmit = document.activeElement;
    const button = searchForm.querySelector<HTMLButtonElement>(".search-submit");
    oldRegion?.setAttribute("aria-busy", "true");
    if (oldRegion) oldRegion.inert = true;
    if (button) {
      button.disabled = true;
      button.querySelector("span")!.textContent = "Finding your space…";
    }
    searchStatus.textContent = "Finding available spaces.";
    try {
      const response = await fetch(url, { signal: controller.signal, credentials: "same-origin", headers: { Accept: "text/html" } });
      if (!response.ok) throw new Error("Search unavailable");
      const nextDocument = new DOMParser().parseFromString(await response.text(), "text/html");
      const nextRegion = nextDocument.querySelector<HTMLElement>("[data-results]");
      if (!nextRegion || !oldRegion) throw new Error("Missing search results");
      if (nextDocument.querySelector(".field-error")) {
        window.location.assign(url.href);
        return;
      }
      const shouldMoveFocus = document.activeElement === focusAtSubmit || document.activeElement === document.body;
      searchForm.querySelectorAll(".field-error").forEach((message) => message.remove());
      searchForm.querySelectorAll("[aria-invalid]").forEach((field) => field.removeAttribute("aria-invalid"));
      searchForm.querySelectorAll("[aria-describedby]").forEach((field) => {
        const remaining = field.getAttribute("aria-describedby")?.split(/\s+/).filter((id) => !id.startsWith("error-")) ?? [];
        if (remaining.length) field.setAttribute("aria-describedby", remaining.join(" "));
        else field.removeAttribute("aria-describedby");
      });
      const currentData = new FormData(searchForm);
      const filterCount = Number(Boolean(currentData.get("library"))) + Number(Boolean(currentData.get("kind"))) + currentData.getAll("features").length;
      const summary = searchForm.querySelector(".search-more > summary > span");
      summary?.querySelector(".filter-count")?.remove();
      if (filterCount && summary) {
        const count = document.createElement("span");
        count.className = "filter-count";
        count.textContent = String(filterCount);
        summary.append(count);
      }
      const nextPolicy = nextDocument.querySelector("[data-search-policy]");
      if (nextPolicy) document.querySelector("[data-search-policy]")?.replaceWith(nextPolicy);
      oldRegion.replaceWith(nextRegion);
      if (connectionInterrupted) showAvailabilityNotice("Live updates are interrupted. Refresh availability before choosing a space.");
      window.history.pushState({}, "", url);
      renderedSearchKey = `${url.pathname}${url.search}`;
      const dateInput = document.querySelector<HTMLInputElement>("#date");
      const nextDateInput = nextDocument.querySelector<HTMLInputElement>("#date");
      if (dateInput && nextDateInput) { dateInput.min = nextDateInput.min; dateInput.max = nextDateInput.max; }
      searchStatus.textContent = nextRegion.querySelector(".results-summary")?.textContent ?? "Search results updated.";
      if (shouldMoveFocus) {
        nextRegion.querySelector<HTMLElement>("#results-title")?.focus({ preventScroll: true });
        nextRegion.scrollIntoView({ block: "start", behavior: reducedMotion.matches ? "instant" : "smooth" });
      }
      if (!reducedMotion.matches) nextRegion.querySelector<HTMLElement>(".results-heading")?.animate([{ opacity: .4, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 220, easing: "ease-out" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      // The same URL is a complete server-rendered fallback if enhancement fails.
      window.location.assign(url.href);
    } finally {
      if (searchController === controller) {
        oldRegion?.removeAttribute("aria-busy");
        if (oldRegion) oldRegion.inert = false;
        if (button) { button.disabled = false; button.querySelector("span")!.textContent = "Find a space"; }
      }
    }
  });
  window.addEventListener("popstate", () => {
    // Fragment navigation must preserve native skip-link and field focus.
    const requestedSearchKey = `${window.location.pathname}${window.location.search}`;
    if (requestedSearchKey !== renderedSearchKey) window.location.reload();
  });
}

document.querySelectorAll<HTMLFormElement>("[data-booking-form], [data-cancel-form]").forEach((form) => {
  form.addEventListener("submit", () => {
    const button = form.querySelector<HTMLButtonElement>("button[type='submit']");
    if (!button) return;
    const label = button.querySelector("span") ?? button;
    button.dataset.originalLabel = label.textContent ?? "Continue";
    label.textContent = form.hasAttribute("data-cancel-form") ? "Cancelling…" : "Saving your space…";
    button.disabled = true;
    form.setAttribute("aria-busy", "true");
  });
});

document.querySelectorAll<HTMLButtonElement>("[data-keep-booking]").forEach((button) => {
  button.hidden = false;
  button.addEventListener("click", () => {
    const details = button.closest("details");
    if (details) { details.open = false; details.querySelector("summary")?.focus(); }
  });
});

connectAvailability();
window.addEventListener("pagehide", () => { events?.close(); events = undefined; });
window.addEventListener("pageshow", (event) => {
  restoreSubmitButtons();
  if (event.persisted) showAvailabilityNotice("You have returned to an earlier view. Refresh availability before choosing a space.");
  connectAvailability();
});
