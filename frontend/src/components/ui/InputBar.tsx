import React, { useState, useRef, useEffect } from 'react';

const SLASH_COMMANDS = [
  { cmd: '/find',   desc: 'Scroll to the most relevant node',  argHint: '/find ' },
  { cmd: '/delete', desc: 'Delete: all | last | prompts',       argHint: '/delete ' },
  { cmd: '/undo',   desc: 'Undo last action',                   argHint: '/undo' },
  { cmd: '/redo',   desc: 'Redo last undone action',            argHint: '/redo' },
];

interface InputBarProps {
  onSend: (text: string) => void;
  onTextChange?: (text: string) => void;
}

export default function InputBar({ onSend, onTextChange }: InputBarProps) {
  const [text, setText] = useState('');
  const [slashActive, setSlashActive] = useState(false);
  const [slashIdx, setSlashIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const filteredCmds = text.startsWith('/') && !text.includes(' ')
    ? SLASH_COMMANDS.filter(c => c.cmd.startsWith(text))
    : [];

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
    onTextChange?.(text);
    if (text.startsWith('/') && !text.includes(' ') && filteredCmds.length > 0) {
      setSlashActive(true);
    } else {
      setSlashActive(false);
      setSlashIdx(0);
    }
  }, [text]);

  const doSend = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashActive && filteredCmds.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIdx(i => Math.min(i + 1, filteredCmds.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter') { e.preventDefault(); setText(filteredCmds[slashIdx].argHint); setSlashActive(false); return; }
      if (e.key === 'Escape') { setSlashActive(false); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  };

  return (
    <div id="input-bar">
      {slashActive && filteredCmds.length > 0 && (
        <div id="slash-popup" className="visible">
          {filteredCmds.map((c, i) => (
            <div
              key={c.cmd}
              className={`slash-item${i === slashIdx ? ' active' : ''}`}
              onClick={() => { setText(c.argHint); setSlashActive(false); textareaRef.current?.focus(); }}
            >
              <span className="slash-item-cmd">{c.cmd}</span>
              <span className="slash-item-desc">{c.desc}</span>
            </div>
          ))}
        </div>
      )}
      <textarea
        id="prompt"
        ref={textareaRef}
        rows={1}
        placeholder="Ask anything. Type / for commands..."
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <button id="send-btn" title="Send (Enter)" onClick={doSend}>↑</button>
    </div>
  );
}
