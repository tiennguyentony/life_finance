import { MOCK_STARTING_DASHBOARD } from "@/mocks/dashboard";
import { MOCK_PERSONAS } from "@/mocks/personas";
import { MOCK_PLAYER_BY_PERSONA } from "@/mocks/player";
import type {
  DashboardView,
  GeneratedPlayer,
  Persona,
  ProfileInput,
  ServiceOptions,
} from "@/types/game";

import { mockDelay } from "./mock-delay";

export async function getPersonas(
  options?: ServiceOptions,
): Promise<readonly Persona[]> {
  await mockDelay(options);
  return MOCK_PERSONAS;
}

export async function generatePlayer(
  input: ProfileInput,
  options?: ServiceOptions,
): Promise<GeneratedPlayer> {
  await mockDelay(options);

  const basePlayer = MOCK_PLAYER_BY_PERSONA[input.personaId];
  if (!basePlayer) {
    throw new Error("Unknown persona");
  }

  const parsedAge = Number.parseInt(input.age, 10);
  const player = {
    ...basePlayer,
    name: input.name.trim() || "Player One",
    age: Number.isFinite(parsedAge) && parsedAge >= 18 ? parsedAge : basePlayer.age,
    location: input.location.trim() || basePlayer.location,
    goal: input.goal.trim() || basePlayer.goal,
  };

  const dashboard: DashboardView = {
    ...MOCK_STARTING_DASHBOARD,
    playerName: player.name,
  };

  return { player, dashboard };
}

export async function getPlayerState(
  options?: ServiceOptions,
): Promise<GeneratedPlayer> {
  return generatePlayer(
    {
      personaId: "junior-developer",
      name: "Alex",
      age: "24",
      location: "Seattle, WA",
      goal: "Stop living one surprise away from chaos",
    },
    options,
  );
}
