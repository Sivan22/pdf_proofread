import { useEffect, useState } from 'react';
import { ChevronDown, ChevronLeft, Settings as SettingsIcon } from 'lucide-react';
import { isRouteModelValid } from '../ai/providers';
import { type Model, type Route, type Settings } from '../store/settings';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
}

const ROUTE_LABELS: Record<Route, string> = {
  anthropic: 'Anthropic',
  google: 'Google',
  gateway: 'Vercel AI Gateway',
};

const ALL_MODELS: Model[] = ['claude-opus-4-7', 'gemini-3.1-pro'];

export function SettingsPanel({ settings, onChange }: Props) {
  const hasKey = !!settings.apiKeys[settings.route];
  const [open, setOpen] = useState(!hasKey);

  // Auto-correct invalid (route, model) pairs whenever the route changes.
  useEffect(() => {
    if (!isRouteModelValid(settings.route, settings.model)) {
      const fallback = ALL_MODELS.find((m) => isRouteModelValid(settings.route, m));
      if (fallback) onChange({ ...settings, model: fallback });
    }
  }, [settings.route]); // eslint-disable-line react-hooks/exhaustive-deps

  const availableModels = ALL_MODELS.filter((m) => isRouteModelValid(settings.route, m));

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 rounded-xl px-6 py-4 text-start text-sm font-medium hover:bg-accent/40"
      >
        <span className="flex items-center gap-2">
          <SettingsIcon className="size-4" />
          הגדרות
        </span>
        {open ? <ChevronDown className="size-4" /> : <ChevronLeft className="size-4" />}
      </button>
      {open && (
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-sm font-medium">נתיב:</span>
            {(['anthropic', 'google', 'gateway'] as Route[]).map((r) => (
              <label key={r} className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  className="size-4 accent-primary"
                  checked={settings.route === r}
                  onChange={() => onChange({ ...settings, route: r })}
                />
                {ROUTE_LABELS[r]}
              </label>
            ))}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="model-select">מודל</Label>
            <select
              id="model-select"
              value={settings.model}
              onChange={(e) => onChange({ ...settings, model: e.target.value as Model })}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              {availableModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="api-key">API key ({ROUTE_LABELS[settings.route]})</Label>
            <Input
              id="api-key"
              type="password"
              value={settings.apiKeys[settings.route]}
              onChange={(e) =>
                onChange({
                  ...settings,
                  apiKeys: { ...settings.apiKeys, [settings.route]: e.target.value },
                })
              }
            />
          </div>

          <p className="text-xs text-muted-foreground">
            המפתחות נשמרים בדפדפן בלבד ונשלחים רק לספק שבחרת. אין שרת.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
