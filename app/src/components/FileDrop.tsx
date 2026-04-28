import { useRef, useState } from 'react';

interface Props {
  file: File | null;
  pageCount: number | null;
  onFile: (file: File) => void;
}

export function FileDrop({ file, pageCount, onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setHover(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.type === 'application/pdf') onFile(f);
  };

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${hover ? '#3a7' : '#aaa'}`,
        borderRadius: 8,
        padding: 24,
        textAlign: 'center',
        cursor: 'pointer',
        marginBottom: 12,
        background: hover ? '#f0fff4' : '#fff',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      {file ? (
        <div>
          <strong>{file.name}</strong>
          {pageCount !== null && <span> · {pageCount} עמודים</span>}
        </div>
      ) : (
        <div>גרור PDF לכאן או לחץ לבחירה</div>
      )}
    </section>
  );
}
