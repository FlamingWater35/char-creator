/**
 * Browser regression suite for the editor's per-field AI actions.
 *
 * These assertions cannot be expressed as `node:test` unit tests: they cover the
 * wiring between a click, the prompt that is actually sent, the textarea that is
 * actually updated, and the undo buffer. Everything runs against a real browser
 * with `/api/generate` intercepted, so no model is called and no key is needed.
 *
 * Usage:
 *   npm run dev                     # in one terminal
 *   npm run test:browser            # in another
 *
 * Playwright is optional: if it (or a browser build) is missing, the script
 * prints a skip notice and exits 0 so CI without browsers stays green.
 */
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const BASE = process.env.BASE_URL || 'http://localhost:5199';

/** Resolve Playwright from the project or, failing that, the npx cache. */
async function loadPlaywright() {
	try {
		return await import('playwright');
	} catch {
		/* fall through */
	}

	const roots = [];
	if (process.env.PW_PATH) roots.push(process.env.PW_PATH);
	const npx = `${process.env.LOCALAPPDATA}\\npm-cache\\_npx`;
	if (existsSync(npx)) {
		for (const dir of execSync(`dir /b "${npx}"`, { encoding: 'utf8' }).split(/\r?\n/)) {
			if (!dir.trim()) continue;
			roots.push(`file:///${npx}/${dir.trim()}/node_modules/playwright/index.mjs`);
		}
	}

	for (const root of roots) {
		try {
			const mod = await import(root);
			return mod.default ?? mod;
		} catch {
			/* try the next candidate */
		}
	}
	return null;
}

const pw = await loadPlaywright();
if (!pw) {
	console.log('SKIP  Playwright is not available; install it to run browser tests.');
	process.exit(0);
}

let browser;
for (const kind of ['chromium', 'firefox']) {
	try {
		browser = await pw[kind].launch();
		console.log(`# using ${kind}`);
		break;
	} catch {
		/* try the next engine */
	}
}
if (!browser) {
	console.log('SKIP  No Playwright browser is installed (run: npx playwright install).');
	process.exit(0);
}

