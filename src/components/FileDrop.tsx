import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

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
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-card px-6 py-8 text-center text-sm shadow-sm transition-colors',
        hover
          ? 'border-solid border-primary bg-accent text-accent-foreground'
          : 'border-input hover:bg-accent/40',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      <Upload className="size-6 text-muted-foreground" />
      {file ? (
        <div>
          <strong className="font-semibold">{file.name}</strong>
          {pageCount !== null && (
            <span className="text-muted-foreground"> · {pageCount} עמודים</span>
          )}
        </div>
      ) : (
        <div className="text-muted-foreground">גרור PDF לכאן או לחץ לבחירה</div>
      )}
    </div>
  );
}
