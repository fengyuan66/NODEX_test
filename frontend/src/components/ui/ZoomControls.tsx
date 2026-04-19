import { useGraphStore } from '../../store/graphStore';

interface ZoomControlsProps {
  onRecenter: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

export default function ZoomControls({ onRecenter, onZoomIn, onZoomOut }: ZoomControlsProps) {
  const { currentScale } = useGraphStore();

  return (
    <div id="zoom-controls">
      <button className="zoom-btn" id="recenter-btn" title="Recenter view" style={{ fontSize: '11px' }} onClick={onRecenter}>⊙</button>
      <button className="zoom-btn" id="zoom-in-btn" onClick={onZoomIn}>+</button>
      <div id="zoom-label">{Math.round(currentScale * 100)}%</div>
      <button className="zoom-btn" id="zoom-out-btn" onClick={onZoomOut}>−</button>
    </div>
  );
}
