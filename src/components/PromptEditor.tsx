import { useState } from 'react';
import { ChevronDown, ChevronLeft, RotateCcw } from 'lucide-react';
import { DEFAULT_PROMPT } from '../runner/prompt';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Textarea } from './ui/textarea';

interface Props {
  prompt: string;
  onChange: (p: string) => void;
}

export function PromptEditor({ prompt, onChange }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <div className="flex items-center justify-between gap-2 px-6 py-4">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 text-sm font-medium hover:text-accent-foreground"
        >
          פרומפט
          {open ? <ChevronDown className="size-4" /> : <ChevronLeft className="size-4" />}
        </button>
        {open && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(DEFAULT_PROMPT)}
          >
            <RotateCcw />
            איפוס לברירת מחדל
          </Button>
        )}
      </div>
      {open && (
        <CardContent>
          <Textarea
            value={prompt}
            onChange={(e) => onChange(e.target.value)}
            rows={20}
            dir="rtl"
            className="font-mono"
          />
        </CardContent>
      )}
    </Card>
  );
}
