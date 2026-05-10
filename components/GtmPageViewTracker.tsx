"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { sendGTMEvent } from "@next/third-parties/google";

export default function GtmPageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTrackedRef = useRef<string>("");
  const search = searchParams?.toString() ?? "";

  useEffect(() => {
    const path = pathname || "/";
    const route = search ? `${path}?${search}` : path;
    if (!route || lastTrackedRef.current === route) return;
    lastTrackedRef.current = route;

    sendGTMEvent({
      event: "page_view",
      page_path: path,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [pathname, search]);

  return null;
}

