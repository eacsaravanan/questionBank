import React, { useEffect, useState } from 'react';
import { ScanText, ExternalLink, Copy } from 'lucide-react';
import AppShell from '../../components/AppShell.jsx';
import { PageHeader, Card, Button, Badge } from '../../components/ui.jsx';
import { SUPER_ADMIN_NAV as NAV } from './nav.js';
import api from '../../api/client.js';
import { useToast, apiErrorMessage } from '../../components/Toast.jsx';

const DUPLICATE_MODES = [
  { id: 'off', name: 'Off', blurb: 'No duplicate checking anywhere. "Previously asked in" stays available as a manual free-text field only.' },
  { id: 'manual', name: 'Manual only', blurb: 'The "Check for repeats" button and OCR bulk-import suggestions are disabled. Preparers type "Previously asked in" by hand.' },
  { id: 'automatic', name: 'Automatic on import', blurb: 'Every question extracted via bulk OCR import is automatically checked against the existing bank as it\'s extracted. The manual "Check for repeats" button in Question Builder is not used.' },
  { id: 'both', name: 'Both (recommended)', blurb: 'Automatic checking runs during OCR bulk import, and preparers can also trigger it on demand from Question Builder / My Questions with "Check for repeats".' },
];

function DuplicateDetectionSettings() {
  const toast = useToast();
  const [mode, setMode] = useState('both');
  const [threshold, setThreshold] = useState(0.72);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/system-config/duplicate-detection').then((res) => {
      setMode(res.data.mode || 'both');
      setThreshold(res.data.threshold ?? 0.72);
    }).catch((err) => toast.error(apiErrorMessage(err, 'Could not load duplicate detection settings.')));
  }, []); // eslint-disable-line

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/system-config/duplicate-detection', { mode, threshold });
      toast.success('Duplicate detection settings saved.');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not save duplicate detection settings.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-6 mt-6">
      <div className="flex items-center gap-2 mb-1">
        <Copy size={16} className="text-verdant-600" />
        <h2 className="font-display font-semibold text-ink-900 text-sm">Duplicate / reuse detection</h2>
      </div>
      <p className="text-xs text-ink-900/50 mb-4">
        Controls how "Previously asked in" gets auto-suggested when a question looks like it already
        exists elsewhere in the bank — separate from the source-tag (e.g. "CCS4T/19") that's read
        straight off a source PDF, which is always auto-filled regardless of this setting.
      </p>

      <form onSubmit={save} className="space-y-3">
        {DUPLICATE_MODES.map((m) => (
          <label key={m.id} className={`block p-3 rounded-lg border cursor-pointer ${mode === m.id ? 'border-gold-500 bg-gold-500/5' : 'border-ink-900/10'}`}>
            <div className="flex items-center gap-2 mb-1">
              <input type="radio" checked={mode === m.id} onChange={() => setMode(m.id)} />
              <span className="text-sm font-medium text-ink-900">{m.name}</span>
              {m.id === 'both' && <Badge tone="verdant">Recommended</Badge>}
            </div>
            <p className="text-xs text-ink-900/50 ml-6">{m.blurb}</p>
          </label>
        ))}

        {mode !== 'off' && mode !== 'manual' && (
          <div className="pl-2 pt-2">
            <label className="block text-xs font-medium text-ink-900/70 mb-1">
              Match sensitivity — {Math.round(threshold * 100)}% similarity required
            </label>
            <input
              type="range" min="0.5" max="0.95" step="0.01"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-ink-900/40 mt-1">
              Lower catches more possible repeats (with more false positives to review); higher is
              stricter. 72% is a reasonable default for MCQ-length text.
            </p>
          </div>
        )}

        <Button variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save duplicate detection settings'}</Button>
      </form>
    </Card>
  );
}

const PROVIDERS = [
  {
    id: 'tesseract',
    name: 'Tesseract (default)',
    blurb: 'Free, open-source, runs entirely on your own server. No API key needed. Best privacy — nothing ever leaves your infrastructure. Lower accuracy than the cloud options below, especially on watermarked or subscript-heavy text.',
  },
  {
    id: 'google-vision',
    name: 'Google Cloud Vision',
    blurb: 'Cloud API, called directly — no Python needed. Generally the most accurate of the three options, including on Tamil and mixed-script text. Free tier (~1,000 images/month), paid per image beyond that. Your exam images are sent to Google to process them.',
  },
  {
    id: 'custom',
    name: 'Custom API',
    blurb: "Point at any OCR service you run or subscribe to — including a self-hosted PaddleOCR Python microservice, Azure Computer Vision, AWS Textract, or anything else. Requires an endpoint that accepts { imageBase64, mimeType } and returns { text }.",
  },
  {
    id: 'document-ai',
    name: 'Google Document AI',
    blurb: 'Cloud API with layout/table detection, not just flat text ΓÇö better suited to structured content like match-the-following tables. Configured on the server (service account), not here. Similar accuracy and pricing profile to Google Cloud Vision.',
  },
];

