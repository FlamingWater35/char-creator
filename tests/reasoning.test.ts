import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripReasoning } from '../src/lib/reasoning.ts';

/**
 * Tags are assembled by concatenation so that no editor, formatter or HTML
 * sanitiser can quietly rewrite the literals this suite depends on.
 */
const open = (name = 'think') => '<' + name + '>';
const close = (name = 'think') => '<' + '/' + name + '>';
const block = (body: string, name = 'think') => open(name) + body + close(name);

test('strips a closed block, keeping the surrounding text', () => {
	assert.equal(stripReasoning('before ' + block('hidden') + ' after'), 'before  after');
});

test('strips a block that is the whole response', () => {
	assert.equal(stripReasoning(block('only reasoning here')), '');
});

test('strips an unclosed block to the end of the response', () => {
	const input = 'Merlin is a wizard. ' + open() + 'the user probably wants more detail';
	assert.equal(stripReasoning(input), 'Merlin is a wizard.');
});

test('strips a dangling closer together with the preamble before it', () => {
	const input = 'let me think about this... ' + close() + ' Here is the answer.';
	assert.equal(stripReasoning(input), 'Here is the answer.');
});

test('handles the thinking, reasoning and scratchpad aliases', () => {
	assert.equal(stripReasoning(block('x', 'thinking') + 'ok'), 'ok');
	assert.equal(stripReasoning(block('x', 'reasoning') + 'ok'), 'ok');
	assert.equal(stripReasoning(block('x', 'scratchpad') + 'ok'), 'ok');
});

test('strips several blocks in one response', () => {
	const input = 'a' + block('1') + 'b' + block('2') + 'c';
	assert.equal(stripReasoning(input), 'abc');
});

test('does not swallow the answer that sits between two closed blocks', () => {
	const input = 'Intro ' + block('one') + ' Answer ' + block('two') + ' Outro';
	assert.equal(stripReasoning(input), 'Intro  Answer  Outro');
});

test('leaves ordinary prose untouched', () => {
	const prose = 'I think this character is brave. She thinks otherwise.';
	assert.equal(stripReasoning(prose), prose);
});

test('returns an empty string for empty input', () => {
	assert.equal(stripReasoning(''), '');
});
