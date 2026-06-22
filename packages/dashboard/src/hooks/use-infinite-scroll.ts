import { useEffect, useRef, type RefObject } from "react";

/**
 * Infinite scroll: invoke `onLoadMore` when the returned sentinel element
 * scrolls into view. Observing is gated by `enabled` (pass `hasMore && !loading`)
 * so it stops at the end of the data and never fires concurrent loads.
 * @function useInfiniteScroll
 * @param onLoadMore - loader to run when the sentinel becomes visible (memoize it)
 * @param enabled - whether to observe the sentinel
 * @returns a ref to attach to the sentinel element
 */
export const useInfiniteScroll = (
  onLoadMore: () => void,
  enabled: boolean
): RefObject<HTMLDivElement> => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, onLoadMore]);
  return ref;
};
