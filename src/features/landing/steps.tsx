import { Reveal } from "@/components/shared/reveal";

const STEPS = [
  { n: "01", title: "Choose your level", body: "Beginner, Intermediate or Advanced. The numbers stay the same; the explanation changes." },
  { n: "02", title: "Drop a screenshot", body: "A brokerage positions screen is enough. Tickers and share counts are read; the image is never stored." },
  { n: "03", title: "Look through it", body: "X-Ray, Shock Test, Filing Radar and IC Room, all on the portfolio you already hold." },
];

// White band in the "Featured stories" rhythm: eyebrow, serif title, then three columns ruled from above.
export function Steps() {
  return (
    <section className="border-t border-border bg-bg py-28 lg:py-36">
      <div className="bx-container">
        <Reveal>
          <p className="eyebrow">How it works</p>
          <h2 className="display mt-10 text-[44px] leading-[1.15] text-text sm:text-[48px]">Three steps, about a minute</h2>
        </Reveal>
        <ol className="mt-16 grid gap-12 md:grid-cols-3 md:gap-8">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.1}>
              <li className="border-t border-text pt-8">
                <p className="display text-[56px] leading-none text-text tabular-nums">{s.n}</p>
                <h3 className="mt-8 text-[20px] font-normal text-text">{s.title}</h3>
                <p className="mt-3 max-w-[34ch] text-[16px] leading-[1.6] text-text-muted">{s.body}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
