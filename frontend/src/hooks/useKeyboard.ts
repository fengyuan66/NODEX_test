import { useEffect } from 'react';
import { useGraphStore } from '../store/graphStore';

export function useKeyboard(
  onLinkSelected: () => void,
  onSplitSelected: () => void,
  onGroupTrigger: () => void,
) {
  const { undo, redo } = useGraphStore();

  useEffect(() => {
    const isMac = navigator.platform.toUpperCase().includes('MAC');

    const onKeyDown = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }

      const active = document.activeElement;
      const inInput = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' ||
        (active as HTMLElement)?.contentEditable === 'true';
      if (inInput || mod) return;

      if (e.key === 'l' || e.key === 'L') { e.preventDefault(); onLinkSelected(); }
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); onSplitSelected(); }
      if (e.key === 'g' || e.key === 'G') { e.preventDefault(); onGroupTrigger(); }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, onLinkSelected, onSplitSelected, onGroupTrigger]);
}
