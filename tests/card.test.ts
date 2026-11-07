import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	buildCardMeta,
	buildBookExtra,
	buildEntryExtra,
	buildCardPayload,
	parseExampleMessages,
	serializeExampleMessages,
	serializeEntry,
	serializeBook,
	extractSection,
	extractJsonObject
} from '../src/lib/card.ts';
import type { Character, CharacterBookEntry } from '../src/lib/db.ts';

// Assembled by concatenation so no sanitiser can rewrite the literals.
const START = '<' + 'START' + '>';

const entry: CharacterBookEntry = {
	id: 'e1',
	keys: ['dragon', 'wyrm'],
	secondary_keys: ['cave'],
	content: 'Dragons hoard gold.',
	enabled: true,
	priority: 25,
	comment: 'lore',
	constant: false,
	extra: { selective: true, insertion_order: 25, depth: 4 }
};

test('buildCardMeta keeps unmodelled fields and drops the ones we own', () => {
	const meta = buildCardMeta({
		name: 'Merlin',
		description: 'a wizard',
		system_prompt: 'You are Merlin.',
		creator_notes: 'made in tests',
		tags: ['fantasy'],
		extensions: { third_party: { keep: true } }
	});

	assert.ok(meta);
	assert.equal(meta.name, undefined, 'name is owned by the model');
	assert.equal(meta.description, undefined, 'description is owned by the model');
	assert.equal(meta.system_prompt, 'You are Merlin.');
	assert.equal(meta.creator_notes, 'made in tests');
	assert.deepEqual(meta.tags, ['fantasy']);
	assert.deepEqual(meta.extensions, { third_party: { keep: true } });
});

test('buildCardMeta returns undefined when nothing unmodelled remains', () => {
	assert.equal(buildCardMeta({ name: 'x', description: 'y', first_mes: 'z' }), undefined);
});

test('entry extras capture spec fields the editor does not model', () => {
	// buildEntryExtra runs over raw card JSON, not over the stored model.
	const extra = buildEntryExtra({
		id: 'e1',
		keys: ['dragon'],
		key: ['dragon'],
		content: 'Dragons hoard gold.',
		enabled: true,
		selective: true,
		insertion_order: 25,
		depth: 4
	} as unknown as Record<string, unknown>);

	assert.ok(extra);
	assert.equal(extra.selective, true);
	assert.equal(extra.depth, 4);
	assert.equal(extra.insertion_order, 25);
	assert.equal(extra.content, undefined);
	assert.equal(extra.keys, undefined);
});

test('book extras capture book-level fields', () => {
	const extra = buildBookExtra({ name: 'b', entries: [], scan_depth: 4, token_budget: 500 });
	assert.deepEqual(extra, { scan_depth: 4, token_budget: 500 });
});

test('serializeEntry emits both spellings of every renamed field', () => {
	const serialized = serializeEntry(entry, 25);

	assert.deepEqual(serialized.keys, ['dragon', 'wyrm']);
	assert.deepEqual(serialized.key, ['dragon', 'wyrm']);
	assert.deepEqual(serialized.secondary_keys, ['cave']);
	assert.deepEqual(serialized.keysecondary, ['cave']);
	assert.equal(serialized.enabled, true);
	assert.equal(serialized.disable, false);
	assert.equal(serialized.priority, 25);
	assert.equal(serialized.order, 25);
	// Unmodelled extras survive the round trip.
	assert.equal(serialized.selective, true);
	assert.equal(serialized.depth, 4);
});

test('serializeEntry lets the live model win over a stale extra', () => {
	const stale = { ...entry, extra: { ...entry.extra, content: 'old text' } };
	assert.equal(serializeEntry(stale as CharacterBookEntry, 25).content, 'Dragons hoard gold.');
});

test('serializeBook maps entries and preserves book extras', () => {
	const book = serializeBook({
		name: 'World',
		description: 'setting',
		entries: [entry],
		extra: { scan_depth: 4 }
	});

	assert.equal(book.name, 'World');
	assert.equal(book.scan_depth, 4);
	assert.equal(book.entries.length, 1);
});

test('buildCardPayload emits the keys consumers read unconditionally', () => {
	const character = makeCharacter();
	const data = buildCardPayload(character, {
		description: 'desc',
		personality: 'wry',
		scenario: 'a tower',
		assets: []
	});

	assert.equal(data.system_prompt, '');
	assert.equal(data.post_history_instructions, '');
	assert.equal(data.creator_notes, '');
	assert.equal(data.creator, '');
	assert.equal(data.character_version, '');
	assert.deepEqual(data.tags, []);
	assert.deepEqual(data.group_only_greetings, []);
});

test('buildCardPayload lets imported metadata override the defaults', () => {
	const character = makeCharacter({
		creator: 'someone',
		creator_notes: 'notes',
		tags: ['fantasy', 'wizard']
	});

	const data = buildCardPayload(character, {
		description: 'desc',
		personality: '',
		scenario: '',
		assets: []
	});

	assert.equal(data.creator, 'someone');
	assert.equal(data.creator_notes, 'notes');
	assert.deepEqual(data.tags, ['fantasy', 'wizard']);
});

