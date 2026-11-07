import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	renderPrompt,
	buildPromptContext,
	isPromptCustomized,
	DEFAULT_ENHANCE_PROMPT,
	DEFAULT_REGENERATE_PROMPT,
	PROMPT_PLACEHOLDERS
} from '../src/lib/prompts.ts';

test('renderPrompt substitutes every supported placeholder', () => {
	const out = renderPrompt(
		'concept={concept}\nfield={field}\ncontent={content}\ncontext={context}',
		{
			concept: 'Merlin',
			field: 'Description',
			content: 'an old man',
			context: 'Name: Merlin'
		}
	);

	assert.equal(out, 'concept=Merlin\nfield=Description\ncontent=an old man\ncontext=Name: Merlin');
});

test('renderPrompt accepts doubled braces and inner whitespace', () => {
	const out = renderPrompt('{{concept}} / { content } / {field}', {
		concept: 'A',
		content: 'B',
		field: 'C'
	});

	assert.equal(out, 'A / B / C');
});

test('renderPrompt replaces repeated placeholders', () => {
	const out = renderPrompt('{field} and {field} again', { field: 'Scenario' });
	assert.equal(out, 'Scenario and Scenario again');
});

test('renderPrompt fills sensible text for missing values', () => {
	const out = renderPrompt('[{concept}][{field}][{content}][{context}]', {});

	assert.match(out, /no concept provided/);
	assert.match(out, /unknown field/);
	assert.match(out, /no content yet/);
	assert.match(out, /no other fields/);
});

test('renderPrompt leaves unknown placeholders untouched', () => {
	const out = renderPrompt('{concept} {nonsense}', { concept: 'X' });
	assert.equal(out, 'X {nonsense}');
});

test('renderPrompt does not re-expand placeholders inside values', () => {
	// A character concept that itself contains braces must not be interpreted.
	const out = renderPrompt('{concept}', { concept: 'a mage who says {field}' });
	assert.equal(out, 'a mage who says {field}');
});

test('default templates reference the placeholders they need', () => {
	assert.match(DEFAULT_ENHANCE_PROMPT, /\{content\}/);
	assert.match(DEFAULT_ENHANCE_PROMPT, /\{concept\}/);
	assert.match(DEFAULT_REGENERATE_PROMPT, /\{concept\}/);
	// Regenerate must not feed the stale draft back in.
	assert.doesNotMatch(DEFAULT_REGENERATE_PROMPT, /\{content\}/);
});

test('every advertised placeholder appears in the enhance default', () => {
	for (const placeholder of PROMPT_PLACEHOLDERS) {
		assert.ok(
			DEFAULT_ENHANCE_PROMPT.includes(placeholder.token),
			`${placeholder.token} is documented but unused by the default template`
		);
	}
});

const character = {
	name: 'Merlin',
	data: {
		description: 'An ancient wizard.',
		personality: 'Patient and cryptic.',
		scenario: 'A stone tower.',
		backstory: 'Born long ago.',
		relatedCharacters: 'Arthur.',
		firstMessages: ['*The door creaks open.*']
	}
};

test('buildPromptContext summarises the filled fields', () => {
	const context = buildPromptContext(character, 'Backstory');

	assert.match(context, /Name: Merlin/);
	assert.match(context, /Description: An ancient wizard\./);
	assert.match(context, /Personality: Patient and cryptic\./);
	assert.match(context, /Scenario: A stone tower\./);
	assert.match(context, /Related characters: Arthur\./);
});

test('buildPromptContext omits the field being written', () => {
	const context = buildPromptContext(character, 'Backstory');
	assert.doesNotMatch(context, /Born long ago/);
});

test('buildPromptContext includes the greeting when writing a dialogue example', () => {
	const context = buildPromptContext(character, 'Example Message 0');
	assert.match(context, /Main greeting/);
});

test('buildPromptContext gives an alternate greeting the main one as context', () => {
	const context = buildPromptContext(character, 'First Message 1');
	assert.match(context, /Main greeting/);
});

test('buildPromptContext does not leak the greeting into a greeting rewrite', () => {
	const context = buildPromptContext(character, 'First Message 0');
	assert.doesNotMatch(context, /Main greeting/);
});

test('buildPromptContext reports emptiness instead of an empty string', () => {
	const context = buildPromptContext(
		{ name: '', data: {} },
		'Description'
	);
	assert.match(context, /no other fields/);
});

test('buildPromptContext respects the total limit', () => {
	const long = 'x'.repeat(5000);
	const context = buildPromptContext(
		{ name: 'N', data: { description: long, personality: long } },
		'Scenario',
		200
	);

	assert.ok(context.length <= 200, `expected <= 200 chars, got ${context.length}`);
	assert.match(context, /…$/);
});

test('isPromptCustomized ignores surrounding whitespace', () => {
	assert.equal(isPromptCustomized(`  ${DEFAULT_ENHANCE_PROMPT}\n`, DEFAULT_ENHANCE_PROMPT), false);
	assert.equal(isPromptCustomized('something else', DEFAULT_ENHANCE_PROMPT), true);
	assert.equal(isPromptCustomized('', DEFAULT_ENHANCE_PROMPT), true);
	assert.equal(isPromptCustomized(undefined, DEFAULT_ENHANCE_PROMPT), true);
});
