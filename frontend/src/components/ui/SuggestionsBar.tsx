import React from 'react';

interface SuggestionsBarProps {
  suggestions: string[];
  onSelect: (text: string) => void;
}

export default function SuggestionsBar({ suggestions, onSelect }: SuggestionsBarProps) {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div id="suggestions-bar">
      {suggestions.map((s, i) => (
        <button
          key={i}
          className="suggestion-btn"
          onClick={() => onSelect(s)}
          title={s}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
