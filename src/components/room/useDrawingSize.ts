import { useLayoutEffect, useRef, useState } from 'react';

export function useDrawingSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 400, height: 300 });
  useLayoutEffect(() => {
    const paper = ref.current!;
    const measure = ({ width, height }: DOMRectReadOnly) =>
      setSize((prev) => prev.width === width && prev.height === height ? prev : { width, height });
    // Fit before the first paint: a wall must not jump between pointer-down and click.
    measure(paper.getBoundingClientRect());
    const observer = new ResizeObserver(([entry]) => measure(entry.contentRect));
    observer.observe(paper);
    return () => observer.disconnect();
  }, []);
  return { ref, ...size };
}
