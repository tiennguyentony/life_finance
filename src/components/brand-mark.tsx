/**
 * Inline sprout mark so the brand renders crisply at any size without an
 * image request. Colors track the theme through the accent tokens.
 */
export function BrandMark({ size = 22 }: Readonly<{ size?: number }>) {
  return (
    <svg
      aria-hidden="true"
      className="brand-mark"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <path
        d="M12 14C12 9.2 8.8 6 4.2 6C4.2 10.8 7.4 14 12 14Z"
        fill="var(--accent-bright)"
      />
      <path
        d="M12 14C12 9.2 15.2 6 19.8 6C19.8 10.8 16.6 14 12 14Z"
        fill="var(--accent)"
      />
      <path
        d="M12 13.5V20.5"
        stroke="var(--accent)"
        strokeLinecap="round"
        strokeWidth="2.4"
      />
    </svg>
  );
}
