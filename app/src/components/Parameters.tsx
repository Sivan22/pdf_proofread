import type { Settings } from '../store/settings';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface Props {
  settings: Settings;
  pageCount: number | null;
  onChange: (s: Settings) => void;
}

export function Parameters({ settings, pageCount, onChange }: Props) {
  const max = pageCount ?? undefined;
  const start = settings.startPage ?? 1;
  const end = settings.endPage ?? pageCount ?? 1;
  const overlapInvalid = settings.overlap >= settings.pagesPerBatch;
  const rangeInvalid = pageCount !== null && (start < 1 || end > pageCount || start > end);

  return (
    <Card>
      <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 md:grid-cols-3">
        <Field id="start-page" label="עמוד התחלה">
          <Input
            id="start-page"
            type="number"
            min={1}
            max={max}
            value={start}
            onChange={(e) => onChange({ ...settings, startPage: Number(e.target.value) || 1 })}
          />
        </Field>
        <Field id="end-page" label="עמוד סיום">
          <Input
            id="end-page"
            type="number"
            min={1}
            max={max}
            value={end}
            onChange={(e) => onChange({ ...settings, endPage: Number(e.target.value) || 1 })}
          />
        </Field>
        <Field id="pages-per-batch" label="עמודים לקבוצה">
          <Input
            id="pages-per-batch"
            type="number"
            min={1}
            max={30}
            value={settings.pagesPerBatch}
            onChange={(e) => onChange({ ...settings, pagesPerBatch: Number(e.target.value) || 1 })}
          />
        </Field>
        <Field id="overlap" label="חפיפה">
          <Input
            id="overlap"
            type="number"
            min={0}
            max={settings.pagesPerBatch - 1}
            value={settings.overlap}
            onChange={(e) => onChange({ ...settings, overlap: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field id="concurrency" label="מקביליות (0 = ללא הגבלה)">
          <Input
            id="concurrency"
            type="number"
            min={0}
            value={settings.concurrency}
            onChange={(e) => onChange({ ...settings, concurrency: Number(e.target.value) || 0 })}
          />
        </Field>
        {(overlapInvalid || rangeInvalid) && (
          <div className="text-destructive text-sm sm:col-span-2 md:col-span-3">
            {overlapInvalid && <div>חפיפה חייבת להיות קטנה ממספר העמודים לקבוצה.</div>}
            {rangeInvalid && <div>טווח עמודים לא תקין.</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
