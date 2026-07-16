import type { ServiceOptions } from "@/types/game";

export async function mockDelay(options: ServiceOptions = {}): Promise<void> {
  const delayMs = options.delayMs ?? 800;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
