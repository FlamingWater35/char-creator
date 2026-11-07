import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	summarizeCharacter,
	formatTokens,
	relativeTime,
	initials,
	firstLine
} from '../src/lib/format.ts';

const full = {
	name: 'Merlin',
	data: {
		mainPrompt: 'An ancient wizard.',
		description: 'A tall old man with a silver beard.',
		personality: 'Patient and cryptic.',
		scenario: 'A stone tower in the forest.',
		backstory: 'Born of a mortal mother.',
		relatedCharacters: 'Arthur, Nimue.',
		firstMessages: ['*The door creaks open.*', ''],
		exampleMessages: [
			{ user: 'Hello', character: '*He nods.*' },
			{ user: 'ignored', character: '   ' }
		],
		characterBook: {
			entries: [
				{ content: 'Fireball is evocation.', enabled: true },
				{ content: 'Hidden fact.', enabled: false }
			]
		}
	}
};

test('summarizeCharacter counts filled sections', () => {
	const summary = summarizeCharacter(full);
	assert.equal(summary.filledSections, 5);
	assert.equal(summary.totalSections, 5);
});

test('summarizeCharacter counts non-empty greetings and replies', () => {
	const summary = summarizeCharacter(full);
	assert.equal(summary.greetings, 1);
	assert.equal(summary.examples, 1);
});

test('summarizeCharacter counts lore entries and active ones separately', () => {
	const summary = summarizeCharacter(full);
	assert.equal(summary.loreEntries, 2);
	assert.equal(summary.activeLoreEntries, 1);
});

test('summarizeCharacter excludes disabled lore from the token estimate', () => {
	const withDisabled = {
		name: 'X',
		data: {
			characterBook: { entries: [{ content: 'a'.repeat(4000), enabled: false }] }
		}
	};
	const summary = summarizeCharacter(withDisabled);
	assert.equal(summary.tokens, 0);
});

test('summarizeCharacter tolerates a bare record', () => {
	const summary = summarizeCharacter({ name: 'Blank', data: {} });
	assert.equal(summary.tokens, 0);
	assert.equal(summary.filledSections, 0);
	assert.equal(summary.greetings, 0);
	assert.equal(summary.loreEntries, 0);
});

test('summarizeCharacter token estimate matches chars / 4', () => {
	const summary = summarizeCharacter({
		name: 'X',
		data: { description: 'a'.repeat(400) }
	});
	assert.equal(summary.tokens, 100);
});

test('formatTokens renders small, thousands and large counts', () => {
	assert.equal(formatTokens(0), '0');
	assert.equal(formatTokens(812), '812');
	assert.equal(formatTokens(1000), '1k');
	assert.equal(formatTokens(12400), '12k');
	assert.equal(formatTokens(4200), '4.2k');
	assert.equal(formatTokens(150000), '150k');
});

test('formatTokens never renders negative or NaN', () => {
	assert.equal(formatTokens(-5), '0');
	assert.equal(formatTokens(Number.NaN), '0');
});

test('relativeTime describes recent edits', () => {
	const now = new Date('2026-05-01T12:00:00Z');
	assert.equal(relativeTime(new Date('2026-05-01T11:59:40Z'), now), 'just now');
	assert.equal(relativeTime(new Date('2026-05-01T11:30:00Z'), now), '30m ago');
	assert.equal(relativeTime(new Date('2026-05-01T09:00:00Z'), now), '3h ago');
	assert.equal(relativeTime(new Date('2026-04-29T12:00:00Z'), now), '2d ago');
});

test('relativeTime falls back to a date past a week', () => {
	const now = new Date('2026-05-01T12:00:00Z');
	const label = relativeTime(new Date('2026-01-15T12:00:00Z'), now);
	assert.match(label, /Jan/);
	assert.doesNotMatch(label, /2026/);
});

test('relativeTime includes the year for older edits', () => {
	const now = new Date('2026-05-01T12:00:00Z');
	assert.match(relativeTime(new Date('2024-01-15T12:00:00Z'), now), /2024/);
});

test('relativeTime tolerates missing and invalid dates', () => {
	assert.equal(relativeTime(null), 'unknown');
	assert.equal(relativeTime(undefined), 'unknown');
	assert.equal(relativeTime('not a date'), 'unknown');
});

test('relativeTime accepts ISO strings and epoch numbers', () => {
	const now = new Date('2026-05-01T12:00:00Z');
	assert.equal(relativeTime('2026-05-01T11:00:00Z', now), '1h ago');
	assert.equal(relativeTime(now.getTime() - 3600_000, now), '1h ago');
});

test('initials uses the first letters of two words', () => {
	assert.equal(initials('Merlin the Wise'), 'MW');
	assert.equal(initials('merlin'), 'ME');
	assert.equal(initials('  '), '?');
	assert.equal(initials(null), '?');
});

test('initials does not split a surrogate pair', () => {
	assert.equal(initials('🎭 Actor'), '🎭A');
	assert.equal(initials('🎭'), '🎭');
});

test('firstLine takes the first non-empty line and truncates', () => {
	assert.equal(firstLine('\n\n  hello  \nworld'), 'hello');
	assert.equal(firstLine('   '), '');
	assert.equal(firstLine(null), '');
	assert.equal(firstLine('x'.repeat(50), 10), 'xxxxxxxxx…');
});
