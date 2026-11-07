/**
 * PNG CRC-32 Lookup Table for fast cyclic redundancy check calculations.
 */
const crcTable: number[] = [];
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c >>>= 1;
  }
  crcTable[i] = c;
}

/**
 * Computes the CRC-32 checksum for a given byte buffer to validate PNG chunk integrity.
 */
function crc32(buffer: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return crc ^ 0xffffffff;
}

/**
 * Converts a Uint8Array to a base64 string in a memory-safe manner
 * avoiding call stack size limits on massive payload arrays.
 */
function uint8ToBase64(u8Arr: Uint8Array): string {
  try {
    let binary = '';
    const CHUNK_SIZE = 8192;
    for (let i = 0; i < u8Arr.length; i += CHUNK_SIZE) {
      binary += String.fromCharCode.apply(null, Array.from(u8Arr.subarray(i, i + CHUNK_SIZE)));
    }
    return btoa(binary);
  } catch (e) {
    console.error("Failed base64 chunked conversion:", e);
    throw new Error("Image buffer is too large or corrupted for conversion.");
  }
}

/**
 * Loads an image, honouring the EXIF orientation flag where the browser
 * supports it. Without this, phone photos upload sideways.
 */
async function loadOrientedImage(
  file: Blob
): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      // `imageOrientation` is widely supported but missing from older lib.dom.
      return await createImageBitmap(file, {
        imageOrientation: "from-image",
      } as ImageBitmapOptions);
    } catch {
      // Fall through to the <img> path below.
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The provided file is not a valid or supported image format."));
    };
    img.src = url;
  });
}

/**
 * Dynamically scales down and compresses an image via HTML5 Canvas.
 * Used to prevent massive file uploads from exhausting IndexedDB limits.
 *
 * @param file Original File object from the file input
 * @param options Configurations for dimensions, mime-type, and quality
 * @returns Promise resolving to a base64 Data URL string
 */
export async function compressImage(
  file: File,
  options: { maxWidth?: number; maxHeight?: number; type?: string; quality?: number } = {}
): Promise<string> {
  const { maxWidth = 1536, maxHeight = 1536, type = "image/png", quality = 0.9 } = options;

  const source = await loadOrientedImage(file);

  try {
    let { width, height } = source as { width: number; height: number };

    if (!width || !height) {
      throw new Error("The provided image has no readable dimensions.");
    }

    // Downscale proportionally if dimensions exceed maximums
    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.max(1, Math.floor(width * ratio));
      height = Math.max(1, Math.floor(height * ratio));
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Canvas 2D context is not available in this browser.");
    }

    // JPEG has no alpha channel: transparent pixels would render black.
    if (type === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }

    ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
    return canvas.toDataURL(type, quality);
  } finally {
    if ("close" in source && typeof source.close === "function") source.close();
  }
}

/**
 * Re-encodes any image data URL as PNG.
 *
 * Character card metadata can only be injected into PNG chunks, but avatars are
 * stored as JPEG to keep IndexedDB small — so the conversion happens here, once,
 * at export time.
 */
export async function toPngDataUrl(base64Image: string): Promise<string> {
  if (base64Image.startsWith("data:image/png")) return base64Image;

  const source = await loadOrientedImage(await (await fetch(base64Image)).blob());

  try {
    const { width, height } = source as { width: number; height: number };
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context is not available in this browser.");

    ctx.drawImage(source as CanvasImageSource, 0, 0);
    return canvas.toDataURL("image/png");
  } finally {
    if ("close" in source && typeof source.close === "function") source.close();
  }
}

/**
 * Creates a standard uncompressed tEXt chunk for PNG metadata injection.
 *
 * PNG only permits Latin-1 in tEXt, so the keyword is written as ASCII and the
 * payload is base64 (also ASCII). Any byte that would break the encoding is
 * replaced rather than corrupting the chunk.
 */
