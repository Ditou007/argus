import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { useInfiniteScroll } from "./use-infinite-scroll.js";

// jsdom has no IntersectionObserver — install a controllable fake.
let lastCallback: IntersectionObserverCallback | null = null;
const observe = vi.fn();
const disconnect = vi.fn();

beforeEach(() => {
  lastCallback = null;
  observe.mockClear();
  disconnect.mockClear();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).IntersectionObserver = vi.fn((cb: IntersectionObserverCallback) => {
    lastCallback = cb;
    return { observe, disconnect, unobserve: vi.fn(), takeRecords: vi.fn() };
  });
});

const Harness = ({ onLoadMore, enabled }: { onLoadMore: () => void; enabled: boolean }) => {
  const ref = useInfiniteScroll(onLoadMore, enabled);
  return <div ref={ref} />;
};

const intersect = (isIntersecting: boolean) =>
  lastCallback?.([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);

describe("useInfiniteScroll", () => {
  it("observes the sentinel and calls onLoadMore when it intersects", () => {
    const onLoadMore = vi.fn();
    render(<Harness onLoadMore={onLoadMore} enabled />);
    expect(observe).toHaveBeenCalledTimes(1);
    intersect(true);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("does not call onLoadMore when the sentinel is not intersecting", () => {
    const onLoadMore = vi.fn();
    render(<Harness onLoadMore={onLoadMore} enabled />);
    intersect(false);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("does not observe when disabled (no more data / loading)", () => {
    render(<Harness onLoadMore={vi.fn()} enabled={false} />);
    expect(observe).not.toHaveBeenCalled();
  });
});
