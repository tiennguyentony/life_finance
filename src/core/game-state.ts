export type PlayerProfile = {
  readonly age: number;
  readonly locationId: string;
  readonly careerTrackId: string;
};

export type FinancialSnapshot = {
  readonly cashCents: number;
  readonly assetCents: number;
  readonly liabilityCents: number;
};

export type WellbeingSnapshot = {
  readonly burnoutPercent: number;
  readonly happinessPercent: number;
};

export type GameState = {
  readonly schemaVersion: 1;
  readonly month: number;
  readonly player: PlayerProfile;
  readonly finances: FinancialSnapshot;
  readonly wellbeing: WellbeingSnapshot;
};
