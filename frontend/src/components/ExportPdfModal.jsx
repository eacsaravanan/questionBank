import React, { useEffect, useState } from 'react';
import { X, Download, AlertTriangle } from 'lucide-react';
import { Button } from './ui.jsx';
import api from '../api/client.js';
import { useToast, apiErrorMessage } from './Toast.jsx';

const POSITIONS = [
  ['top-left', 'top-center', 'top-right'],
  ['center-left', 'center', 'center-right'],
  ['bottom-left', 'bottom-center', 'bottom-right'],
];

export default function ExportPdfModal({ paper, onClose }) {
  const toast = useToast();
  const [profiles, setProfiles] = useState([]);
  const [brandingProfileId, setBrandingProfileId] = useState('');
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [position, setPosition] = useState('center');
  const [pagesMode, setPagesMode] = useState('all'); // 'all' | 'custom'
  const [customPages, setCustomPages] = useState('');
  const [tamilFontAvailable, setTamilFontAvailable] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    api.get('/branding-profiles').then((res) => {
      setProfiles(res.data);
      const def = res.data.find((p) => p.isDefault);
      if (def) setBrandingProfileId(def.id);
    }).catch(() => {});
    api.get('/question-papers/pdf-font-status').then((res) => setTamilFontAvailable(res.data.tamilFontAvailable)).catch(() => {});
  }, []);

  async function generate() {
    let customPageNumbers = [];
    if (pagesMode === 'custom') {
      customPageNumbers = customPages
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n > 0);
      if (customPageNumbers.length === 0) {
        toast.warning('Enter at least one valid page number, e.g. "1, 3, 5".');
        return;
      }
    }

    setGenerating(true);
    try {
      const res = await api.post(
        `/question-papers/${paper.id}/export-pdf`,
        {
          brandingProfileId: brandingProfileId || undefined,
          watermark: watermarkEnabled ? { enabled: true, position, pages: pagesMode, customPages: customPageNumbers } : { enabled: false },
        },
        { responseType: 'blob' }
      );
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${paper.title.replace(/[^a-z0-9]/gi, '_')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF generated.');
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not generate the PDF.'));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-ink-950/50 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-ink-900">Export "{paper.title}" as PDF</h3>
          <button onClick={onClose} className="text-ink-900/40 hover:text-ink-900"><X size={18} /></button>
        </div>

        {!tamilFontAvailable && (
          <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-gold-500/10 border border-gold-500/30 text-xs text-gold-800">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>
              No Tamil font is installed on the server yet, so Tamil question/option text will be
              omitted from this PDF (English content is unaffected). See
              <code className="mx-1 px-1 bg-white rounded">backend/assets/fonts/README.md</code>
              for the one-time setup.
            </span>
          </div>
        )}

        <label className="block text-xs font-medium text-ink-900/70 mb-1">Branding profile</label>
        <select className="w-full mb-4 px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
          value={brandingProfileId} onChange={(e) => setBrandingProfileId(e.target.value)}>
          <option value="">Tenant default</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.label}{p.confidentialMode ? ' (confidential)' : ''}</option>)}
        </select>

        <label className="flex items-center gap-2 text-sm text-ink-900/80 mb-3">
          <input type="checkbox" checked={watermarkEnabled} onChange={(e) => setWatermarkEnabled(e.target.checked)} />
          Add logo watermark
        </label>

        {watermarkEnabled && (
          <>
            <label className="block text-xs font-medium text-ink-900/70 mb-1">Watermark position</label>
            <div className="grid grid-cols-3 gap-1.5 mb-4 w-40">
              {POSITIONS.flat().map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setPosition(pos)}
                  className={`h-10 rounded border text-xs ${
                    position === pos ? 'border-gold-500 bg-gold-500/10' : 'border-ink-900/15 hover:border-ink-900/30'
                  }`}
                  title={pos}
                >
                  <span className={`block w-2 h-2 rounded-full mx-auto ${position === pos ? 'bg-gold-600' : 'bg-ink-900/20'}`} />
                </button>
              ))}
            </div>

            <label className="block text-xs font-medium text-ink-900/70 mb-1">Apply watermark to</label>
            <div className="flex gap-4 mb-3 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={pagesMode === 'all'} onChange={() => setPagesMode('all')} /> All pages
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={pagesMode === 'custom'} onChange={() => setPagesMode('custom')} /> Specific pages
              </label>
            </div>
            {pagesMode === 'custom' && (
              <input
                placeholder="e.g. 1, 3, 5"
                className="w-full mb-4 px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
                value={customPages}
                onChange={(e) => setCustomPages(e.target.value)}
              />
            )}
          </>
        )}

        <div className="flex justify-end gap-3 mt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={generate} disabled={generating}>
            <span className="flex items-center gap-1.5"><Download size={14} /> {generating ? 'Generating…' : 'Generate & download'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
