// frontend/src/components/questions/MatchTheFollowingEditor.jsx
//
// Matches the Question.metadata convention documented in
// backend/prisma/schema-additions.prisma:
//
//   metadata.matchList = {
//     en: { left: [{label, text}], right: [{label, text}] },
//     ta: { left: [{label, text}], right: [{label, text}] }
//   }
//
// Options (A-D) are ordinary QuestionOption rows with permutation text like
// "3,1,4,2" -- same shape as any other question type, so this editor's
// `options` prop/output matches whatever your existing single-answer option
// editor already uses (array of {sortOrder, isCorrect, translations}).
//
// Render this alongside your existing single-answer form when
// question.type === 'MATCH_FOLLOWING' (your real QuestionType enum value).

import React from 'react';

const emptyItem = (label) => ({ label, text: '' });
const emptyLangList = () => ({
  left: ['a', 'b', 'c', 'd'].map(emptyItem),
  right: ['1', '2', '3', '4'].map(emptyItem),
});

export default function MatchTheFollowingEditor({ metadata, options, onMetadataChange, onOptionsChange }) {
  const matchList = metadata?.matchList || { en: emptyLangList(), ta: emptyLangList() };

  const updateItem = (lang, side, index, text) => {
    const next = {
      ...matchList,
      [lang]: {
        ...matchList[lang],
        [side]: matchList[lang][side].map((item, i) => (i === index ? { ...item, text } : item)),
      },
    };
    onMetadataChange({ ...metadata, matchList: next });
  };

  const updateOptionBody = (optionIndex, languageCode, body) => {
    const next = options.map((opt, i) => {
      if (i !== optionIndex) return opt;
      const translations = opt.translations.some((t) => t.languageCode === languageCode)
        ? opt.translations.map((t) => (t.languageCode === languageCode ? { ...t, body } : t))
        : [...opt.translations, { languageCode, body }];
      return { ...opt, translations };
    });
    onOptionsChange(next);
  };

  const setCorrectOption = (optionIndex) => {
    onOptionsChange(options.map((opt, i) => ({ ...opt, isCorrect: i === optionIndex })));
  };

  const bodyFor = (option, languageCode) =>
    option.translations.find((t) => t.languageCode === languageCode)?.body || '';

  return (
    <div className="match-the-following-editor">
      <p className="hint">
        Enter each list item per language. Options below are permutations of the right-hand
        labels in left-hand order, e.g. "3,1,4,2" — matching how TNPSC formats these questions.
        Mark which option is correct the same way you would for any other question.
      </p>

      {['en', 'ta'].map((lang) => (
        <div key={lang} className="match-language-block">
          <h4>{lang === 'en' ? 'English' : 'தமிழ்'}</h4>
          <div className="match-columns">
            <div>
              <h5>List I (a–d)</h5>
              {matchList[lang].left.map((item, i) => (
                <div key={item.label} className="match-item-row">
                  <span className="match-label">({item.label})</span>
                  <input value={item.text} onChange={(e) => updateItem(lang, 'left', i, e.target.value)} />
                </div>
              ))}
            </div>
            <div>
              <h5>List II (1–4)</h5>
              {matchList[lang].right.map((item, i) => (
                <div key={item.label} className="match-item-row">
                  <span className="match-label">{item.label}.</span>
                  <input value={item.text} onChange={(e) => updateItem(lang, 'right', i, e.target.value)} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      <h4>Options (permutation of List II order matching List I)</h4>
      {options.map((option, i) => (
        <div key={i} className="match-option-row">
          <input
            type="radio"
            name="correct-option"
            checked={option.isCorrect}
            onChange={() => setCorrectOption(i)}
          />
          <span className="match-label">({String.fromCharCode(65 + i)})</span>
          <input
            placeholder="e.g. 3,1,4,2 (English)"
            value={bodyFor(option, 'en')}
            onChange={(e) => updateOptionBody(i, 'en', e.target.value)}
          />
          <input
            placeholder="e.g. 3,1,4,2 (தமிழ்)"
            value={bodyFor(option, 'ta')}
            onChange={(e) => updateOptionBody(i, 'ta', e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}