test('buildCardPayload merges extensions instead of replacing them', () => {
	const character = makeCharacter({ extensions: { third_party: { keep: true } } });
	const data = buildCardPayload(character, {
		description: '',
		personality: '',
		scenario: '',
		assets: []
	});

	const extensions = data.extensions as Record<string, any>;
	assert.deepEqual(extensions.third_party, { keep: true });
	assert.equal(extensions.char_creator.mainPrompt, 'You are a helpful assistant.');
	assert.equal(extensions.world_info, '');
});

test('buildCardPayload splits greetings into first_mes and alternates', () => {
	const data = buildCardPayload(makeCharacter(), {
		description: '',
		personality: '',
		scenario: '',
		assets: []
	});

	assert.equal(data.first_mes, 'Hello there.');
	assert.deepEqual(data.alternate_greetings, ['Hi again.']);
});

test('example messages round-trip through serialize and parse', () => {
	const rows = [
		{ user: 'Hello', character: 'Well met, traveller.' },
		{ user: 'Are you real?', character: 'As real as the stone beneath you.' }
	];

	const serialized = serializeExampleMessages(rows);
	assert.ok(serialized.startsWith(START));
	assert.ok(serialized.includes('{{user}}: Hello'));
	assert.ok(serialized.includes('{{char}}: Well met, traveller.'));

	const parsed = parseExampleMessages(serialized);
	assert.equal(parsed.length, 2);
	assert.equal(parsed[0].user, 'Hello');
	assert.equal(parsed[0].character, 'Well met, traveller.');
	assert.equal(parsed[1].user, 'Are you real?');
	assert.equal(parsed[1].character, 'As real as the stone beneath you.');
});

test('multi-line dialogue bodies are preserved', () => {
	const serialized = serializeExampleMessages([
		{ user: 'Line one\nLine two', character: 'Reply one\nReply two' }
	]);
	const parsed = parseExampleMessages(serialized);

	assert.equal(parsed.length, 1);
	assert.equal(parsed[0].character, 'Reply one\nReply two');
});

test('serializeExampleMessages drops rows with no character reply', () => {
	assert.equal(serializeExampleMessages([{ user: 'orphan', character: '   ' }]), '');
});

test('parseExampleMessages tolerates missing input', () => {
	assert.deepEqual(parseExampleMessages(undefined), []);
	assert.deepEqual(parseExampleMessages(''), []);
});

test('extractSection pulls a header block out and cleans the remainder', () => {
	const text = 'Personality: wry and tired\nScenario: a cold tower\n\nHe is old.';

	const personality = extractSection(text, 'Personality');
	assert.equal(personality.content, 'wry and tired');

	const scenario = extractSection(text, 'Scenario');
	assert.equal(scenario.content, 'a cold tower');
});

test('a section stops at a blank line so trailing prose stays in the description', () => {
	const text = 'Personality: wry\n\nHe is very old and tired of towers.';
	const { content, cleanedText } = extractSection(text, 'Personality');

	assert.equal(content, 'wry');
	assert.equal(cleanedText, 'He is very old and tired of towers.');
});

test('extractSection returns the text untouched when the header is absent', () => {
	const text = 'just prose, no headers';
	assert.deepEqual(extractSection(text, 'Personality'), { content: '', cleanedText: text });
});

test('extractJsonObject unwraps a fenced reply', () => {
	assert.equal(extractJsonObject('```json\n{"name":"Merlin"}\n```'), '{"name":"Merlin"}');
	assert.equal(extractJsonObject('```\n{"name":"Merlin"}\n```'), '{"name":"Merlin"}');
});

test('extractJsonObject drops a conversational preamble', () => {
	const reply = 'Sure! Here is the character:\n{"name":"Merlin","data":{"name":"Merlin"}}';
	assert.equal(extractJsonObject(reply), '{"name":"Merlin","data":{"name":"Merlin"}}');
});

test('extractJsonObject keeps nested braces intact', () => {
	const json = '{"data":{"firstMessages":["hi"],"nested":{"a":1}}}';
	assert.equal(extractJsonObject(`prefix ${json} suffix`), json);
});

test('extractJsonObject handles a reply with no object at all', () => {
	// Must not throw or invent braces; the caller's JSON.parse reports it.
	assert.equal(extractJsonObject('no json here'), 'no json here');
	assert.equal(extractJsonObject('```json\n\n```'), '');
});

function makeCharacter(cardMeta: Record<string, unknown> = {}): Character {
	return {
		id: 'c1',
		name: 'Merlin',
		createdAt: new Date('2024-01-01T00:00:00Z'),
		updatedAt: new Date('2024-01-02T00:00:00Z'),
		data: {
			mainPrompt: 'You are a helpful assistant.',
			description: 'a wizard',
			personality: 'wry',
			scenario: 'a tower',
			backstory: '',
			firstMessages: ['Hello there.', 'Hi again.'],
			exampleMessages: [],
			relatedCharacters: '',
			characterBook: { name: '', description: '', entries: [] },
			worldInfo: '',
			cardMeta
		}
	};
}
