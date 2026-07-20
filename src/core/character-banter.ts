export const CHARACTER_BANTER_IDS = [
  "sprout",
  "debtzilla",
  "inflato",
  "impulso",
  "bengo",
  "buddi",
  "lucky_cat",
] as const;

export type CharacterBanterId = (typeof CHARACTER_BANTER_IDS)[number];

export const CHARACTER_BANTER_TONES = ["roast", "warning", "cheer"] as const;

export type CharacterBanterTone = (typeof CHARACTER_BANTER_TONES)[number];
