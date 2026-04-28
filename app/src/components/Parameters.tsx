import type { Settings } from '../store/settings';

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
    <section style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
      <Field label="עמוד התחלה">
        <input
          type="number"
          min={1}
          max={max}
          value={start}
          onChange={(e) => onChange({ ...settings, startPage: Number(e.target.value) || 1 })}
        />
      </Field>
      <Field label="עמוד סיום">
        <input
          type="number"
          min={1}
          max={max}
          value={end}
          onChange={(e) => onChange({ ...settings, endPage: Number(e.target.value) || 1 })}
        />
      </Field>
      <Field label="עמודים לקבוצה">
        <input
          type="number"
          min={1}
          max={30}
          value={settings.pagesPerBatch}
          onChange={(e) => onChange({ ...settings, pagesPerBatch: Number(e.target.value) || 1 })}
        />
      </Field>
      <Field label="חפיפה">
        <input
          type="number"
          min={0}
          max={settings.pagesPerBatch - 1}
          value={settings.overlap}
          onChange={(e) => onChange({ ...settings, overlap: Number(e.target.value) || 0 })}
        />
      </Field>
      <Field label="מקביליות (0 = ללא הגבלה)">
        <input
          type="number"
          min={0}
          value={settings.concurrency}
          onChange={(e) => onChange({ ...settings, concurrency: Number(e.target.value) || 0 })}
        />
      </Field>
      {(overlapInvalid || rangeInvalid) && (
        <div style={{ color: 'crimson', flexBasis: '100%' }}>
          {overlapInvalid && <div>חפיפה חייבת להיות קטנה ממספר העמודים לקבוצה.</div>}
          {rangeInvalid && <div>טווח עמודים לא תקין.</div>}
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', minWidth: 120 }}>
      <span style={{ fontSize: 12, color: '#555' }}>{label}</span>
      {children}
    </label>
  );
}
