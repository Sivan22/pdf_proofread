import { useEffect, useState } from 'react';
import { isRouteModelValid } from '../ai/providers';
import { type Model, type Route, type Settings } from '../store/settings';

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
    <section style={{ border: '1px solid #ccc', borderRadius: 8, padding: 12, marginBottom: 12 }}>
      <button onClick={() => setOpen(!open)} style={{ width: '100%', textAlign: 'right' }}>
        ⚙ הגדרות {open ? '▾' : '▸'}
      </button>
      {open && (
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <div>
            <label>נתיב:</label>{' '}
            {(['anthropic', 'google', 'gateway'] as Route[]).map((r) => (
              <label key={r} style={{ marginInlineEnd: 12 }}>
                <input
                  type="radio"
                  checked={settings.route === r}
                  onChange={() => onChange({ ...settings, route: r })}
                />{' '}
                {ROUTE_LABELS[r]}
              </label>
            ))}
          </div>

          <div>
            <label>מודל: </label>
            <select
              value={settings.model}
              onChange={(e) => onChange({ ...settings, model: e.target.value as Model })}
            >
              {availableModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {(['anthropic', 'google', 'gateway'] as Route[]).map((r) => (
            <div key={r}>
              <label>API key ({ROUTE_LABELS[r]}): </label>
              <input
                type="password"
                value={settings.apiKeys[r]}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    apiKeys: { ...settings.apiKeys, [r]: e.target.value },
                  })
                }
                style={{ width: '60%' }}
              />
            </div>
          ))}

          <p style={{ fontSize: 12, color: '#666' }}>
            המפתחות נשמרים בדפדפן בלבד ונשלחים רק לספק שבחרת. אין שרת.
          </p>
        </div>
      )}
    </section>
  );
}
