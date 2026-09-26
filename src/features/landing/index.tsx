"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Wordmark } from "@/components/shared/lens-mark";
import { Hero } from "./hero";
import { Pillars } from "./pillars";
import { TryDemoLink } from "./try-demo-link";

export function Landing() {
  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="mx-auto flex min-h-dvh max-w-[1200px] flex-col px-6 sm:px-8"
    >
      <header className="flex h-16 items-center justify-between">
        <Link href="/" className="rounded-md">
          <Wordmark />
        </Link>
        <TryDemoLink variant="nav" />
      </header>

      <Hero />
      <Pillars />

      <footer className="mt-auto flex flex-wrap gap-x-6 gap-y-2 border-t border-border py-8 text-[12px] text-text-subtle">
        <span>Built at ShellHacks 2026</span>
        <span>Educational tool, not investment advice.</span>
      </footer>
    </motion.main>
  );
}
