# ADR 0002: UI stack — shadcn/ui tokens, dark default, TailAdmin-style admin

- Status: Accepted
- Date: 2026-10-29

## Context

The first UI used raw Tailwind `neutral-*` classes. The public page is a portfolio piece and should look premium, support dark mode (default) and stay light: the page is statically cached and must not grow its JS much.

## Decision

1. **shadcn/ui as source, not as a dependency.** Only the primitives in use (Button, Card, Input, Textarea, Label, Badge) live in `src/components/ui`. Colours come from shadcn's neutral CSS variables, so the palette is monochrome and a brand accent is one `--primary` change.
2. **No Radix.** None of the primitives need it. Links use `buttonVariants()` instead of `asChild`. Add Radix only when a component needs focus management (dialog, menu).
3. **Theme via `next-themes`** (~2 KB): class strategy, `defaultTheme="dark"`, system preference ignored, choice kept in localStorage. Its inline script sets the class before paint, so the cached HTML works for both themes without a flash.
4. **Public page follows precedent's look** (gradient hero, rounded cards, fade-up) with CSS keyframes instead of Framer Motion.
5. **Admin follows TailAdmin's layout** (sidebar, header, metric cards, table), rebuilt on the same tokens. The template is not vendored; its charts, maps and calendar are not needed.
6. **Font:** Geist via `next/font` (self-hosted at build, no runtime request).

## Consequences

- New dependencies: `next-themes`, `class-variance-authority`, `clsx`, `tailwind-merge` (all small, all used by shadcn).
- Components read semantic tokens (`bg-card`, `text-muted-foreground`), so theme changes need no component edits.
- Users with JS disabled see the dark theme.
