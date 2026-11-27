import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FEEDBACK_CATEGORIES,
  validateFeedbackInput,
  validateFeedbackMessage,
  escapeRegex
} from './feedback.js';

test('validateFeedbackInput accepts valid submission and trims fields', () => {
  const res = validateFeedbackInput({
    category: FEEDBACK_CATEGORIES[0],
    subject: '  Bank slider reset bug  ',
    description: '  When adjusting the deposit rate slider on mobile, the preview lags slightly.  ',
    reportedSeverity: 'HIGH',
    relatedRoute: 'BusinessDetail',
    diagnostics: { appVersion: '1.0.0', platform: 'Linux', route: 'Business', pendingActions: 2 },
    clientRequestId: 'req-123'
  });
  assert.equal(res.subject, 'Bank slider reset bug');
  assert.equal(res.reportedSeverity, 'high');
  assert.equal(res.diagnostics.pendingActions, 2);
});

test('validateFeedbackInput rejects invalid category, short subject/description, and missing request ID', () => {
  assert.throws(() => validateFeedbackInput({ category: 'Invalid', subject: 'Hello world', description: 'A'.repeat(25), clientRequestId: '1' }));
  assert.throws(() => validateFeedbackInput({ category: 'Other', subject: 'Hi', description: 'A'.repeat(25), clientRequestId: '1' }));
  assert.throws(() => validateFeedbackInput({ category: 'Other', subject: 'Valid Subject', description: 'Too short', clientRequestId: '1' }));
  assert.throws(() => validateFeedbackInput({ category: 'Other', subject: 'Valid Subject', description: 'A'.repeat(25) }));
});

test('validateFeedbackMessage and escapeRegex sanitize inputs', () => {
  assert.equal(validateFeedbackMessage('  Thanks for fixing!  '), 'Thanks for fixing!');
  assert.throws(() => validateFeedbackMessage('x'));
  assert.equal(escapeRegex('FB-[001].*+?'), 'FB-\\[001\\]\\.\\*\\+\\?');
});