export default function OcrSettings() {
  const toast = useToast();
  const [provider, setProvider] = useState('tesseract');
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [status, setStatus] = useState({ apiKeySet: false, secretKeySet: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/system-config/ocr').then((res) => {
      setProvider(res.data.provider || 'tesseract');
      setEndpointUrl(res.data.endpointUrl || '');
      setStatus({ apiKeySet: res.data.apiKeySet, secretKeySet: res.data.secretKeySet });
    }).catch((err) => toast.error(apiErrorMessage(err, 'Could not load OCR settings.')));
  }, []); // eslint-disable-line

  async function save(e) {
    e.preventDefault();
    if (provider === 'custom' && !endpointUrl.trim()) {
      toast.warning('Enter the custom provider\'s endpoint URL.');
      return;
    }
    if (provider === 'google-vision' && !apiKey.trim() && !status.apiKeySet) {
      toast.warning('Enter a Google Cloud Vision API key.');
      return;
    }
    setSaving(true);
    try {
      await api.put('/system-config/ocr', { provider, apiKey: apiKey || undefined, secretKey: secretKey || undefined, endpointUrl: endpointUrl || undefined });
      toast.success(`OCR engine set to ${PROVIDERS.find((p) => p.id === provider)?.name}.`);
      setApiKey(''); setSecretKey('');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not save OCR settings.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Super Admin" navItems={NAV}>
      <PageHeader eyebrow="System Configuration" title="OCR engine" />
      <div className="px-8 pb-12 max-w-xl">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <ScanText size={16} className="text-verdant-600" />
            <h2 className="font-display font-semibold text-ink-900 text-sm">Which engine reads screenshots/PDFs</h2>
          </div>

          <form onSubmit={save} className="space-y-3">
            {PROVIDERS.map((p) => (
              <label key={p.id} className={`block p-3 rounded-lg border cursor-pointer ${provider === p.id ? 'border-gold-500 bg-gold-500/5' : 'border-ink-900/10'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <input type="radio" checked={provider === p.id} onChange={() => setProvider(p.id)} />
                  <span className="text-sm font-medium text-ink-900">{p.name}</span>
                  {p.id === 'tesseract' && <Badge tone="verdant">Free</Badge>}
                </div>
                <p className="text-xs text-ink-900/50 ml-6">{p.blurb}</p>
              </label>
            ))}

            {provider === 'google-vision' && (
              <div className="pl-2 space-y-2 pt-2">
                <input
                  type="password"
                  placeholder={status.apiKeySet ? 'API key set — leave blank to keep it' : 'Google Cloud Vision API key'}
                  className="w-full px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
                  value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                />
                <a
                  className="text-xs text-verdant-600 flex items-center gap-1 hover:underline"
                  href="https://cloud.google.com/vision/docs/setup" target="_blank" rel="noreferrer"
                >
                  How to get a Vision API key <ExternalLink size={11} />
                </a>
              </div>
            )}

            {provider === 'custom' && (
              <div className="pl-2 space-y-2 pt-2">
                <input
                  placeholder="Endpoint URL, e.g. https://your-ocr-service.example.com/ocr"
                  className="w-full px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
                  value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)}
                />
                <input
                  type="password"
                  placeholder={status.apiKeySet ? 'API key set — leave blank to keep it' : 'API key (optional, sent as Bearer token)'}
                  className="w-full px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
                  value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                />
                <input
                  type="password"
                  placeholder={status.secretKeySet ? 'Secret set — leave blank to keep it' : 'Secret key (optional, if your provider needs one)'}
                  className="w-full px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
                  value={secretKey} onChange={(e) => setSecretKey(e.target.value)}
                />
                <p className="text-xs text-ink-900/40">
                  Contract: POST to the endpoint above with <code className="px-1 bg-ink-900/5 rounded">{'{ imageBase64, mimeType }'}</code>,
                  expects <code className="px-1 bg-ink-900/5 rounded">{'{ text, confidence? }'}</code> back.
                </p>
              </div>
            )}

            <Button variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save OCR configuration'}</Button>
          </form>
        </Card>

        <p className="text-xs text-ink-900/40 mt-4 leading-relaxed">
          No OCR engine — including the cloud options above — guarantees 100% accuracy on every image,
          especially watermarked scans or subscripted formulas. Every extracted question still requires
          review before saving, regardless of which engine produced it.
        </p>

        <DuplicateDetectionSettings />
      </div>
    </AppShell>
  );
}
