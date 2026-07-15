import Image from "next/image";
import Link from "next/link";

export function Landing() {
  return (
    <div className="splash-screen">
      <Image
        alt="Life Finance title screen with Sprout holding a money gun in a colorful financial world"
        className="splash-art"
        fill
        priority
        sizes="100vw"
        src="/assets/game/landing-title-screen.png"
        unoptimized
      />
      <Link aria-label="Play Life Finance" className="splash-play-hit" href="/start">
        <span>Play Life Finance</span>
      </Link>
    </div>
  );
}
