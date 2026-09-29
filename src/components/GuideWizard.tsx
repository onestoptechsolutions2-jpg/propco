"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Guide, Progress } from "@/app/(app)/guide/guides";

const KEY = "propco-guide-done";

function load(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function GuideWizard({
  guides,
  progress,
  initialGuide,
}: {
  guides: Guide[];
  progress: Progress;
  initialGuide?: string;
}) {
  const [guideId, setGuideId] = useState<string | null>(
    guides.find((g) => g.id === initialGuide)?.id ?? null
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [manual, setManual] = useState<Record<string, boolean>>({});

  // Read saved ticks after mount (localStorage doesn't exist during SSR).
  useEffect(() => {
    const t = setTimeout(() => setManual(load()), 0);
    return () => clearTimeout(t);
  }, []);

  const isDone = (guide: Guide, i: number) => {
    const step = guide.steps[i];
    return (step.auto && progress[step.auto]) || manual[`${guide.id}:${step.id}`] === true;
  };

  function toggle(guide: Guide, i: number) {
    const k = `${guide.id}:${guide.steps[i].id}`;
    const next = { ...manual, [k]: !manual[k] };
    setManual(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }

  const guide = guides.find((g) => g.id === guideId);

  if (!guide) {
    return (
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {guides.map((g) => {
          const done = g.steps.filter((_, i) => isDone(g, i)).length;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                setGuideId(g.id);
                const first = g.steps.findIndex((_, i) => !isDone(g, i));
                setStepIndex(first === -1 ? 0 : first);
              }}
              className="rounded-lg border border-border bg-surface p-5 text-left transition hover:border-ink"
            >
              <p className="font-serif text-lg text-ink">{g.title}</p>
              <p className="mt-1 text-sm text-muted">{g.summary}</p>
              <p className="mt-4 text-xs font-medium text-accent">
                {done === g.steps.length ? "All done ✓" : `${done} of ${g.steps.length} steps done`}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded bg-background">
                <div className="h-full bg-accent" style={{ width: `${(done / g.steps.length) * 100}%` }} />
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  const step = guide.steps[stepIndex];
  const done = isDone(guide, stepIndex);
  const auto = !!(step.auto && progress[step.auto]);
  const last = stepIndex === guide.steps.length - 1;

  return (
    <div className="mt-6 max-w-2xl">
      <button type="button" onClick={() => setGuideId(null)} className="text-sm text-muted hover:underline">
        ← All guides
      </button>
      <h2 className="mt-3 font-serif text-2xl text-ink">{guide.title}</h2>

      <ol className="mt-4 flex gap-1.5" aria-label="Steps">
        {guide.steps.map((s, i) => (
          <li key={s.id} className="flex-1">
            <button
              type="button"
              onClick={() => setStepIndex(i)}
              aria-label={`Step ${i + 1}: ${s.title}`}
              className={`h-2 w-full rounded ${
                i === stepIndex ? "bg-ink" : isDone(guide, i) ? "bg-accent" : "bg-border"
              }`}
            />
          </li>
        ))}
      </ol>

      <div className="mt-5 rounded-lg border border-border bg-surface p-6">
        <p className="text-xs uppercase tracking-wide text-muted">
          Step {stepIndex + 1} of {guide.steps.length}
        </p>
        <h3 className="mt-1 font-serif text-xl text-ink">{step.title}</h3>
        <p className="mt-3 text-sm text-foreground">{step.why}</p>
        <ul className="mt-4 flex flex-col gap-2 text-sm text-foreground">
          {step.how.map((h, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent-light text-xs font-medium text-accent">
                {i + 1}
              </span>
              <span>{h}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href={step.href}
            className="rounded bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-ink-light"
          >
            {step.cta}
          </Link>
          {auto ? (
            <span className="text-sm font-medium text-accent">✓ Done — we spotted this already</span>
          ) : (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={done} onChange={() => toggle(guide, stepIndex)} className="h-4 w-4" />
              I&apos;ve done this
            </label>
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-between">
        <button
          type="button"
          disabled={stepIndex === 0}
          onClick={() => setStepIndex(stepIndex - 1)}
          className="rounded border border-border px-4 py-2 text-sm disabled:opacity-40"
        >
          Back
        </button>
        {last ? (
          <button
            type="button"
            onClick={() => setGuideId(null)}
            className="rounded border border-border px-4 py-2 text-sm font-medium hover:border-ink"
          >
            Finish
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStepIndex(stepIndex + 1)}
            className="rounded border border-border px-4 py-2 text-sm font-medium hover:border-ink"
          >
            Next step
          </button>
        )}
      </div>
    </div>
  );
}
