import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	parseBackup,
	parseCharacterRow,
	parseImageRows,
	parseAssetRows,
	extractLegacyMedia
} from '../src/lib/backup.ts';

/** A backup row shaped the way this app writes it. */
function row(overrides: Record<string, unknown> = {}) {
	return {
		id: 'c1',
		name: 'Merlin',
		createdAt: '2024-01-01T00:00:00.000Z',
		updatedAt: '2024-01-02T00:00:00.000Z',
		data: {
			mainPrompt: 'a wizard',
			description: 'old',
			personality: 'wry',
			scenario: 'tower',
			backstory: '',
			firstMessages: ['Hello.'],
			exampleMessages: [{ id: 'e1', user: 'hi', character: 'well met' }],
			thumbnail: null,
			relatedCharacters: '',
			characterBook: { name: '', description: '', entries: [] },
			worldInfo: ''
		},
		...overrides
	};
}

test('parseCharacterRow keeps a well-formed record intact', () => {
	const parsed = parseCharacterRow(row());
	assert.ok(parsed);
	assert.equal(parsed.id, 'c1');
	assert.equal(parsed.name, 'Merlin');
	assert.equal(parsed.data.description, 'old');
	assert.deepEqual(parsed.data.firstMessages, ['Hello.']);
	assert.equal(parsed.data.exampleMessages[0].character, 'well met');
	assert.ok(parsed.createdAt instanceof Date);
});

test('parseCharacterRow rejects rows without an identity', () => {
	assert.equal(parseCharacterRow({ name: 'No id' }), null);
	assert.equal(parseCharacterRow({ id: 'x' }), null);
	assert.equal(parseCharacterRow(null), null);
	assert.equal(parseCharacterRow('a string'), null);
});

test('parseCharacterRow repairs missing and mistyped fields', () => {
	const parsed = parseCharacterRow({
		id: 'c2',
		name: 'Idris',
		data: {
			description: 42,
			firstMessages: [],
			exampleMessages: 'not an array',
			characterBook: { entries: [{ keys: 'not-an-array' }] }
		}
	});

	assert.ok(parsed);
	assert.equal(parsed.data.description, '');
	// An empty greeting list would render an editor with no greeting at all.
	assert.deepEqual(parsed.data.firstMessages, ['']);
	assert.deepEqual(parsed.data.exampleMessages, []);
	assert.deepEqual(parsed.data.characterBook.entries, []);
});

test('parseCharacterRow keeps cardMeta so exported cards round-trip', () => {
	const parsed = parseCharacterRow(
		row({ data: { ...row().data, cardMeta: { creator: 'someone', tags: ['x'] } } })
	);
	assert.ok(parsed);
	assert.deepEqual(parsed.data.cardMeta, { creator: 'someone', tags: ['x'] });
});

test('example messages without ids get one, empty rows are dropped', () => {
	const parsed = parseCharacterRow(
		row({
			data: {
				...row().data,
				exampleMessages: [
					{ user: 'hi', character: 'hello' },
					{ user: '', character: '' },
					{ character: 'only char' }
				]
			}
		})
	);
	assert.ok(parsed);
	assert.equal(parsed.data.exampleMessages.length, 2);
	for (const message of parsed.data.exampleMessages) {
		assert.ok(message.id, 'every row needs an id for the keyed each block');
	}
});

test('book entries are validated and unusable ones dropped', () => {
	const parsed = parseCharacterRow(
		row({
			data: {
				...row().data,
				characterBook: {
					name: 'Lore',
					entries: [
						{ id: 'b1', keys: ['dragon'], content: 'Dragons hoard.', enabled: false },
						{ keys: [], content: '' },
						'garbage'
					]
				}
			}
		})
	);
	assert.ok(parsed);
	assert.equal(parsed.data.characterBook.name, 'Lore');
	assert.equal(parsed.data.characterBook.entries.length, 1);
	assert.equal(parsed.data.characterBook.entries[0].enabled, false);
});

test('parseBackup reports what it could not use', () => {
	const backup = parseBackup({
		app: 'char-creator',
		characters: [row(), { name: 'broken' }, row({ id: 'c3', name: 'Second' })],
		characterImages: [{ id: 'c1', image: 'data:image/png;base64,AAA' }, { id: 'x' }],
		characterAssets: [{ id: 'a1', characterId: 'c1', uri: 'data:,' }]
	});

	assert.equal(backup.characters.length, 2);
	assert.equal(backup.skippedCharacters, 1);
	assert.equal(backup.images.length, 1);
	assert.equal(backup.assets.length, 1);
	assert.equal(backup.carriesApiKey, false);
});

test('parseBackup detects an API key without applying it', () => {
	const backup = parseBackup({ settings: { apiKey: 'sk-live-123', model: 'm' } });
	assert.equal(backup.carriesApiKey, true);
	assert.equal(backup.settings?.model, 'm');
});

test('parseBackup tolerates a file that is not a backup at all', () => {
	const backup = parseBackup({ something: 'else' });
	assert.equal(backup.characters.length, 0);
	assert.equal(backup.settings, null);
	assert.equal(backup.carriesApiKey, false);
	assert.deepEqual(parseBackup(null).characters, []);
});

test('extractLegacyMedia recovers inline avatar and assets', () => {
	const legacy = extractLegacyMedia({
		data: {
			image: 'data:image/jpeg;base64,AAA',
			assets: [{ name: 'voice.ogg', type: 'voice', uri: 'data:audio/ogg;base64,BBB' }]
		}
	});

	assert.equal(legacy.image, 'data:image/jpeg;base64,AAA');
	assert.equal(legacy.assets.length, 1);
	assert.equal(legacy.assets[0].type, 'voice');
	assert.equal(legacy.assets[0].name, 'voice.ogg');
});

test('extractLegacyMedia ignores assets without a payload', () => {
	const legacy = extractLegacyMedia({ data: { assets: [{ name: 'empty' }] } });
	assert.deepEqual(legacy.assets, []);
	assert.equal(legacy.image, null);
});

test('parseImageRows and parseAssetRows filter unusable rows', () => {
	assert.deepEqual(parseImageRows([{ id: 'a' }, { id: 'b', image: 'x' }]), [
		{ id: 'b', image: 'x' }
	]);
	assert.deepEqual(
		parseAssetRows([{ id: 'a' }, { id: 'b', characterId: 'c', type: 'weird' }]).map((a) => a.type),
		['image']
	);
	assert.deepEqual(parseImageRows('nope'), []);
});
