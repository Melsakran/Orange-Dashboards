import { useSyncExternalStore } from "react";
import { wallClockNow } from "@/lib/ops/analytics";

let clientNowMs: number | null = null;

function subscribeToNow() {
  return () => undefined;
}

function getClientNow() {
  clientNowMs ??= wallClockNow();
  return clientNowMs;
}

function getServerNow() {
  return null;
}

/** Wall-clock "now" in ms; null during server render so hydration matches. */
export function useClientNow(): number | null {
  return useSyncExternalStore(subscribeToNow, getClientNow, getServerNow);
}
