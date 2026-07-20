"use client";

import Image from "next/image";

import type { CharacterBanter } from "@/features/banter/character-banter";

type Props = Readonly<{
  banter: CharacterBanter;
  onDismiss: () => void;
}>;

/**
 * A non-blocking character message shown after an occasional completed month.
 * Its content is derived from the engine-owned result; this component is
 * presentation-only and cannot alter balances or game flow.
 */
export function HqCharacterBanter({ banter, onDismiss }: Props) {
  return (
    <aside
      aria-live="polite"
      className="hq-banter"
      data-tone={banter.tone}
      role="status"
    >
      <Image
        alt=""
        className="hq-banter-avatar"
        height={58}
        src={banter.characterSrc}
        unoptimized
        width={58}
      />
      <div className="hq-banter-copy">
        <strong>{banter.characterName}</strong>
        <p>“{banter.message}”</p>
      </div>
      <button
        aria-label={`Dismiss ${banter.characterName}'s message`}
        className="hq-banter-close"
        onClick={onDismiss}
        type="button"
      >
        ×
      </button>
    </aside>
  );
}
