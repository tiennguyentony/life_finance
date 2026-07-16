import type { Metadata } from "next";

import { PlayConsole } from "@/features/play/play-console";
import { PLAYER_PRESETS, type PlayerPresetId } from "@/features/play/play-model";

export const metadata: Metadata = { title: "Play" };

function isPresetId(value: string | undefined): value is PlayerPresetId {
  return value !== undefined && value in PLAYER_PRESETS;
}

export default async function PlayPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const params = await searchParams;
  const persona = Array.isArray(params.persona)
    ? params.persona[0]
    : params.persona;
  return (
    <PlayConsole initialPresetId={isPresetId(persona) ? persona : undefined} />
  );
}
