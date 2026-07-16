/**
 * Character portraits for Brightwater City. Deliberately self-contained
 * (no dependency on src/features/play/) so this feature never breaks when
 * the play console's own character system changes.
 */

export type CharacterArt = Readonly<{
  name: string;
  src: string;
  alt: string;
  width: number;
  height: number;
}>;

const PORTRAIT_WIDTH = 1536;
const PORTRAIT_HEIGHT = 1024;

function character(name: string, folder: string, alt: string): CharacterArt {
  return {
    name,
    src: `/assets/characters/${folder}/${folder}-base.png`,
    alt,
    width: PORTRAIT_WIDTH,
    height: PORTRAIT_HEIGHT,
  };
}

/** Buddi plays the lead role: the new grad stepping off the train. */
export const PLAYER = character(
  "Buddi",
  "buddi",
  "Buddi, a cheerful friend in a purple hoodie waving hello while holding a notebook",
);

export const MASCOT: CharacterArt = {
  name: "Sprout",
  src: "/assets/characters/sprout/reference/sprout-main.png",
  alt: "Sprout, a round green sprout chick wearing a gold dollar-sign chain",
  width: PORTRAIT_WIDTH,
  height: PORTRAIT_HEIGHT,
};
