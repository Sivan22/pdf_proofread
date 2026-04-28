import type { RunResult } from '../runner/orchestrator';

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
    <section style={{ border: '1px solid #ccc', borderRadius: 8, padding: 12 }}>
      <div>
        סה"כ {result.errors.length} טעויות — {anchored} עוגנו, {unmatched} ללא עיגון
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <a href={pdfUrl} download={`${baseName}_reviewed.pdf`}>
          <button>הורד PDF</button>
        </a>
        <a href={jsonUrl} download={`${baseName}_errors.json`}>
          <button>הורד JSON</button>
        </a>
      </div>
    </section>
  );
}
