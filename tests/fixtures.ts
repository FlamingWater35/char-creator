/**
 * Test helpers: a minimal valid PNG plus a chunk walker, so the PNG metadata
 * code can be exercised without a browser canvas or fixture binaries.
 *
 * Note: the IDAT data here is stored, not deflated. These PNGs are only ever
 * parsed for chunk structure, never decoded.
 */

function crc32(buf: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of buf) {
		crc ^= byte;
		for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
	const out = new Uint8Array(12 + data.length);
	const view = new DataView(out.buffer);
	view.setUint32(0, data.length, false);
	for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
	out.set(data, 8);
	view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)), false);
	return out;
}

export function makeTestPng(width = 4, height = 4): Uint8Array {
	const ihdr = new Uint8Array(13);
	const ihdrView = new DataView(ihdr.buffer);
	ihdrView.setUint32(0, width, false);
	ihdrView.setUint32(4, height, false);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // colour type: RGBA

	const raw = new Uint8Array(height * (1 + width * 4));
	for (let y = 0; y < height; y++) {
		const rowStart = y * (1 + width * 4);
		raw[rowStart] = 0; // filter: none
		for (let x = 0; x < width; x++) {
			const p = rowStart + 1 + x * 4;
			raw[p] = 0x40;
			raw[p + 1] = 0x80;
			raw[p + 2] = 0xc0;
			raw[p + 3] = 0xff;
		}
	}

	const parts = [
		new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', raw),
		chunk('IEND', new Uint8Array(0))
	];

	const total = parts.reduce((sum, part) => sum + part.length, 0);
	const png = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		png.set(part, offset);
		offset += part.length;
	}
	return png;
}

/** Walks the chunk list and returns the type of every chunk, in order. */
export function listChunkTypes(bytes: Uint8Array): string[] {
	const types: string[] = [];
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let pos = 8;

	while (pos + 8 <= bytes.length) {
		const length = view.getUint32(pos, false);
		const type = String.fromCharCode(
			bytes[pos + 4],
			bytes[pos + 5],
			bytes[pos + 6],
			bytes[pos + 7]
		);
		types.push(type);
		pos += 12 + length;
		if (type === 'IEND') break;
	}

	return types;
}

export function countChunks(bytes: Uint8Array, type: string): number {
	return listChunkTypes(bytes).filter((t) => t === type).length;
}

export function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Builds a data URL from raw PNG bytes. */
export function toDataUrl(bytes: Uint8Array): string {
	return 'data:image/png;base64,' + Buffer.from(bytes).toString('base64');
}

/** Extracts the raw bytes back out of a data URL. */
export function fromDataUrl(url: string): Uint8Array {
	return new Uint8Array(Buffer.from(url.split(',')[1], 'base64'));
}
