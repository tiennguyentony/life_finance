import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { CHARACTERS, MASCOT } from "@/features/play/persona-art";

export const metadata: Metadata = {
  title: "Brightwater City",
  description:
    "A financial life game: fifteen months, five decisions, one new grad.",
};

const BUBBLES = [
  { art: CHARACTERS.buddi, className: "bubble-a" },
  { art: MASCOT, className: "bubble-b" },
  { art: CHARACTERS.froggy, className: "bubble-c" },
  { art: CHARACTERS.richie, className: "bubble-d" },
  { art: CHARACTERS.penny, className: "bubble-e" },
] as const;

export default function GameTitlePage() {
  return (
    <section className="game-title-hero">
      {BUBBLES.map(({ art, className }) => (
        <Image
          alt=""
          className={`title-bubble ${className}`}
          height={art.height}
          key={className}
          sizes="110px"
          src={art.src}
          width={art.width}
        />
      ))}
      <div className="title-card">
        <p className="title-brand">
          <BrandMark size={20} />
          Life Finance presents
        </p>
        <h1>Brightwater City</h1>
        <p className="title-sub">
          Fresh diploma. Big city. Fifteen months of rent, rides, surprises,
          and one bonus check. Five decisions stand between you and a life
          that pays for itself.
        </p>
        <Link className="btn btn-primary btn-lg title-play" href="/game/play">
          Play
        </Link>
        <ul className="title-facts">
          <li>5 decisions</li>
          <li>3 options each</li>
          <li>243 possible futures</li>
        </ul>
      </div>
    </section>
  );
}
