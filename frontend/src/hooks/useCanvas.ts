import { useCallback, useRef } from 'react';
import { useGraphStore } from '../store/graphStore';

const CANVAS_W = 8000;
const CANVAS_H = 8000;
const ORIGIN_X = 3000;
const ORIGIN_Y = 3000;
const MIN_SCALE = 0.1;
const MAX_SCALE = 4.0;

export function useCanvas(wrapperRef: React.RefObject<HTMLDivElement | null>) {
  const { currentScale, setScale } = useGraphStore();
  const scaleRef = useRef(currentScale);
  scaleRef.current = currentScale;

  const clientToCanvas = useCallback((clientX: number, clientY: number) => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return { x: 0, y: 0 };
    const rect = wrapper.getBoundingClientRect();
    return {
      x: (clientX - rect.left + wrapper.scrollLeft) / scaleRef.current,
      y: (clientY - rect.top + wrapper.scrollTop) / scaleRef.current,
    };
  }, [wrapperRef]);

  const applyZoom = useCallback((newScale: number, pivotX?: number, pivotY?: number) => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
    const oldScale = scaleRef.current;
    if (Math.abs(newScale - oldScale) < 0.001) return;

    const px = pivotX ?? wrapper.clientWidth / 2;
    const py = pivotY ?? wrapper.clientHeight / 2;
    const worldX = (wrapper.scrollLeft + px) / oldScale;
    const worldY = (wrapper.scrollTop + py) / oldScale;

    setScale(newScale);
    scaleRef.current = newScale;

    requestAnimationFrame(() => {
      if (!wrapper) return;
      wrapper.scrollLeft = worldX * newScale - px;
      wrapper.scrollTop = worldY * newScale - py;
    });
  }, [wrapperRef, setScale]);

  const smartRecenter = useCallback((animate = true) => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const { nodes, groups } = useGraphStore.getState();
    const pts: { x: number; y: number; w: number; h: number }[] = [];

    nodes.forEach(n => {
      const g = n.groupId !== undefined ? groups.find(x => x.id === n.groupId) : undefined;
      if (g?.collapsed) return;
      pts.push({ x: n.x, y: n.y, w: 150, h: 50 });
    });
    groups.forEach(g => {
      if (g.collapsed && g.collapsedX != null && g.collapsedY != null) {
        pts.push({ x: g.collapsedX, y: g.collapsedY, w: g.collapsedW || 160, h: g.collapsedH || 60 });
      }
    });

    if (!pts.length) {
      wrapper.scrollTo({
        left: (ORIGIN_X - wrapper.clientWidth / 2) * scaleRef.current,
        top: (ORIGIN_Y - wrapper.clientHeight / 2) * scaleRef.current,
        behavior: animate ? 'smooth' : 'instant',
      });
      return;
    }

    const minX = Math.min(...pts.map(p => p.x));
    const maxX = Math.max(...pts.map(p => p.x + p.w));
    const minY = Math.min(...pts.map(p => p.y));
    const maxY = Math.max(...pts.map(p => p.y + p.h));
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    const PAD = 80;
    const fitScale = Math.min(
      Math.max(
        Math.min(
          wrapper.clientWidth / (maxX - minX + PAD * 2),
          wrapper.clientHeight / (maxY - minY + PAD * 2)
        ) * 0.88,
        MIN_SCALE
      ),
      MAX_SCALE
    );
    applyZoom(fitScale, wrapper.clientWidth / 2, wrapper.clientHeight / 2);
    setTimeout(() => {
      wrapper.scrollTo({
        left: midX * fitScale - wrapper.clientWidth / 2,
        top: midY * fitScale - wrapper.clientHeight / 2,
        behavior: animate ? 'smooth' : 'instant',
      });
    }, 30);
  }, [wrapperRef, applyZoom]);

  const initCanvas = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    wrapper.scrollLeft = (ORIGIN_X - wrapper.clientWidth / 2) * scaleRef.current;
    wrapper.scrollTop = (ORIGIN_Y - wrapper.clientHeight / 2) * scaleRef.current;
  }, [wrapperRef]);

  return { applyZoom, smartRecenter, clientToCanvas, initCanvas, CANVAS_W, CANVAS_H, ORIGIN_X, ORIGIN_Y };
}
