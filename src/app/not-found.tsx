import Link from "next/link";

export default function NotFound() {
  return (
    <section className="not-found">
      <p>Route not found</p>
      <h1>This journey is not mapped yet.</h1>
      <Link className="primary-link" href="/">
        Return to the repository map
      </Link>
    </section>
  );
}
