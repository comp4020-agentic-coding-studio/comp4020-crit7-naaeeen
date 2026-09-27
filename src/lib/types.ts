export interface SearchFilters {
  date: string;
  start: string;
  duration: number;
  people: number;
  library: string;
  kind: string;
  features: string[];
}

export interface Space {
  id: string;
  name: string;
  library: string;
  kind: "room" | "booth" | "desk";
  capacity: number;
  floor: string;
  features: string[];
  description: string;
  accessible: boolean;
}

export interface AvailabilityItem {
  space: Space;
  available: boolean;
  start: string;
  end: string;
  alternatives: { date: string; start: string; end: string }[];
}

export interface AvailabilityResult {
  filters: SearchFilters;
  results: AvailabilityItem[];
  totalSpaces: number;
  availableCount: number;
  errors: Record<string, string>;
  dateMin: string;
  dateMax: string;
}

export interface BookingView {
  id: string;
  reference: string;
  space: Space;
  date: string;
  start: string;
  end: string;
  duration: number;
  people: number;
  status: "confirmed" | "cancelled";
  createdAt: string;
  canCancel: boolean;
}

export interface BookingAllowance {
  date: string;
  activeBookings: number;
  maxActiveBookings: number;
  remainingActiveBookings: number;
  dailyMinutes: number;
  maxDailyMinutes: number;
  remainingDailyMinutes: number;
}
