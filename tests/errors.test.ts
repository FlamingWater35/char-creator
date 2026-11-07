import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorMessage, isBenignSaveAbort } from '../src/lib/errors.ts';

test('errorMessage reads a real Error', () => {
	assert.equal(errorMessage(new Error('boom')), 'boom');
});

test('errorMessage reads a thrown string', () => {
	assert.equal(errorMessage('plain text'), 'plain text');
	assert.equal(errorMessage('  padded  '), 'padded');
});

test('errorMessage reads a message off a plain object', () => {
	// Dexie and some fetch wrappers reject with objects, not Error instances.
	assert.equal(errorMessage({ message: 'from object' }), 'from object');
	assert.equal(errorMessage({ name: 'AbortError' }), 'Unknown error');
});

test('errorMessage never renders "undefined"', () => {
	// The old `e.message` call sites produced "Autosave failed: undefined".
	for (const value of [undefined, null, 42, {}, [], '']) {
		const message = errorMessage(value);
		assert.equal(typeof message, 'string');
		assert.ok(message.length > 0);
		assert.ok(!message.includes('undefined'));
	}
});

test('errorMessage honours a custom fallback', () => {
	assert.equal(errorMessage(null, 'Could not save'), 'Could not save');
	assert.equal(errorMessage(new Error(''), 'Could not save'), 'Could not save');
});

test('isBenignSaveAbort recognises teardown noise', () => {
	assert.equal(isBenignSaveAbort({ name: 'PrematureCommitError' }), true);
	assert.equal(isBenignSaveAbort({ name: 'TransactionInactiveError' }), true);
	assert.equal(isBenignSaveAbort({ name: 'AbortError' }), true);
	assert.equal(isBenignSaveAbort({ name: 'InvalidStateError' }), true);
});

test('isBenignSaveAbort does not swallow real failures', () => {
	// A quota error means the write did not land, so it must still be reported.
	assert.equal(isBenignSaveAbort({ name: 'QuotaExceededError' }), false);
	assert.equal(isBenignSaveAbort(new Error('boom')), false);
	assert.equal(isBenignSaveAbort(undefined), false);
	assert.equal(isBenignSaveAbort('PrematureCommitError'), false);
});
