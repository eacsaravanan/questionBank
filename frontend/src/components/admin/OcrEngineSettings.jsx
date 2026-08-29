// frontend/src/components/admin/OcrEngineSettings.jsx
//
// Drop-in replacement for the current "OCR Engine" panel at
// http://localhost:8080/super-admin/ocr (the one showing Google Cloud Vision /
// Custom API radio buttons in your screenshot). Adds Google Document AI and
// keeps every existing provider option working the same way.
//
// Assumes you already have some `apiClient.get/post` helper and a toast/notify
// helper in your project — swap the two import lines below for whatever yours
// are actually called.

import React, { useEffect, useState } from 'react';
import { apiClient } from '../../lib/apiClient';
import { notify } from '../../lib/notify';

const ENGINES = [
  {
    id: 'google_cloud_vision',
    label: 'Google Cloud Vision',
    description:
      'Cloud API, called directly — no Python needed. Free tier (~1,000 images/month), paid per image beyond that. Your exam images are sent to Google to process them.',
  },
  {
    id: 'google_document_ai',
    label: 'Google Document AI',
    description:
      'Understands page layout, not just raw text — detects tables and paragraph structure, which is what lets "Match the following" questions get parsed automatically instead of as flat text. Recommended primary engine for this question bank.',
  },
  {
    id: 'mistral_ocr',
    label: 'Mistral OCR',
    description: 'General-purpose OCR. Tamil accuracy is currently weaker than Google\u2019s options.',
  },
  {
    id: 'sarvam_vision',
    label: 'Sarvam Vision',
    description: 'Built for Indian languages. Worth piloting against Document AI before committing.',
  },
  {
    id: 'custom_api',
    label: 'Custom API',
    description:
      'Point at any OCR service you run or subscribe to. Requires an endpoint that accepts { imageBase64, mimeType } and returns { text, confidence? }.',
  },
];

const emptyConfigFor = (engineId) => {
  switch (engineId) {
    case 'google_cloud_vision':
      return { authMode: 'service_account', projectId: '' };
    case 'google_document_ai':
      return {
        authMode: 'service_account',
        projectId: '',
        location: 'asia-south1',
        processorId: '',
      };
    case 'mistral_ocr':
      return { authMode: 'api_key', apiKeyRef: 'MISTRAL_API_KEY', model: 'mistral-ocr-latest' };
    case 'sarvam_vision':
      return { authMode: 'api_key', apiKeyRef: 'SARVAM_API_KEY', endpoint: '' };
    case 'custom_api':
      return { endpointUrl: '', apiKeyRef: '', secretKeyRef: '' };
    default:
      return {};
  }
};

