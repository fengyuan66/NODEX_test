import React from 'react';

interface LassoBoxProps {
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
}

export default function LassoBox({ x, y, w, h, visible }: LassoBoxProps) {
  if (!visible) return null;
  return (
    <div
      id="lasso-box"
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        display: 'block',
      }}
    />
  );
}
