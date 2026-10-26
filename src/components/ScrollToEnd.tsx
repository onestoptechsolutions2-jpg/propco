"use client";

import { useEffect, useRef } from "react";

/** Keeps the newest chat bubble in view, like a messaging app. */
export function ScrollToEnd() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "end" });
  }, []);
  return <div ref={ref} />;
}
