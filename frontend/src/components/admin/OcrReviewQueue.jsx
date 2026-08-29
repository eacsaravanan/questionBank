// frontend/src/components/admin/OcrReviewQueue.jsx
//
// This screen is where "no wrong answer ships silently" actually gets
// enforced. Every OCR'd question lands here first. High-confidence items
// (both engines agreed) are a fast rubber-stamp; disagreements show both
// raw readings plus the LLM's suggested reconciliation, so the reviewer
// has everything needed without re-reading the original scan from scratch.

import React, { useEffect, useState } from 'react';
import { apiClient } from '../../lib/apiClient';
import { notify } from '../../lib/notify';

export default function OcrReviewQueue() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all'); // all | high_confidence | engines_disagreed

  useEffect(() => {
    apiClient.get('/api/admin/ocr-review-queue', { params: { status: 'pending_review' } }).then((res) => {
      setItems(res.data);
    });
  }, []);

  const visible = items.filter((i) => filter === 'all' || i.reviewBadge === filter);

  const handleApprove = async (item, editedFields) => {
    await apiClient.post(`/api/admin/ocr-review-queue/${item.id}/approve`, editedFields);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    notify.success(`Question ${item.questionNumber} published`);
  };

  const handleReject = async (item, reason) => {
    await apiClient.post(`/api/admin/ocr-review-queue/${item.id}/reject`, { reason });
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  };

  return (
    <div className="ocr-review-queue">
      <h2>OCR Review Queue</h2>
      <p className="hint">
        Nothing here is live yet. Every question must be approved before it appears in the
        question bank, regardless of confidence badge.
      </p>

      <div className="filter-tabs">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
          All ({items.length})
        </button>
        <button
          className={filter === 'high_confidence' ? 'active' : ''}
          onClick={() => setFilter('high_confidence')}
        >
          High confidence ({items.filter((i) => i.reviewBadge === 'high_confidence').length})
        </button>
        <button
          className={filter === 'engines_disagreed' ? 'active' : ''}
          onClick={() => setFilter('engines_disagreed')}
        >
          Engines disagreed ({items.filter((i) => i.reviewBadge === 'engines_disagreed').length})
        </button>
      </div>

      {visible.map((item) => (
        <ReviewCard key={item.id} item={item} onApprove={handleApprove} onReject={handleReject} />
      ))}
    </div>
  );
}

function ReviewCard({ item, onApprove, onReject }) {
  // item fields match OcrReviewQueue in schema-additions.prisma exactly --
  // translationsJson is [{languageCode, body}, ...], not flat en/ta columns.
  const enTranslation = item.translationsJson.find((t) => t.languageCode === 'en');
  const taTranslation = item.translationsJson.find((t) => t.languageCode === 'ta');

  const [textEn, setTextEn] = useState(enTranslation?.body || '');
  const [textTa, setTextTa] = useState(taTranslation?.body || '');

  const isHighConfidence = item.reviewBadge === 'high_confidence';

  return (
    <div className={`review-card ${isHighConfidence ? 'badge-green' : 'badge-red'}`}>
      <div className="review-card-header">
        <span className="question-number">Q{item.questionNumber}</span>
        <span className={`badge ${isHighConfidence ? 'badge-green' : 'badge-red'}`}>
          {isHighConfidence
            ? `High confidence (${(item.confidenceScore * 100).toFixed(0)}% agreement)`
            : `Engines disagreed (${(item.confidenceScore * 100).toFixed(0)}% agreement)`}
        </span>
        {item.questionType === 'MATCH_FOLLOWING' && (
          <span className="badge badge-blue">Match the following</span>
        )}
        {item.mathOcrLatex && <span className="badge badge-purple">Formula detected</span>}
      </div>

      {!isHighConfidence && (
        <div className="engine-comparison">
          <div>
            <h5>Primary engine</h5>
            <pre>{item.primaryEngineRaw}</pre>
          </div>
          <div>
            <h5>Secondary engine</h5>
            <pre>{item.secondaryEngineRaw}</pre>
          </div>
          {item.llmSuggestionJson && !item.llmSuggestionJson.error && (
            <div>
              <h5>LLM suggested reconciliation</h5>
              <p>{item.llmSuggestionJson.suggestedText}</p>
              <p className="reasoning">{item.llmSuggestionJson.reasoning}</p>
              {item.llmSuggestionJson.stillUncertain && (
                <p className="warning">LLM flagged this as still uncertain — check the scan directly.</p>
              )}
            </div>
          )}
        </div>
      )}

      <label>
        English
        <textarea value={textEn} onChange={(e) => setTextEn(e.target.value)} />
      </label>
      <label>
        தமிழ்
        <textarea value={textTa} onChange={(e) => setTextTa(e.target.value)} />
      </label>

      {item.mathOcrLatex && (
        <label>
          Detected formula (LaTeX)
          <code>{item.mathOcrLatex}</code>
        </label>
      )}

      <button
        className="recheck-formula"
        onClick={async () => {
          await apiClient.post(`/api/admin/ocr-review-queue/${item.id}/recheck-formula`);
          notify.info('Re-running formula OCR — refresh once it completes.');
        }}
      >
        Spot a formula that wasn't detected? Re-run formula OCR
      </button>

      <div className="review-card-actions">
        <button
          className="approve"
          onClick={() =>
            onApprove(item, {
              translations: [
                { languageCode: 'en', body: textEn },
                { languageCode: 'ta', body: textTa },
              ],
              // Subject/difficulty/options are not editable inline on this
              // card in this scaffold -- in your real screen, extend this
              // to reuse the same subject picker / options editor your
              // manual entry form already has, prefilled from
              // item.optionsJson, since a reviewer must set isCorrect
              // themselves (OCR never infers the correct answer).
            })
          }
        >
          Approve &amp; publish
        </button>
        <button className="reject" onClick={() => onReject(item, 'manual rejection')}>
          Reject / rescan
        </button>
      </div>
    </div>
  );
}
