import { EventEmitter } from "node:events";

export interface AvailabilityEvent { spaceId: string; date: string }

// The fixed single-machine deployment keeps this process-local fan-out valid.
// Only public invalidation keys go over the stream, never a reservation or owner.
export const bus = new EventEmitter();
bus.setMaxListeners(0);
export function publishAvailability(event: AvailabilityEvent): void {
  bus.emit("availability", { spaceId: event.spaceId, date: event.date });
}
