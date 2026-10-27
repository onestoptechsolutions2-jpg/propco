import Link from "next/link";
import { PAGE_SIZE } from "@/lib/paging";

/** Previous / next links for a long list. Renders nothing when everything fits on one page. */
export function Pager({ basePath, page, total }: { basePath: string; page: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  const href = (p: number) => (p === 1 ? basePath : `${basePath}?page=${p}`);
  const link = "rounded border border-border px-3 py-1.5 text-sm text-ink hover:bg-background";
  return (
    <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pages">
      {page > 1 ? <Link href={href(page - 1)} className={link}>← Newer</Link> : <span />}
      <span className="text-muted">Page {page} of {pages}</span>
      {page < pages ? <Link href={href(page + 1)} className={link}>Older →</Link> : <span />}
    </nav>
  );
}
