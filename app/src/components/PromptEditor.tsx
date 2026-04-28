import { useState } from 'react';
import { DEFAULT_PROMPT } from '../runner/prompt';

interface Props {
  prompt: string;
  onChange: (p: string) => void;
}

export function PromptEditor({ prompt, onChange }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <section style={{ border: '1px solid #ccc', borderRadius: 8, padding: 12, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => setOpen(!open)}>
          פרומפט {open ? '▾' : '▸'}
        </button>
        {open && (
          <button onClick={() => onChange(DEFAULT_PROMPT)}>איפוס לברירת מחדל</button>
        )}
      </div>
      {open && (
        <textarea
          value={prompt}
          onChange={(e) => onChange(e.target.value)}
          rows={20}
          style={{ width: '100%', marginTop: 8, fontFamily: 'monospace', direction: 'rtl' }}
        />
      )}
    </section>
  );
}
