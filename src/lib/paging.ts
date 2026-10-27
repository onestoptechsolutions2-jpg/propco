export const PAGE_SIZE = 50;

/** Turn the ?page= search param into a safe 1-based page number. */
export function pageNumber(raw: string | undefined) {
  const n = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10_000) : 1;
}

/** Prisma skip/take for a page. */
export const pageArgs = (page: number) => ({ skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE });
