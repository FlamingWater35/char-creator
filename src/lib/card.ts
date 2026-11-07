import type { Character, CharacterBook, CharacterBookEntry } from '#lib/db';

/**
 * Fields this app reads and writes itself. Everything else on an imported card
 * is preserved verbatim in `data.cardMeta` so exporting never silently drops
 * spec fields the editor does not expose (system_prompt, tags, creator, ...).
 */
export const OWNED_CARD_FIELDS = [
	'name',
	'description',
	'personality',
	'scenario',
	'first_mes',
	'alternate_greetings',
	'mes_example',
	'character_book',
	'assets',
	'creation_date',
	'modification_date'
] as const;

/** Book-level keys the editor models. */
const OWNED_BOOK_FIELDS = ['name', 'description', 'entries'] as const;

/** Entry-level keys the editor models. */
const OWNED_ENTRY_FIELDS = [
	'id',
	'keys',
	'key',
	'secondary_keys',
	'keysecondary',
	'content',
	'enabled',
	'disable',
	'priority',
	'order',
	'comment',
	'constant'
] as const;

function omit(source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
	const blocked = new Set(keys);
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(source)) {
		if (blocked.has(key)) continue;
		if (value === undefined) continue;
		out[key] = value;
	}
	return out;
}

/**
 * Collects the unmodelled top-level card fields from a decoded payload.
 *
 * `extensions` is intentionally kept: third-party extensions must survive, and
 * `buildCardPayload` merges them back with this app's own keys.
 */
export function buildCardMeta(data: Record<string, unknown>): Record<string, unknown> | undefined {
	const meta = omit(data, OWNED_CARD_FIELDS);
	return Object.keys(meta).length > 0 ? meta : undefined;
}

/**
 * Collects the unmodelled fields of a single lorebook entry.
 */
export function buildEntryExtra(entry: Record<string, unknown>): Record<string, unknown> | undefined {
	const extra = omit(entry, OWNED_ENTRY_FIELDS);
	return Object.keys(extra).length > 0 ? extra : undefined;
}

/**
 * Collects the unmodelled fields of a character book.
 */
export function buildBookExtra(book: Record<string, unknown>): Record<string, unknown> | undefined {
	const extra = omit(book, OWNED_BOOK_FIELDS);
	return Object.keys(extra).length > 0 ? extra : undefined;
}

/**
 * A serialised lorebook entry. The index signature is deliberate: whatever the
 * source card carried that this app does not model is passed straight through.
 */
export type SerializedEntry = Record<string, unknown> & {
	id: string;
	keys: string[];
	key: string[];
	secondary_keys: string[];
	keysecondary: string[];
	content: string;
	enabled: boolean;
	disable: boolean;
	priority: number;
	order: number;
	comment: string;
	constant: boolean;
};

export type SerializedBook = Record<string, unknown> & {
	name: string;
	description: string;
	entries: SerializedEntry[];
};

/**
 * The card payload both the v2 and v3 writers emit. Typed explicitly rather
 * than inferred so the preserved spec fields stay addressable by name.
 */
export type CardPayload = Record<string, unknown> & {
	name: string;
	description: string;
	personality: string;
	scenario: string;
	first_mes: string;
	alternate_greetings: string[];
	mes_example: string;
	character_book: SerializedBook;
	assets: { type: string; uri: string; name: string; ext: string }[];
	extensions: Record<string, unknown>;
	creation_date: number;
	modification_date: number;
};

/**
 * Serialises a lorebook entry, letting preserved extras act as the base so any
 * field this app does not understand survives the round-trip.
 */
export function serializeEntry(entry: CharacterBookEntry, priority: number): SerializedEntry {
	return {
		...(entry.extra ?? {}),
		id: entry.id,
		keys: entry.keys,
		key: entry.keys,
		secondary_keys: entry.secondary_keys || [],
		keysecondary: entry.secondary_keys || [],
		content: entry.content,
		enabled: entry.enabled,
		disable: !entry.enabled,
		priority,
		order: priority,
		comment: entry.comment || '',
		constant: entry.constant ?? false
	};
}

/**
 * Serialises the embedded lorebook, preserving unmodelled book fields.
 */
export function serializeBook(book: CharacterBook): SerializedBook {
	return {
		...(book.extra ?? {}),
		name: book.name || '',
		description: book.description || '',
		entries: (book.entries || []).map((entry) => serializeEntry(entry, entry.priority ?? 10))
	};
}

/**
 * Converts `{{char}}:` / `{{user}}:` blocks in `mes_example` into editable rows.
 */