export default function OcrEngineSettings() {
  const [settings, setSettings] = useState(null);
  const [selectedEngine, setSelectedEngine] = useState('custom_api');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    apiClient.get('/api/admin/ocr-settings').then((res) => {
      const loaded = res.data || {
        engine: 'custom_api',
        secondaryEngine: 'google_cloud_vision',
        mathEngine: 'mathpix',
        providers: {},
      };
      setSettings(loaded);
      setSelectedEngine(loaded.engine);
    });
  }, []);

  if (!settings) return <div>Loading OCR settings…</div>;

  const currentConfig = settings.providers[selectedEngine] || emptyConfigFor(selectedEngine);

  const updateProviderField = (field, value) => {
    setSettings((prev) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [selectedEngine]: { ...(prev.providers[selectedEngine] || emptyConfigFor(selectedEngine)), [field]: value },
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.post('/api/admin/ocr-settings', { ...settings, engine: selectedEngine });
      notify.success('OCR configuration saved');
    } catch (err) {
      notify.error(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const res = await apiClient.post('/api/admin/ocr-settings/test', {
        engine: selectedEngine,
        config: currentConfig,
      });
      notify.success(res.data.message || 'Connection OK');
    } catch (err) {
      notify.error(`Test failed: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="ocr-engine-settings">
      <h2>OCR Engine</h2>

      {ENGINES.map((engine) => (
        <label key={engine.id} className={`ocr-engine-option ${selectedEngine === engine.id ? 'selected' : ''}`}>
          <input
            type="radio"
            name="ocr-engine"
            checked={selectedEngine === engine.id}
            onChange={() => setSelectedEngine(engine.id)}
          />
          <strong>{engine.label}</strong>
          <p>{engine.description}</p>
        </label>
      ))}

      <div className="ocr-provider-fields">
        {selectedEngine === 'google_document_ai' && (
          <>
            <h3>Google Document AI</h3>
            <label>
              Project ID
              <input
                value={currentConfig.projectId || ''}
                onChange={(e) => updateProviderField('projectId', e.target.value)}
                placeholder="tnpsocrengine"
              />
            </label>
            <label>
              Processor Location
              <input
                value={currentConfig.location || ''}
                onChange={(e) => updateProviderField('location', e.target.value)}
                placeholder="asia-south1"
              />
            </label>
            <label>
              Processor ID
              <input
                value={currentConfig.processorId || ''}
                onChange={(e) => updateProviderField('processorId', e.target.value)}
                placeholder="45a7d42f0f3053a4"
              />
            </label>
            <p className="hint">
              Authentication: Service Account — configured on the server via
              GOOGLE_APPLICATION_CREDENTIALS. Not entered here.
            </p>
          </>
        )}

        {selectedEngine === 'google_cloud_vision' && (
          <>
            <h3>Google Cloud Vision</h3>
            <label>
              Project ID
              <input
                value={currentConfig.projectId || ''}
                onChange={(e) => updateProviderField('projectId', e.target.value)}
              />
            </label>
            <p className="hint">Authentication: Service Account — configured on the server.</p>
          </>
        )}

        {selectedEngine === 'custom_api' && (
          <>
            <h3>Custom API</h3>
            <input
              placeholder="Endpoint URL, e.g. https://your-ocr-service.example.com/ocr"
              value={currentConfig.endpointUrl || ''}
              onChange={(e) => updateProviderField('endpointUrl', e.target.value)}
            />
            <input
              placeholder="API key env var name — leave blank if none"
              value={currentConfig.apiKeyRef || ''}
              onChange={(e) => updateProviderField('apiKeyRef', e.target.value)}
            />
            <input
              placeholder="Secret key env var name (optional)"
              value={currentConfig.secretKeyRef || ''}
              onChange={(e) => updateProviderField('secretKeyRef', e.target.value)}
            />
            <p className="hint">
              Contract: POST to the endpoint above with {'{ imageBase64, mimeType }'}, expects{' '}
              {'{ text, confidence? }'} back.
            </p>
          </>
        )}

        {(selectedEngine === 'mistral_ocr' || selectedEngine === 'sarvam_vision') && (
          <>
            <h3>{ENGINES.find((e) => e.id === selectedEngine).label}</h3>
            <label>
              API key environment variable name
              <input
                value={currentConfig.apiKeyRef || ''}
                onChange={(e) => updateProviderField('apiKeyRef', e.target.value)}
              />
            </label>
            {selectedEngine === 'sarvam_vision' && (
              <label>
                Endpoint
                <input
                  value={currentConfig.endpoint || ''}
                  onChange={(e) => updateProviderField('endpoint', e.target.value)}
                />
              </label>
            )}
          </>
        )}
      </div>

      <label className="secondary-engine-picker">
        Secondary engine (for side-by-side "Compare OCR" during review)
        <select
          value={settings.secondaryEngine || ''}
          onChange={(e) => setSettings((prev) => ({ ...prev, secondaryEngine: e.target.value }))}
        >
          <option value="">None</option>
          {ENGINES.filter((e) => e.id !== selectedEngine).map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </label>

      <div className="ocr-settings-actions">
        <button onClick={handleTestConnection} disabled={testing}>
          {testing ? 'Testing…' : 'Test Connection'}
        </button>
        <button onClick={handleSave} disabled={saving} className="primary">
          {saving ? 'Saving…' : 'Save OCR configuration'}
        </button>
      </div>

      <p className="disclaimer">
        No OCR engine — including the cloud options above — guarantees 100% accuracy on every
        image, especially watermarked scans or subscript/superscript formulas. Every extracted
        question still requires review before saving, regardless of which engine produced it.
      </p>
    </div>
  );
}
