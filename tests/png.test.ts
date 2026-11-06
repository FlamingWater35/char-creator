import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTestPng, listChunkTypes, countChunks, asArrayBuffer, toDataUrl, fromDataUrl } from './fixtures.ts';
import { injectCharacterCardMetadata, extractCharacterCardMetadata } from '../src/lib/png.ts';

const V3 = JSON.stringify({ spec: 'chara_card_v3', spec_version: '3.0', data: { name: 'Merlin' } });
const V2 = JSON.stringify({ spec: 'chara_card_v2', spec_version: '2.0', data: { name: 'Merlin' } });

const source = makeTestPng();

test('the fixture is a structurally valid PNG', () => {
	assert.deepEqual(listChunkTypes(source), ['IHDR', 'IDAT', 'IEND']);
});

test('injects one ccv3 and one chara tEXt chunk, before IEND', () => {
	const out = fromDataUrl(injectCharacterCardMetadata(toDataUrl(source), V3, V2));
	const types = listChunkTypes(out);

	assert.deepEqual(types, ['IHDR', 'IDAT', 'tEXt', 'tEXt', 'IEND']);
	assert.equal(countChunks(out, 'IEND'), 1);
});

test('re-injecting replaces the card chunks instead of appending duplicates', () => {
	let bytes = source;
	for (let i = 0; i < 3; i++) {
		bytes = fromDataUrl(injectCharacterCardMetadata(toDataUrl(bytes), V3, V2));
	}

	assert.equal(countChunks(bytes, 'tEXt'), 2);
	assert.deepEqual(listChunkTypes(bytes), ['IHDR', 'IDAT', 'tEXt', 'tEXt', 'IEND']);
});

test('round-trips the v3 payload out of the injected PNG', async () => {
	const bytes = fromDataUrl(injectCharacterCardMetadata(toDataUrl(source), V3, V2));
	const extracted = await extractCharacterCardMetadata(asArrayBuffer(bytes));

	assert.ok(extracted);
	assert.equal(JSON.parse(extracted).spec, 'chara_card_v3');
});

test('falls back to the v2 chunk when no v3 chunk exists', async () => {
	// Inject, then strip the ccv3 chunk by injecting only a v2 payload.
	const bytes = fromDataUrl(injectCharacterCardMetadata(toDataUrl(source), V2, V2));
	const extracted = await extractCharacterCardMetadata(asArrayBuffer(bytes));

	assert.ok(extracted);
	assert.equal(JSON.parse(extracted).spec, 'chara_card_v2');
});

test('returns null for a PNG that carries no card metadata', async () => {
	assert.equal(await extractCharacterCardMetadata(asArrayBuffer(source)), null);
});

test('rejects a file that is not a PNG', async () => {
	await assert.rejects(
		() => extractCharacterCardMetadata(new Uint8Array(16).buffer),
		/Invalid PNG file signature/
	);
});

test('refuses to inject into a PNG with no IEND chunk', () => {
	const truncated = toDataUrl(source.subarray(0, source.length - 12));
	assert.throws(() => injectCharacterCardMetadata(truncated, V3, V2), /Unable to encode character data/);
});
