import type { PersonaId, PlayerView } from "@/types/game";

export const MOCK_PLAYER_BY_PERSONA: Record<PersonaId, PlayerView> = {
  "junior-developer": {
    name: "Alex",
    age: 24,
    location: "Seattle, WA",
    career: "Junior developer",
    goal: "Stop living one surprise away from chaos",
  },
  educator: {
    name: "Sam",
    age: 28,
    location: "Portland, OR",
    career: "Middle school teacher",
    goal: "Buy a home without becoming boring",
  },
  "city-survivor": {
    name: "Jordan",
    age: 29,
    location: "New York, NY",
    career: "Brand coordinator",
    goal: "Build freedom in the expensive city",
  },
};