function createTextChunk(keyword: string, dataB64: string): Uint8Array {
  const safeKeyword = keyword.replace(/[^\x20-\x7e]/g, '?');
  const safeData = dataB64.replace(/[^\x20-\x7e]/g, '');

  const textStr = safeKeyword + '\0' + safeData;
  const dataBytes = new TextEncoder().encode(textStr);

  const chunk = new Uint8Array(4 + 4 + dataBytes.length + 4);
  const view = new DataView(chunk.buffer);

  view.setUint32(0, dataBytes.length, false);

  chunk[4] = 116; chunk[5] = 69; chunk[6] = 88; chunk[7] = 116; // tEXt
  chunk.set(dataBytes, 8);

  const crcInput = chunk.subarray(4, 8 + dataBytes.length);
  view.setUint32(8 + dataBytes.length, crc32(crcInput), false);

  return chunk;
}

/**
 * Injects standard JSON metadata directly into the image buffer as tEXt chunks.
 * Ensures the exported image retains Character Card data.
 *
 * Walks the chunk list instead of searching for the IEND byte pattern, and
 * drops any card chunk already present so re-exporting cannot accumulate
 * duplicate payloads.
 */
export function injectCharacterCardMetadata(base64Image: string, v3JsonString: string, v2JsonString: string): string {
  try {
    const b64DataPart = base64Image.split(',')[1];
    if (!b64DataPart) throw new Error("Invalid base64 image data structure");

    const binaryString = atob(b64DataPart);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const utf8Encoder = new TextEncoder();
    const v3Chunk = createTextChunk('ccv3', uint8ToBase64(utf8Encoder.encode(v3JsonString)));
    const v2Chunk = createTextChunk('chara', uint8ToBase64(utf8Encoder.encode(v2JsonString)));

    const kept: Uint8Array[] = [bytes.subarray(0, 8)];
    let pos = 8;
    let sawIend = false;

    while (pos + 8 <= bytes.length) {
      const length = new DataView(bytes.buffer, bytes.byteOffset + pos, 4).getUint32(0, false);
      const end = pos + 12 + length;
      if (end > bytes.length) break;

      const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);

      if (type === 'IEND') {
        sawIend = true;
        break;
      }

      const isCardChunk =
        (type === 'tEXt' || type === 'iTXt') &&
        (() => {
          const data = bytes.subarray(pos + 8, pos + 8 + length);
          const nul = data.indexOf(0);
          if (nul === -1) return false;
          const keyword = String.fromCharCode(...data.subarray(0, nul));
          return keyword === 'ccv3' || keyword === 'chara';
        })();

      if (!isCardChunk) kept.push(bytes.subarray(pos, end));
      pos = end;
    }

    if (!sawIend) throw new Error("PNG has no IEND chunk");

    const iend = bytes.subarray(pos);
    const total =
      kept.reduce((sum, chunk) => sum + chunk.length, 0) + v3Chunk.length + v2Chunk.length + iend.length;

    const newPng = new Uint8Array(total);
    let offset = 0;
    for (const chunk of kept) {
      newPng.set(chunk, offset);
      offset += chunk.length;
    }
    newPng.set(v3Chunk, offset);
    offset += v3Chunk.length;
    newPng.set(v2Chunk, offset);
    offset += v2Chunk.length;
    newPng.set(iend, offset);

    return 'data:image/png;base64,' + uint8ToBase64(newPng);
  } catch (error) {
    console.error("Metadata injection failed:", error);
    throw new Error("Unable to encode character data into PNG format. Ensure the image is valid.");
  }
}

/**
 * Decodes a base64 payload into UTF-8 text, tolerating payloads that were
 * written without the base64 wrapper.
 */
function decodePayload(raw: string, decoder: TextDecoder): string {
  try {
    const binaryString = atob(raw.trim());
    const jsonBytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      jsonBytes[i] = binaryString.charCodeAt(i);
    }
    return decoder.decode(jsonBytes);
  } catch {
    return raw;
  }
}

/**
 * Extracts and decodes character card metadata from tEXt, zTXt or iTXt chunks.
 */
