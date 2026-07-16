import Image from "next/image";
import Link from "next/link";

import { NAVIGATOR } from "@/features/play/persona-art";

export default function NotFound() {
  return (
    <section className="not-found">
      <Image
        alt={NAVIGATOR.alt}
        className="not-found-portrait"
        height={NAVIGATOR.height}
        sizes="180px"
        src={NAVIGATOR.src}
        width={NAVIGATOR.width}
      />
      <h1>This journey is not mapped yet.</h1>
      <p>Penny checked the map twice. There is no page here.</p>
      <Link className="btn btn-primary" href="/">
        Head back home
      </Link>
    </section>
  );
}
