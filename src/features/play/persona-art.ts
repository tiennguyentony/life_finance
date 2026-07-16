import type { PlayerPresetId } from "./play-model";

export type CharacterArt = Readonly<{
  /** Display name shown to players. */
  name: string;
  /** Public-root-relative portrait path served through next/image. */
  src: string;
  alt: string;
  /** One playful line of personality for persona cards. */
  tagline: string;
  width: number;
  height: number;
}>;

/**
 * All portraits are 1536x1024 masters with the character centered, so a
 * square object-fit crop keeps the full figure on any card size.
 */
const PORTRAIT_WIDTH = 1536;
const PORTRAIT_HEIGHT = 1024;

function character(
  name: string,
  folder: string,
  alt: string,
  tagline: string,
): CharacterArt {
  return {
    name,
    src: `/assets/characters/${folder}/${folder}-base.png`,
    alt,
    tagline,
    width: PORTRAIT_WIDTH,
    height: PORTRAIT_HEIGHT,
  };
}

export const CHARACTERS = {
  bengo: character(
    "Bengo",
    "bengo",
    "Bengo, a penguin wizard in a dark hooded cloak holding a glowing crystal staff",
    "Debugs by day, studies compounding by night.",
  ),
  buddi: character(
    "Buddi",
    "buddi",
    "Buddi, a cheerful friend in a purple hoodie waving hello while holding a notebook",
    "Shows up early for every shift and every goal.",
  ),
  froggy: character(
    "Froggy",
    "froggy",
    "Froggy, a bright green frog holding a budget notebook and a pencil",
    "Writes down every dollar before it hops away.",
  ),
  richie: character(
    "Richie",
    "richie",
    "Richie, a confident yellow chick wearing sunglasses and holding a gold coin",
    "Two salaries, one plan, zero panic.",
  ),
  penny: character(
    "Penny",
    "penny",
    "Penny, a small penguin studying an unfolded paper map",
    "Knows the way, or finds it.",
  ),
} as const;

/** Sprout is the Life Finance mascot used on brand and empty-state surfaces. */
export const MASCOT: CharacterArt = {
  name: "Sprout",
  src: "/assets/characters/sprout/reference/sprout-main.png",
  alt: "Sprout, a round green sprout chick wearing a gold dollar-sign chain",
  tagline: "Small seed, serious growth.",
  width: PORTRAIT_WIDTH,
  height: PORTRAIT_HEIGHT,
};

/** Penny guides wayfinding surfaces such as the not-found page. */
export const NAVIGATOR: CharacterArt = CHARACTERS.penny;

const PERSONA_CHARACTERS: Record<PlayerPresetId, CharacterArt> = {
  software: CHARACTERS.bengo,
  nurse: CHARACTERS.buddi,
  teacher: CHARACTERS.froggy,
  established: CHARACTERS.richie,
};

export function personaCharacter(presetId: PlayerPresetId): CharacterArt {
  return PERSONA_CHARACTERS[presetId];
}
