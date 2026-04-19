import { useGraphStore } from '../../store/graphStore';

interface LinkLayerProps {
  onDeleteLink?: (id: number) => void;
}

export default function LinkLayer({ onDeleteLink }: LinkLayerProps) {
  const { nodes, links, groups, currentScale } = useGraphStore();
  const strokeW = Math.max(1.2, 1.0 / currentScale);

  return (
    <svg
      id="link-layer"
      style={{ position: 'absolute', width: '100%', height: '100%', top: 0, left: 0, pointerEvents: 'auto', overflow: 'visible' }}
      onClick={e => {
        const target = e.target as SVGElement;
        if (target.tagName === 'line' && target.classList.contains('edge') && (e.nativeEvent as MouseEvent).shiftKey) {
          const id = parseInt(target.dataset.id || '0', 10);
          if (onDeleteLink) onDeleteLink(id);
        }
      }}
    >
      {links.map(l => {
        const a = nodes.find(n => n.id === l.sourceId);
        const b = nodes.find(n => n.id === l.targetId);
        if (!a || !b) return null;
        const aGroup = a.groupId !== undefined ? groups.find(g => g.id === a.groupId) : undefined;
        const bGroup = b.groupId !== undefined ? groups.find(g => g.id === b.groupId) : undefined;
        if (aGroup?.collapsed || bGroup?.collapsed) return null;
        return (
          <line
            key={l.id}
            className="edge"
            data-id={l.id}
            x1={a.x + 5} y1={a.y + 5}
            x2={b.x + 5} y2={b.y + 5}
            stroke="rgba(124,58,237,0.35)"
            strokeWidth={strokeW}
            style={{ cursor: 'pointer' }}
          />
        );
      })}
    </svg>
  );
}
