// EE Jobs Radar dashboard. Server component — reads the JSON file at request time.
//
// Filtering by sector is handled via search params: /?sector=defense
// In Next 16 the App Router gives `searchParams` as a Promise on every page,
// so we await it before reading values.

import { loadPostings, loadCompanies } from "@/lib/storage";
import type { Posting, Sector } from "@/lib/types";
import Link from "next/link";

const SECTORS: Sector[] = [
  "aero",
  "defense",
  "chips",
  "auto",
  "marine",
  "engines",
];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ sector?: string; show?: string }>;
}) {
  const params = await searchParams;
  const sectorFilter = params.sector as Sector | undefined;
  // `show=all` reveals every scraped posting — useful for debugging classifier.
  // Default view shows only Summer 2027 + EE matches (the alert-worthy ones).
  const showAll = params.show === "all";

  // Load both files in parallel so first paint isn't blocked twice.
  const [allPostings, companies] = await Promise.all([
    loadPostings(),
    loadCompanies(),
  ]);

  // Apply filters in order: matched-only → sector → newest first.
  let postings: Posting[] = allPostings;
  if (!showAll) {
    postings = postings.filter((p) => p.isSummer2027 && p.isEE);
  }
  if (sectorFilter) {
    postings = postings.filter((p) => p.sector === sectorFilter);
  }
  postings = postings.sort((a, b) =>
    b.firstSeenAt.localeCompare(a.firstSeenAt)
  );

  // Counts per sector so the user can see breadth at a glance.
  const sectorCounts: Record<Sector, number> = {
    aero: 0,
    defense: 0,
    chips: 0,
    auto: 0,
    marine: 0,
    engines: 0,
  };
  const matchPool = showAll
    ? allPostings
    : allPostings.filter((p) => p.isSummer2027 && p.isEE);
  for (const p of matchPool) sectorCounts[p.sector]++;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          EE Jobs Radar
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Tracking {companies.length} companies for Summer 2027 EE internships ·{" "}
          {matchPool.length} match{matchPool.length === 1 ? "" : "es"} so far
        </p>
      </header>

      <nav className="mb-8 flex flex-wrap gap-2 text-sm">
        <FilterPill
          href={showAll ? "/?show=all" : "/"}
          active={!sectorFilter}
          label={`All (${matchPool.length})`}
        />
        {SECTORS.map((s) => (
          <FilterPill
            key={s}
            href={
              showAll ? `/?sector=${s}&show=all` : `/?sector=${s}`
            }
            active={sectorFilter === s}
            label={`${s} (${sectorCounts[s]})`}
          />
        ))}
        <span className="ml-auto self-center text-xs text-zinc-500">
          <Link
            href={showAll ? "/" : "/?show=all"}
            className="underline underline-offset-2 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            {showAll ? "show only matches" : "show all (debug)"}
          </Link>
        </span>
      </nav>

      {postings.length === 0 ? (
        <EmptyState showAll={showAll} sectorFilter={sectorFilter} />
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {postings.map((p) => (
            <PostingRow key={p.id} posting={p} />
          ))}
        </ul>
      )}
    </main>
  );
}

function FilterPill({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  // Conditional classes via template string. Could pull in `clsx` for this,
  // but for one place it's not worth the dependency.
  const base =
    "rounded-full border px-3 py-1 capitalize transition-colors";
  const activeStyles =
    "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900";
  const inactiveStyles =
    "border-zinc-200 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900";
  return (
    <Link href={href} className={`${base} ${active ? activeStyles : inactiveStyles}`}>
      {label}
    </Link>
  );
}

function PostingRow({ posting }: { posting: Posting }) {
  return (
    <li className="py-4">
      <a
        href={posting.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block hover:opacity-80"
      >
        <div className="flex items-baseline justify-between gap-4">
          <div className="font-medium text-zinc-900 dark:text-zinc-100">
            {posting.title}
          </div>
          <div className="shrink-0 text-xs text-zinc-500">
            {formatRelative(posting.firstSeenAt)}
          </div>
        </div>
        <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          <span className="font-medium">{posting.company}</span>
          <span className="mx-2 text-zinc-300 dark:text-zinc-600">·</span>
          <span className="capitalize">{posting.sector}</span>
          <span className="mx-2 text-zinc-300 dark:text-zinc-600">·</span>
          <span>{posting.location || "Location not listed"}</span>
          {(!posting.isSummer2027 || !posting.isEE) && (
            <span className="ml-2 rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300">
              {!posting.isSummer2027 ? "not Summer 2027" : "non-EE"}
            </span>
          )}
        </div>
      </a>
    </li>
  );
}

function EmptyState({
  showAll,
  sectorFilter,
}: {
  showAll: boolean;
  sectorFilter: Sector | undefined;
}) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
      <p className="text-zinc-600 dark:text-zinc-400">
        {showAll
          ? sectorFilter
            ? `No postings yet in ${sectorFilter}.`
            : "No postings scraped yet — the next hourly run will populate this."
          : sectorFilter
          ? `No Summer 2027 EE matches in ${sectorFilter} yet.`
          : "No Summer 2027 EE matches yet — these usually start showing up in late summer / early fall."}
      </p>
    </div>
  );
}

// Quick relative-time formatter so each row can show "2h ago" without a lib.
function formatRelative(iso: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
