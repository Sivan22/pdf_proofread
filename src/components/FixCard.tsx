import { useEffect, useRef, useState } from 'react';
import { Pencil, Trash2, MapPin, Check, X } from 'lucide-react';
import type { ProofErrorRow } from '../runner/orchestrator';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { cn } from '@/lib/utils';

interface Props {
  row: ProofErrorRow;
  selected: boolean;
  reanchoring: boolean;
  onSelect: (id: string) => void;
  onSave: (id: string, patch: { text: string; error: string; fix: string }) => void;
  onDelete: (id: string) => void;
  onStartReanchor: (id: string) => void;
  onCancelReanchor: () => void;
}

const MATCH_LABELS: Record<ProofErrorRow['match'], string> = {
  exact: 'מדויק',
  partial: 'חלקי',
  unmatched: 'ללא עיגון',
};

const MATCH_VARIANTS: Record<
  ProofErrorRow['match'],
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  exact: 'default',
  partial: 'secondary',
  unmatched: 'destructive',
};

export function FixCard({
  row,
  selected,
  reanchoring,
  onSelect,
  onSave,
  onDelete,
  onStartReanchor,
  onCancelReanchor,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(row.text);
  const [draftError, setDraftError] = useState(row.error);
  const [draftFix, setDraftFix] = useState(row.fix);
  const ref = useRef<HTMLDivElement | null>(null);

  // Reset drafts whenever the underlying row identity changes (e.g. re-anchor
  // updates rects elsewhere — text fields stay current).
  useEffect(() => {
    if (!editing) {
      setDraftText(row.text);
      setDraftError(row.error);
      setDraftFix(row.fix);
    }
  }, [row.text, row.error, row.fix, editing]);

  // Scroll selected card into view when it changes from elsewhere (e.g. user
  // clicked a highlight on the PDF).
  useEffect(() => {
    if (selected && ref.current) {
      ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selected]);

  const onCardClick = () => {
    if (editing) return;
    onSelect(row.id);
  };

  const onSubmit = () => {
    onSave(row.id, { text: draftText, error: draftError, fix: draftFix });
    setEditing(false);
  };

  const onCancel = () => {
    setDraftText(row.text);
    setDraftError(row.error);
    setDraftFix(row.fix);
    setEditing(false);
  };

  return (
    <Card
      ref={ref}
      onClick={onCardClick}
      className={cn(
        'cursor-pointer p-3 text-sm transition-colors',
        selected && 'ring-2 ring-primary',
        reanchoring && 'ring-2 ring-amber-500',
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline">עמוד {row.page}</Badge>
          <Badge variant={MATCH_VARIANTS[row.match]}>{MATCH_LABELS[row.match]}</Badge>
        </div>
        <div className="flex items-center gap-1">
          {!editing && !reanchoring && (
            <>
              <Button
                size="icon"
                variant="ghost"
                title="ערוך עיגון בעמוד"
                onClick={(e) => { e.stopPropagation(); onStartReanchor(row.id); }}
              >
                <MapPin className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                title="ערוך טקסט"
                onClick={(e) => { e.stopPropagation(); setEditing(true); }}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                title="מחק"
                onClick={(e) => { e.stopPropagation(); onDelete(row.id); }}
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
          {reanchoring && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => { e.stopPropagation(); onCancelReanchor(); }}
            >
              ביטול עיגון
            </Button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="grid gap-2">
          <Field label="ציטוט מהדף">
            <textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              className="min-h-[3rem] w-full rounded-md border bg-transparent px-2 py-1 text-sm"
            />
          </Field>
          <Field label="טעות">
            <textarea
              value={draftError}
              onChange={(e) => setDraftError(e.target.value)}
              className="min-h-[2.5rem] w-full rounded-md border bg-transparent px-2 py-1 text-sm"
            />
          </Field>
          <Field label="תיקון">
            <textarea
              value={draftFix}
              onChange={(e) => setDraftFix(e.target.value)}
              className="min-h-[2.5rem] w-full rounded-md border bg-transparent px-2 py-1 text-sm"
            />
          </Field>
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onCancel(); }}>
              <X className="size-4" /> ביטול
            </Button>
            <Button size="sm" onClick={(e) => { e.stopPropagation(); onSubmit(); }}>
              <Check className="size-4" /> שמור
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-1">
          <div className="line-clamp-2 text-muted-foreground">"{row.text}"</div>
          <div><strong className="text-destructive">טעות:</strong> {row.error}</div>
          <div><strong className="text-emerald-700">תיקון:</strong> {row.fix}</div>
          {reanchoring && (
            <div className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">
              סמן טקסט בעמוד או צייר מלבן כדי לעדכן את העיגון.
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
