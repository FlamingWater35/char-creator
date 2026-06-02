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
 * Computes the CRC-32 checksum for a given byte buffer.
 * @param buffer The input byte array.
 * @returns The computed 32-bit CRC.
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
 * by processing chunks, avoiding call stack size limits on large arrays.
 * @param u8Arr Input byte buffer.
 * @returns Base64 encoded string.
 */
function uint8ToBase64(u8Arr: Uint8Array): string {
  let binary = '';
  const CHUNK_SIZE = 8192;
  for (let i = 0; i < u8Arr.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode.apply(null, Array.from(u8Arr.subarray(i, i + CHUNK_SIZE)));
  }
  return btoa(binary);
}

/**
 * Creates a standard uncompressed tEXt chunk for PNG metadata injection.
 * @param keyword Metadata key (e.g. 'ccv3', 'chara').
 * @param dataB64 Base64 encoded JSON string.
 * @returns Formatted PNG tEXt chunk bytes.
 */
function createTextChunk(keyword: string, dataB64: string): Uint8Array {
  const textStr = keyword + '\0' + dataB64;
  const dataEncoder = new TextEncoder();
  const dataBytes = dataEncoder.encode(textStr);

  const chunk = new Uint8Array(4 + 4 + dataBytes.length + 4);
  const view = new DataView(chunk.buffer);

  // Length of data segment
  view.setUint32(0, dataBytes.length, false);

  // Chunk Type: tEXt (116, 69, 88, 116)
  chunk[4] = 116; chunk[5] = 69; chunk[6] = 88; chunk[7] = 116;

  // Insert Data segment
  chunk.set(dataBytes, 8);

  // Calculate and write CRC over Type and Data
  const crcInput = chunk.subarray(4, 8 + dataBytes.length);
  view.setUint32(8 + dataBytes.length, crc32(crcInput), false);

  return chunk;
}

/**
 * Injects custom metadata chunks right before the PNG's IEND chunk.
 * UTF-8 compatible encoding ensures complete support for multilingual characters.
 * @param base64Image Original PNG Data URL.
 * @param v3JsonString Standard SillyTavern V3 spec payload.
 * @param v2JsonString Standard SillyTavern V2 spec payload.
 * @returns Metadata-injected Base64 PNG Data URL.
 */
export function injectCharacterCardMetadata(base64Image: string, v3JsonString: string, v2JsonString: string): string {
  const b64DataPart = base64Image.split(',')[1];
  if (!b64DataPart) throw new Error("Invalid base64 image data structure");

  const binaryString = atob(b64DataPart);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const utf8Encoder = new TextEncoder();
  const v3Data = uint8ToBase64(utf8Encoder.encode(v3JsonString));
  const v2Data = uint8ToBase64(utf8Encoder.encode(v2JsonString));

  // Generate chunks for both specs to ensure universal compatibility
  const v3Chunk = createTextChunk('ccv3', v3Data);
  const v2Chunk = createTextChunk('chara', v2Data);

  // Locate the IEND chunk position (step back from end of file)
  let iendPos = bytes.length - 12;
  for (let i = bytes.length - 4; i >= 0; i--) {
    if (bytes[i] === 73 && bytes[i+1] === 69 && bytes[i+2] === 78 && bytes[i+3] === 68) {
      iendPos = i - 4;
      break;
    }
  }

  const beforeIend = bytes.subarray(0, iendPos);
  const iendChunk = bytes.subarray(iendPos);

  const newPng = new Uint8Array(beforeIend.length + v3Chunk.length + v2Chunk.length + iendChunk.length);
  newPng.set(beforeIend, 0);
  newPng.set(v3Chunk, beforeIend.length);
  newPng.set(v2Chunk, beforeIend.length + v3Chunk.length);
  newPng.set(iendChunk, beforeIend.length + v3Chunk.length + v2Chunk.length);

  return 'data:image/png;base64,' + uint8ToBase64(newPng);
}

/**
 * Extracts and decodes character card metadata from standard uncompressed tEXt
 * or zlib-compressed zTXt PNG chunks.
 * @param arrayBuffer The binary file buffer.
 * @returns Decoded JSON metadata string, or null if no spec matches are found.
 */
