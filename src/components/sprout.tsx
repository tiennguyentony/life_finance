import Image from "next/image";

import type { SproutEmotion } from "@/types/game";

type SproutProps = {
  readonly emotion: SproutEmotion;
  readonly size?: "small" | "medium" | "large";
  readonly variant?: "main" | "money";
  readonly priority?: boolean;
};

const emotionLabel: Record<SproutEmotion, string> = {
  idle: "Sprout waiting patiently",
  thinking: "Sprout thinking very hard",
  happy: "Sprout looking happy",
  cry: "Sprout feeling sad",
  shocked: "Sprout looking shocked",
  celebrate: "Sprout celebrating",
};

export function Sprout({
  emotion,
  size = "medium",
  variant = "main",
  priority = false,
}: SproutProps) {
  return (
    <div className={`sprout sprout-${size} sprout-${emotion}`}>
      <Image
        alt={emotionLabel[emotion]}
        className="sprout-image"
        fetchPriority={priority ? "high" : "auto"}
        fill
        loading="eager"
        sizes={size === "large" ? "(max-width: 800px) 90vw, 620px" : "320px"}
        src={`/assets/characters/sprout/reference/sprout-${variant}.png`}
      />
    </div>
  );
}
