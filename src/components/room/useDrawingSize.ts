import { useLayoutEffect, useRef, useState } from 'react';

export function useDrawingSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 400, height: 300 });
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, []);
  return { ref, ...size };
}
