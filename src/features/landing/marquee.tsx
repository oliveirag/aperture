// One long serif line drifting left on the black band. Two copies back to back so the loop is seamless.
// Decorative: hidden from assistive tech; reduced motion freezes it via the global media query.
const LINE = "See what you actually own — ";

export function Marquee() {
  return (
    <section className="theme-dark overflow-hidden pt-8 pb-20">
      <div aria-hidden className="flex w-max animate-[marquee_48s_linear_infinite] select-none">
        {[0, 1].map((copy) => (
          <p key={copy} className="display pr-[0.3em] text-[120px] leading-none whitespace-nowrap text-text sm:text-[168px] lg:text-[200px]">
            {LINE.repeat(2)}
          </p>
        ))}
      </div>
      <p className="bx-container mt-12 text-[13px] text-text-subtle">Investing involves risk, including loss of capital.</p>
    </section>
  );
}
