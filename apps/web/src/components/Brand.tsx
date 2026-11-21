/** AEGIS shield mark (decorative; the product name is always written next to it). */
export function ShieldMark({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.8 4.5 5.6v5.6c0 4.6 3.1 8.6 7.5 9.9 4.4-1.3 7.5-5.3 7.5-9.9V5.6L12 2.8Z" />
      <path d="m8.6 12.1 2.4 2.4 4.6-4.9" />
    </svg>
  )
}
