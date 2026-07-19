export type SproutEmotion =
  | "idle"
  | "thinking"
  | "happy"
  | "cry"
  | "shocked"
  | "celebrate";

export type PersonaId =
  | "junior-developer"
  | "educator"
  | "city-survivor";

export type Persona = {
  readonly id: PersonaId;
  readonly name: string;
  readonly eyebrow: string;
  readonly description: string;
  readonly career: string;
  readonly location: string;
  readonly age: number;
  readonly stat: string;
  readonly statLabel: string;
  readonly tone: "lime" | "gold" | "coral";
};

export type ProfileInput = {
  readonly personaId: PersonaId;
  readonly age: string;
  readonly locationId: string;
  readonly desiredAnnualSpendingDollars: string;
  readonly targetAgeYears: string;
};
