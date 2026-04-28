import type { RunResult } from '../runner/orchestrator';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';

interface Props {
  result: RunResult | null;
  baseName: string;
}

export function Results({ result, baseName }: Props) {
  if (!result) return null;
  const anchored = result.errors.filter((e) => e.match !== 'unmatched').length;
  const unmatched = result.errors.length - anchored;

  const pdfUrl = URL.createObjectURL(result.annotatedPdf);
  const jsonBlob = new Blob([JSON.stringify(result.errors, null, 2)], { type: 'application/json' });
  const jsonUrl = URL.createObjectURL(jsonBlob);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-sm">
          סה"כ {result.errors.length} טעויות — {anchored} עוגנו, {unmatched} ללא עיגון
        </div>
        <div className="mt-3 flex gap-2">
          <Button asChild>
            <a href={pdfUrl} download={`${baseName}_reviewed.pdf`}>
              הורד PDF
            </a>
          </Button>
          <Button asChild>
            <a href={jsonUrl} download={`${baseName}_errors.json`}>
              הורד JSON
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
