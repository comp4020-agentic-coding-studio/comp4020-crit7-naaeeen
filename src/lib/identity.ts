import { createHash, randomBytes } from "node:crypto";

export const OWNER_COOKIE = "common_room_owner";
export function validOwner(token: string | undefined): token is string {
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
}
export const newOwner = () => randomBytes(32).toString("hex");
export const ownerHash = (token: string) => createHash("sha256").update(token).digest("hex");
