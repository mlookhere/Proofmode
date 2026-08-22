"use client";

import { useEffect } from "react";

export function AnalyticsBeacon({ eventName, source, properties = {} }: { eventName: string; source: string; properties?: Record<string, string | number | boolean | null> }) {
  useEffect(() => {
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventName, source, properties }),
      keepalive: true
    });
  }, [eventName, source, properties]);
  return null;
}
