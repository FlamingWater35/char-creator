/**
 * Model reasoning blocks are not part of a character card, so they must never
 * reach the editor. Kept in its own module so the behaviour is testable without
 * pulling in the SvelteKit runtime or the OpenAI SDK.
 */

const TAGS = 'think|thinking|reasoning|scratchpad';

const openTag = new RegExp(`<(${TAGS})>`, 'i');
const closeTag = new RegExp(`</(${TAGS})>`, 'i');
const pairedBlock = new RegExp(`<(${TAGS})>[\\s\\S]*?</\\1>`, 'gi');
const danglingOpen = new RegExp(`<(${TAGS})>[\\s\\S]*$`, 'i');
const danglingClose = new RegExp(`^[\\s\\S]*?</(${TAGS})>`, 'i');

/**
 * Strips chain-of-thought segments, including blocks the model never closed.
 *
 * Order matters: the greedy "dangling closer" rule must only run once every
 * well-formed pair is gone, otherwise it would swallow the answer that sits
 * between two closed blocks.
 */
export function stripReasoning(raw: string): string {
	if (!raw) return '';

	let content = raw.replace(pairedBlock, '');

	// An opener with no matching closer means the rest of the response is
	// reasoning rather than the answer.
	if (!closeTag.test(content)) {
		content = content.replace(danglingOpen, '');
	} else if (!openTag.test(content)) {
		// A closer with no opener: the preamble before it is reasoning.
		content = content.replace(danglingClose, '');
	}

	// Collapse the blank lines left behind by removed blocks.
	return content.replace(/\n{3,}/g, '\n\n').trim();
}
