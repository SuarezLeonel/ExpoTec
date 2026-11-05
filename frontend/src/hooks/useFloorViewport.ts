/**
 * Hook para la medición reactiva del contenedor del plano de salón.
 *
 * Utiliza `ResizeObserver` para recalcular las dimensiones reales del viewport cuando cambia la vista
 * o se redimensiona la ventana del navegador.
 */

import { useLayoutEffect, useRef, useState } from 'react';

export function useFloorViewport(view: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (!width || !height) return;
      setSize((old) => (old.width === width && old.height === height ? old : { width, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [view]);
  return { ref, size };
}
