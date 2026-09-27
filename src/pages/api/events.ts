import type { APIRoute } from "astro";
import { bus, type AvailabilityEvent } from "../../lib/events";
import { json } from "../../lib/http";

let connections = 0;
const MAX_CONNECTIONS = 200;

export const GET: APIRoute = ({ request }) => {
  if (connections >= MAX_CONNECTIONS) return json({ error: { code: "unavailable", message: "Live updates are busy. Refresh to check availability." } }, 503, { "retry-after": "30" });
  connections++;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let onAvailability: ((event: AvailabilityEvent) => void) | undefined;
  let stopped = false;
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    connections--;
    if (heartbeat) clearInterval(heartbeat);
    if (onAvailability) bus.off("availability", onAvailability);
    request.signal.removeEventListener("abort", cleanup);
  };
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (message: string) => {
        if (stopped) return;
        try { controller.enqueue(encoder.encode(message)); }
        catch { cleanup(); }
      };
      send(": connected\n\n");
      heartbeat = setInterval(() => send(": ping\n\n"), 30_000);
      onAvailability = ({ spaceId, date }) => send(`event: availability\ndata: ${JSON.stringify({ spaceId, date })}\n\n`);
      bus.on("availability", onAvailability);
      request.signal.addEventListener("abort", cleanup, { once: true });
      if (request.signal.aborted) cleanup();
    },
    cancel: cleanup,
  });
  return new Response(stream, { headers: {
    "content-type": "text/event-stream", "cache-control": "no-cache, no-store", "x-accel-buffering": "no",
  } });
};
