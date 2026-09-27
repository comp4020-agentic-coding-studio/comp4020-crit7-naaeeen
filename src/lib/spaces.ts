import type { Space } from "./types";

export const LIBRARIES = ["Chifley Library", "Hancock Library", "Law Library", "Menzies Library"];
export const KINDS = ["room", "booth", "desk"] as const;
export const FEATURES = ["Screen", "Whiteboard", "Power", "Step-free access"];

// Deliberately illustrative inventory. These names, capacities, floors and
// facilities are prototype fixtures, not an authoritative ANU room catalogue.
export const SPACES: Space[] = LIBRARIES.flatMap((library, index) => {
  const prefix = library.split(" ")[0].toLowerCase();
  return [
    {
      id: `${prefix}-room-1`, name: "Study room 01", library, kind: "room" as const,
      capacity: [4, 4, 6, 4][index], floor: "Ground floor",
      features: ["Screen", "Whiteboard", "Power", "Step-free access"], accessible: true,
      description: "A shared table for working through ideas together, with a screen and whiteboard.",
    },
    {
      id: `${prefix}-room-2`, name: "Study room 02", library, kind: "room" as const,
      capacity: [6, 8, 4, 6][index], floor: "Level 1",
      features: ["Whiteboard", "Power", ...(index % 2 === 0 ? ["Screen", "Step-free access"] : [])],
      accessible: index % 2 === 0,
      description: "A larger table for a group session, a presentation rehearsal or collaborative work.",
    },
    {
      id: `${prefix}-booth-1`, name: "Focus booth 01", library, kind: "booth" as const,
      capacity: 2, floor: "Ground floor", features: ["Power", "Step-free access"], accessible: true,
      description: "A compact booth for two people to compare notes or work side by side.",
    },
    {
      id: `${prefix}-desk-1`, name: "Quiet desk 01", library, kind: "desk" as const,
      capacity: 1, floor: "Level 1", features: ["Power", ...(index % 2 === 0 ? ["Step-free access"] : [])],
      accessible: index % 2 === 0,
      description: "An individual desk for a focused study session with space for a laptop and books.",
    },
  ];
});

export function getSpace(id: string): Space | undefined {
  return SPACES.find((space) => space.id === id);
}
