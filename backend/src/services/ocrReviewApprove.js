// backend/src/services/ocrReviewApprove.js
//
// Called by POST /api/admin/ocr-review-queue/:id/approve (route not included
// here -- wire this into your existing Express router, following whatever
// auth/permission-check pattern your other admin routes already use, e.g.
// requiring the "question.create" permission from your Permission table).
//
// This is the ONLY place OCR output becomes a real, live Question. Nothing
// upstream of this file writes to the Question table directly -- that's the
// actual accuracy guarantee this whole pipeline exists to enforce.

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * @param {string} queueId
 * @param {string} reviewerUserId
 * @param {{
 *   subjectId: string,
 *   chapterId?: string,
 *   topicId?: string,
 *   subtopicId?: string,
 *   translations: Array<{languageCode: string, body: string}>,
 *   options: Array<{sortOrder: number, isCorrect: boolean, matchKey?: string, translations: Array<{languageCode: string, body: string}>}>,
 *   metadata?: object,      // pass matchListJson through here for MATCH_FOLLOWING, already-corrected by reviewer
 *   difficulty: string,
 *   marks?: number,
 *   previouslyAskedIn?: string[]  // free-text labels reviewer confirms/types, e.g. "CCS4T/19"
 * }} editedFields - reviewer's final, possibly-corrected version of the queue row
 */
async function approveAndPublish(queueId, reviewerUserId, editedFields) {
  const queueItem = await prisma.ocrReviewQueue.findUniqueOrThrow({ where: { id: queueId } });

  if (queueItem.status !== 'PENDING_REVIEW' && queueItem.status !== 'NEEDS_RESCAN') {
    throw new Error(`Queue item ${queueId} is already ${queueItem.status}, cannot re-approve.`);
  }

  const humanCode = await generateHumanCode(editedFields.subjectId);

  const published = await prisma.$transaction(async (tx) => {
    const question = await tx.question.create({
      data: {
        humanCode,
        subjectId: editedFields.subjectId,
        chapterId: editedFields.chapterId,
        topicId: editedFields.topicId,
        subtopicId: editedFields.subtopicId,
        type: queueItem.questionType,
        difficulty: editedFields.difficulty,
        marks: editedFields.marks ?? 1,
        formulaUsed: Boolean(queueItem.mathOcrLatex),
        status: 'DRAFT', // publishing from OCR review lands as DRAFT in your normal
                          // question workflow -- it still goes through SME/Super Admin
                          // approval like any manually authored question. OCR review
                          // confirms the TEXT is correct, not that the question is
                          // ready for a live paper.
        createdById: reviewerUserId,
        preparationMode: 'OCR',
        ocrConfidence: queueItem.confidenceScore,
        ocrSourceRef: `${queueItem.sourcePaperName}#p${queueItem.sourcePage}#q${queueItem.questionNumber}`,
        metadata: editedFields.metadata ?? queueItem.matchListJson ?? undefined,

        translations: {
          create: editedFields.translations.map((t) => ({
            languageCode: t.languageCode,
            body: t.body,
          })),
        },

        options: {
          create: editedFields.options.map((opt) => ({
            sortOrder: opt.sortOrder,
            isCorrect: opt.isCorrect,
            matchKey: opt.matchKey,
            translations: {
              create: opt.translations.map((t) => ({
                languageCode: t.languageCode,
                body: t.body,
              })),
            },
          })),
        },

        // Reuses your existing provenance tracking -- if the OCR pass detected
        // a trailing source code on the page (e.g. "CCS4T/19"), or the reviewer
        // typed one in, it lands here with the appropriate method, exactly like
        // your "Previously asked in" field on the manual entry screen.
        appearances: editedFields.previouslyAskedIn?.length
          ? {
              create: editedFields.previouslyAskedIn.map((label) => ({
                label,
                method: 'MANUAL',
                createdById: reviewerUserId,
                confirmedById: reviewerUserId,
                confirmedAt: new Date(),
              })),
            }
          : undefined,
      },
    });

    await tx.ocrReviewQueue.update({
      where: { id: queueId },
      data: {
        status: 'APPROVED',
        reviewedById: reviewerUserId,
        reviewedAt: new Date(),
        publishedQuestionId: question.id,
      },
    });

    return question;
  });

  return published;
}

/**
 * @param {string} queueId
 * @param {string} reviewerUserId
 * @param {string} reason
 */
async function reject(queueId, reviewerUserId, reason) {
  return prisma.ocrReviewQueue.update({
    where: { id: queueId },
    data: {
      status: 'REJECTED',
      reviewedById: reviewerUserId,
      reviewedAt: new Date(),
      rejectionReason: reason,
    },
  });
}

/**
 * Matches the "PHY-MEC-000125" style humanCode format implied by your
 * Question.humanCode comment. Adjust the prefix-derivation logic to however
 * you actually generate these elsewhere in your codebase if this differs --
 * this is a best-guess placeholder, not a copy of your real generator.
 */
async function generateHumanCode(subjectId) {
  const subject = await prisma.subject.findUniqueOrThrow({ where: { id: subjectId } });
  const prefix = (subject.code || subject.name.slice(0, 3)).toUpperCase();
  const count = await prisma.question.count({ where: { subjectId } });
  return `${prefix}-${String(count + 1).padStart(6, '0')}`;
}

export { approveAndPublish, reject };