export async function extractCharacterCardMetadata(arrayBuffer: ArrayBuffer): Promise<string | null> {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);

  // Validate standard PNG file signature
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
    throw new Error("Invalid PNG file signature: File is not a valid PNG.");
  }

  let pos = 8;
  const decoder = new TextDecoder("utf-8");

  while (pos < bytes.length) {
    if (pos + 8 > bytes.length) break;
    const length = view.getUint32(pos, false);
    const typeBytes = bytes.subarray(pos + 4, pos + 8);
    const type = decoder.decode(typeBytes);

    if (type === 'tEXt') {
      const chunkData = bytes.subarray(pos + 8, pos + 8 + length);
      let nullPos = -1;
      for (let i = 0; i < chunkData.length; i++) {
        if (chunkData[i] === 0) {
          nullPos = i;
          break;
        }
      }
      if (nullPos !== -1) {
        const keyword = decoder.decode(chunkData.subarray(0, nullPos));
        if (keyword === 'ccv3' || keyword === 'chara') {
          try {
            const base64Data = decoder.decode(chunkData.subarray(nullPos + 1));
            const binaryString = atob(base64Data.trim());
            const len = binaryString.length;
            const jsonBytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              jsonBytes[i] = binaryString.charCodeAt(i);
            }
            return decoder.decode(jsonBytes);
          } catch (e) {
            console.error("Failed to decode tEXt chunk segment:", e);
          }
        }
      }
    } else if (type === 'zTXt') {
      const chunkData = bytes.subarray(pos + 8, pos + 8 + length);
      let nullPos = -1;
      for (let i = 0; i < chunkData.length; i++) {
        if (chunkData[i] === 0) {
          nullPos = i;
          break;
        }
      }
      if (nullPos !== -1) {
        const keyword = decoder.decode(chunkData.subarray(0, nullPos));
        if (keyword === 'ccv3' || keyword === 'chara') {
          const compressionMethod = chunkData[nullPos + 1];
          if (compressionMethod === 0) { // Method 0 indicates zlib deflate
            try {
              const compressedData = chunkData.subarray(nullPos + 2);
              const decompressed = await decompressZlib(compressedData);
              const decodedStr = decoder.decode(decompressed);

              try {
                const binaryString = atob(decodedStr.trim());
                const len = binaryString.length;
                const jsonBytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                  jsonBytes[i] = binaryString.charCodeAt(i);
                }
                return decoder.decode(jsonBytes);
              } catch {
                return decodedStr; // Falls back to raw JSON if payload was not base64-wrapped
              }
            } catch (e) {
              console.error("Failed to decompress zTXt metadata segment:", e);
            }
          }
        }
      }
    }

    pos += 12 + length; // length (4) + type (4) + data (length) + crc (4)
  }

  return null;
}

/**
 * Asynchronously decompresses compressed zlib byte streams.
 * Uses strict 'unknown as BlobPart' casting to resolve TypeScript 5.7+ generic ArrayBufferLike mismatches.
 * @param compressedBytes Compressed deflate bytes.
 * @returns Decompressed byte array.
 */
async function decompressZlib(compressedBytes: Uint8Array): Promise<Uint8Array> {
  const blob = new Blob([compressedBytes as unknown as BlobPart]);
  const ds = new DecompressionStream("deflate");
  const decompressedStream = blob.stream().pipeThrough(ds);
  const response = new Response(decompressedStream);
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Generates a default black fallback PNG when a card contains no avatar image.
 * @returns Fallback Base64 PNG Data URL.
 */
export function generateDefaultBlackPNG(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 400, 400);
  }
  return canvas.toDataURL('image/png');
}

/**
 * Generates an optimized JPEG thumbnail for the dashboard view, avoiding heavy IndexedDB overheads.
 * @param base64 High-res source image Base64.
 * @param maxSize Maximum thumbnail dimensions.
 * @returns Ultra-compressed JPEG Base64.
 */
export async function generateThumbnail(base64: string, maxSize = 128): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width *= ratio;
        height *= ratio;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      } else {
        reject(new Error("Failed to construct thumbnail canvas context"));
      }
    };
    img.onerror = () => reject(new Error("Failed to process image format"));
    img.src = base64;
  });
}