export async function extractCharacterCardMetadata(arrayBuffer: ArrayBuffer): Promise<string | null> {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);

  if (
    bytes.length < 8 ||
    bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47
  ) {
    throw new Error("Invalid PNG file signature: File is not a valid PNG.");
  }

  const decoder = new TextDecoder("utf-8");
  let pos = 8;
  let fallback: string | null = null;

  while (pos + 8 <= bytes.length) {
    const length = view.getUint32(pos, false);
    const end = pos + 12 + length;
    if (length < 0 || end > bytes.length) break;

    const type = decoder.decode(bytes.subarray(pos + 4, pos + 8));
    const chunkData = bytes.subarray(pos + 8, pos + 8 + length);

    if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
      const nul = chunkData.indexOf(0);

      if (nul !== -1) {
        const keyword = decoder.decode(chunkData.subarray(0, nul));

        if (keyword === 'ccv3' || keyword === 'chara') {
          try {
            let payload = '';

            if (type === 'tEXt') {
              payload = decoder.decode(chunkData.subarray(nul + 1));
            } else if (type === 'zTXt') {
              if (chunkData[nul + 1] === 0) {
                const decompressed = await decompressZlib(chunkData.subarray(nul + 2));
                payload = decoder.decode(decompressed);
              }
            } else {
              // iTXt: keyword \0 compFlag compMethod langTag \0 transKeyword \0 text
              const compressionFlag = chunkData[nul + 1];
              const rest = chunkData.subarray(nul + 3);
              const langEnd = rest.indexOf(0);
              const afterLang = langEnd === -1 ? rest : rest.subarray(langEnd + 1);
              const transEnd = afterLang.indexOf(0);
              const textBytes = transEnd === -1 ? afterLang : afterLang.subarray(transEnd + 1);

              if (compressionFlag === 1) {
                const decompressed = await decompressZlib(textBytes);
                payload = decoder.decode(decompressed);
              } else {
                payload = decoder.decode(textBytes);
              }
            }

            if (payload) {
              const decoded = decodePayload(payload, decoder);
              // Prefer v3, but keep looking in case it is unusable.
              if (keyword === 'ccv3') {
                try {
                  JSON.parse(decoded);
                  return decoded;
                } catch {
                  fallback ??= decoded;
                }
              } else {
                try {
                  JSON.parse(decoded);
                  fallback ??= decoded;
                } catch {
                  fallback ??= decoded;
                }
              }
            }
          } catch (e) {
            console.error(`Failed to decode ${type} metadata chunk:`, e);
          }
        }
      }
    } else if (type === 'IEND') {
      break;
    }

    pos = end;
  }

  return fallback;
}

/**
 * Asynchronously decompresses native zlib byte streams embedded in images.
 */
async function decompressZlib(compressedBytes: Uint8Array): Promise<Uint8Array> {
  try {
    const blob = new Blob([compressedBytes as unknown as BlobPart]);
    const ds = new DecompressionStream("deflate");
    const decompressedStream = blob.stream().pipeThrough(ds);
    const response = new Response(decompressedStream);
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  } catch (error) {
    console.error("Zlib decompression failed:", error);
    throw new Error("Unable to uncompress zTXt image data. Data may be corrupted.");
  }
}

/**
 * Generates an empty default black PNG payload when an avatar is missing.
 */
export function generateDefaultBlackPNG(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, 400, 400);
    }
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.error("Failed to generate default PNG via Canvas:", err);
    throw new Error("Browser Canvas API failed to construct an image fallback.");
  }
}

/**
 * Constructs an optimized JPEG thumbnail using browser native Canvas drawing.
 * Defends against massive uncompressed Base64 arrays freezing Dexie transactions.
 */
export async function generateThumbnail(base64: string, maxSize = 128): Promise<string> {
  const response = await fetch(base64);
  const source = await loadOrientedImage(await response.blob());

  try {
    let { width, height } = source as { width: number; height: number };
    if (width > maxSize || height > maxSize) {
      const ratio = Math.min(maxSize / width, maxSize / height);
      width = Math.max(1, Math.round(width * ratio));
      height = Math.max(1, Math.round(height * ratio));
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to construct thumbnail canvas context");

    // Thumbnails are JPEG, so transparent source pixels need a backdrop.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch (err) {
    throw new Error("Error generating thumbnail: " + String(err));
  } finally {
    if ("close" in source && typeof source.close === "function") source.close();
  }
}