let failures = 0;
function check(label, cond, extra = '') {
	console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra && !cond ? ' :: ' + extra : ''}`);
	if (!cond) failures++;
}

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

let sent = [];
await page.route('**/api/generate', async (route) => {
	sent.push(route.request().postDataJSON());
	await route.fulfill({
		status: 200,
		contentType: 'application/json',
		body: JSON.stringify({ result: `NEW-${sent.length}` })
	});
});

const seed = () =>
	page.evaluate(async () => {
		localStorage.setItem('or_key', 'test-key');
		localStorage.removeItem('or_enhance_prompt');
		localStorage.removeItem('or_regenerate_prompt');

		// The app creates the schema through Dexie on mount. Opening the database
		// here first would create an empty version 1 and race that upgrade, so
		// poll until the `characters` store actually exists.
		const openDb = async () => {
			for (let attempt = 0; attempt < 60; attempt++) {
				const db = await new Promise((res, rej) => {
					const req = indexedDB.open('CharCreatorDB');
					req.onsuccess = () => res(req.result);
					req.onerror = () => rej(req.error);
				});
				if (db.objectStoreNames.contains('characters')) return db;
				db.close();
				await new Promise((r) => setTimeout(r, 100));
			}
			throw new Error('CharCreatorDB never finished initialising');
		};

		const db = await openDb();
		const tx = db.transaction('characters', 'readwrite');
		tx.objectStore('characters').put({
			id: 'browser-1',
			name: 'Test Subject',
			createdAt: new Date(),
			updatedAt: new Date(),
			data: {
				mainPrompt: 'A test subject for automation.',
				description: 'DESC-ORIGINAL',
				personality: 'PERSONALITY-ORIGINAL',
				scenario: 'SCENARIO-ORIGINAL',
				backstory: '',
				relatedCharacters: '',
				firstMessages: ['GREETING-ORIGINAL', 'ALT-ORIGINAL'],
				exampleMessages: [{ id: 'ex1', user: 'USER-TURN', character: 'CHAR-ORIGINAL' }],
				thumbnail: null,
				characterBook: { name: '', description: '', entries: [] },
				worldInfo: ''
			}
		});
		await new Promise((res) => (tx.oncomplete = res));
		db.close();
	});

try {
	await page.goto(BASE + '/', { waitUntil: 'networkidle' });
	await seed();
	await page.goto(BASE + '/editor/browser-1', { waitUntil: 'networkidle' });
	await page.waitForTimeout(700);

	const desc = page.locator('textarea[aria-label="Description"]');

	// ---- Regenerate replaces the field, without sending the stale draft ------
	sent = [];
	await page.getByRole('button', { name: /^Regenerate/ }).first().click();
	await page.waitForTimeout(900);
	check('regenerate replaces the field', (await desc.inputValue()).startsWith('NEW-'));
	const regen = sent.at(-1)?.prompt ?? '';
	check('regenerate prompt carries the concept', regen.includes('A test subject for automation.'));
	check('regenerate prompt names the field', regen.includes('Description'));
	check('regenerate prompt omits the stale draft', !regen.includes('DESC-ORIGINAL'));

	// ---- Undo restores, then disappears --------------------------------------
	const undo = page.getByRole('button', { name: /Undo last AI rewrite of Description/ });
	check('undo appears after a rewrite', (await undo.count()) === 1);
	await undo.click();
	await page.waitForTimeout(400);
	check('undo restores the original', (await desc.inputValue()) === 'DESC-ORIGINAL');
	check('undo is consumed', (await undo.count()) === 0);

	// ---- Enhance keeps the draft and adds sheet context ----------------------
	sent = [];
	await page.getByRole('button', { name: /^Enhance/ }).first().click();
	await page.waitForTimeout(900);
	const enh = sent.at(-1)?.prompt ?? '';
	check('enhance prompt includes the draft', enh.includes('DESC-ORIGINAL'));
	check('enhance prompt includes other fields', /Personality: PERSONALITY-ORIGINAL/.test(enh));

	// ---- An alternate greeting sees the main one, not itself -----------------
	sent = [];
	await page
		.locator('div.bg-card.border.rounded-lg')
		.nth(1)
		.getByRole('button', { name: /^Regenerate/ })
		.click();
	await page.waitForTimeout(900);
	const alt = sent.at(-1)?.prompt ?? '';
	check('alt greeting prompt names the alternate', alt.includes('First Message 1'));
	check('alt greeting prompt omits its own draft', !alt.includes('ALT-ORIGINAL'));
	check('alt greeting prompt includes the main greeting', alt.includes('GREETING-ORIGINAL'));

	// ---- A custom template reaches the model --------------------------------
	await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: /FIELD ACTION PROMPTS/i }).click();
	await page.waitForTimeout(300);
	await page.locator('#prompt-enhance').fill('MARKER {concept} || {field}');
	await page.waitForTimeout(600);
	check(
		'custom template persists',
		(await page.evaluate(() => localStorage.getItem('or_enhance_prompt')))?.startsWith('MARKER') ===
			true
	);

	await page.goto(BASE + '/editor/browser-1', { waitUntil: 'networkidle' });
	await page.waitForTimeout(700);
	sent = [];
	await page.getByRole('button', { name: /^Enhance/ }).first().click();
	await page.waitForTimeout(900);
	const custom = sent.at(-1)?.prompt ?? '';
	check('custom template is used verbatim', custom.startsWith('MARKER'));
	check('custom placeholders are substituted', custom.includes('A test subject for automation.'));

	// ---- A failed request leaves the field untouched ------------------------
	await page.unroute('**/api/generate');
	await page.route('**/api/generate', (route) =>
		route.fulfill({
			status: 500,
			contentType: 'application/json',
			body: JSON.stringify({ error: 'simulated failure' })
		})
	);
	await page.goto(BASE + '/editor/browser-1', { waitUntil: 'networkidle' });
	await page.waitForTimeout(700);
	const before = await desc.inputValue();
	await page.getByRole('button', { name: /^Regenerate/ }).first().click();
	await page.waitForTimeout(900);
	check('failed generation preserves the field', (await desc.inputValue()) === before);

	check('no uncaught page errors', pageErrors.length === 0, JSON.stringify(pageErrors));
} catch (err) {
	console.log('FAIL  suite crashed ::', err?.message);
	failures++;
} finally {
	await browser.close();
}

console.log(`\n${failures === 0 ? 'All browser checks passed.' : failures + ' browser check(s) failed.'}`);
process.exit(failures === 0 ? 0 : 1);
