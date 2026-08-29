/**
 * Unified OCR result every adapter must return, regardless of provider.
 * This is what the rest of the app (review screen, question importer) consumes,
 * so adding a 5th or 6th provider later never touches calling code.
 *
 * @typedef {Object} OcrResult
 * @property {string} text            - Plain extracted text (best-effort reading order)
 * @property {number} [confidence]    - 0..1, provider-reported or estimated
 * @property {'flat'|'layout'} shape  - 'layout' means blocks/tables are populated and usable
 * @property {OcrBlock[]} [blocks]    - Optional structured blocks (paragraphs/tables), for engines that support layout
 * @property {string} [language]      - BCP-47 code if detected, e.g. 'ta', 'en'
 * @property {string} provider        - which adapter produced this, for audit/logging
 * @property {any} [raw]              - raw provider response, kept for debugging / re-processing, never sent to frontend by default
 */

/**
 * @typedef {Object} OcrBlock
 * @property {'paragraph'|'table'} type
 * @property {string} [text]          - for paragraph blocks
 * @property {string[][]} [rows]      - for table blocks, e.g. match-the-following left/right columns
 * @property {{x:number,y:number,w:number,h:number}} [boundingBox]
 */

export {};
