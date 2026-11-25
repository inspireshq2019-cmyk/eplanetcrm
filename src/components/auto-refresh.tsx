"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Reloads the page's data every so often while it is on screen (e.g. reception's check-in queue). */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible" && !document.querySelector("form input:focus, form select:focus")) router.refresh(); }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
