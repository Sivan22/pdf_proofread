import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import type { ProofErrorRow } from '../runner/orchestrator';

interface Props {
  rows: ProofErrorRow[];
  baseName: string;
  /** Returns the bytes for the latest annotated PDF (built fresh from the current state). */
  getAnnotatedPdf: () => Blob | null;
}

export function Results({ rows, baseName, getAnnotatedPdf }: Props) {
  if (rows.length === 0) return null;
  const anchored = rows.filter((r) => r.match !== 'unmatched').length;
  const unmatched = rows.length - anchored;

  const onDownloadPdf = () => {
    const blob = getAnnotatedPdf();
    if (!blob) return;
    triggerDownload(blob, `${baseName}_reviewed.pdf`);
  };

  const onDownloadJson = () => {
    const errors = rows.map((r) => ({
      page: r.page,
      text: r.text,
      error: r.error,
      fix: r.fix,
      match: r.match,
    }));
    const blob = new Blob([JSON.stringify(errors, null, 2)], { type: 'application/json' });
    triggerDownload(blob, `${baseName}_errors.json`);
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-sm">
          סה"כ {rows.length} טעויות — {anchored} עוגנו, {unmatched} ללא עיגון
        </div>
        <div className="mt-3 flex gap-2">
          <Button onClick={onDownloadPdf}>הורד PDF</Button>
          <Button onClick={onDownloadJson}>הורד JSON</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