export function parseExampleMessages(mesExample: string | undefined | null) {
	if (!mesExample) return [];
	const examples: { id: string; user: string; character: string }[] = [];

	try {
		const blocks = mesExample.split(/<START>/i);
		for (const block of blocks) {
			const trimmedBlock = block.trim();
			if (!trimmedBlock) continue;

			let userText = '';
			let charText = '';

			for (const line of trimmedBlock.split('\n')) {
				const lower = line.trim().toLowerCase();
				if (lower.startsWith('{{user}}:')) {
					userText = line.substring(line.indexOf(':') + 1).trim();
				} else if (lower.startsWith('{{char}}:')) {
					if (charText) charText += '\n';
					charText += line.substring(line.indexOf(':') + 1).trim();
				} else if (charText) {
					charText += '\n' + line.trim();
				} else if (userText) {
					userText += '\n' + line.trim();
				} else {
					charText = line.trim();
				}
			}

			if (charText || userText) {
				examples.push({ id: crypto.randomUUID(), user: userText, character: charText });
			}
		}
	} catch (e) {
		console.warn('Failed to parse some dialogue examples', e);
	}

	return examples;
}

const SECTION_HEADERS = ['Personality', 'Scenario', 'Backstory', 'Related Characters'];

/**
 * Pulls a `Header: value` block out of a merged description, so descriptions
 * produced by older versions of this app can be split back into subfields.
 */
export function extractSection(text: string, header: string) {
	try {
		// A section body ends at the next known header, at a blank line (the usual
		// way an unlabelled closing paragraph is separated), or at the end of the
		// text. Without the blank-line stop the last header would swallow every
		// trailing paragraph into itself and silently delete it from the
		// description.
		const regex = new RegExp(
			`(?:^|\\n)${header}\\s*:\\s*([\\s\\S]*?)(?=\\n(?:${SECTION_HEADERS.join('|')})\\s*:|\\n[ \\t]*\\n|$)`,
			'i'
		);
		const match = text.match(regex);
		if (match) {
			return { content: match[1].trim(), cleanedText: text.replace(match[0], '').trim() };
		}
	} catch (e) {
		console.warn(`Failed to extract section ${header}`, e);
	}
	return { content: '', cleanedText: text };
}

/**
 * Builds the `mes_example` string from editable dialogue rows.
 */
export function serializeExampleMessages(messages: { user: string; character: string }[]): string {
	return messages
		.filter((ex) => ex.character.trim())
		.map((ex) => {
			let block = '<START>\n';
			if (ex.user.trim()) block += `{{user}}: ${ex.user.trim()}\n`;
			block += `{{char}}: ${ex.character.trim()}`;
			return block;
		})
		.join('\n\n');
}

/**
 * Keys the v2/v3 spec expects to exist even when empty. Consumers (SillyTavern,
 * card editors) read them unconditionally, so emitting them avoids undefined
 * values downstream. Imported values override these through `preserved`.
 */
const CARD_DEFAULTS: Record<string, unknown> = {
	creator_notes: '',
	system_prompt: '',
	post_history_instructions: '',
	group_only_greetings: [],
	tags: [],
	creator: '',
	character_version: ''
};

/**
 * Everything needed to emit a spec-compliant payload, assembled once so the v2
 * and v3 writers cannot drift apart.
 */
export function buildCardPayload(
	character: Character,
	options: {
		description: string;
		personality: string;
		scenario: string;
		assets: { type: string; uri: string; name: string; ext: string }[];
	}
): CardPayload {
	const meta = (character.data.cardMeta ?? {}) as Record<string, unknown>;
	const preserved = omit(meta, OWNED_CARD_FIELDS);

	const preservedExtensions =
		meta.extensions && typeof meta.extensions === 'object'
			? (meta.extensions as Record<string, unknown>)
			: {};

	const extensions = {
		...preservedExtensions,
		char_creator: { mainPrompt: character.data.mainPrompt },
		world_info: character.data.worldInfo || ''
	};

	return {
		...CARD_DEFAULTS,
		...preserved,
		name: character.name,
		description: options.description,
		personality: options.personality,
		scenario: options.scenario,
		first_mes: character.data.firstMessages[0] || '',
		alternate_greetings: character.data.firstMessages.slice(1).filter(Boolean),
		mes_example: serializeExampleMessages(character.data.exampleMessages),
		character_book: serializeBook(character.data.characterBook),
		assets: options.assets,
		extensions,
		creation_date: Math.floor(character.createdAt.getTime() / 1000),
		modification_date: Math.floor(character.updatedAt.getTime() / 1000)
	};
}
