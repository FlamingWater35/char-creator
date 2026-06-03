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

  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();

      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          try {
            let { width, height } = img;

            // Downscale proportionally if dimensions exceed maximums
            if (width > maxWidth || height > maxHeight) {
              const ratio = Math.min(maxWidth / width, maxHeight / height);
              width = Math.floor(width * ratio);
              height = Math.floor(height * ratio);
            }

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");

            if (!ctx) {
              return reject(new Error("Canvas 2D context is not available in this browser."));
            }

            // Draw image at new scaled dimensions
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL(type, quality));
          } catch (drawErr) {
            reject(new Error("Failed to process image drawing on canvas."));
          }
        };

        img.onerror = () => reject(new Error("The provided file is not a valid or supported image format."));
        img.src = e.target?.result as string;
      };

      reader.onerror = () => reject(new Error("Failed to read the file from disk."));
      reader.readAsDataURL(file);
    } catch (err: any) {
      reject(new Error(err.message || "Unknown error during image compression setup."));
    }
  });
}

/**
 * Creates a standard uncompressed tEXt chunk for PNG metadata injection.
 */
function createTextChunk(keyword: string, dataB64: string): Uint8Array {
  const textStr = keyword + '\0' + dataB64;
  const dataEncoder = new TextEncoder();
  const dataBytes = dataEncoder.encode(textStr);

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
 */
export function injectCharacterCardMetadata(base64Image: string, v3JsonString: string, v2JsonString: string): string {
  try {
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

    const v3Chunk = createTextChunk('ccv3', v3Data);
    const v2Chunk = createTextChunk('chara', v2Data);

    let iendPos = bytes.length - 12;
    for (let i = bytes.length - 4; i >= 0; i--) {
      if (bytes[i] === 73 && bytes[i+1] === 69 && bytes[i+2] === 78 && bytes[i+3] === 68) { // IEND
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
  } catch (error: any) {
    console.error("Metadata injection failed:", error);
    throw new Error("Unable to encode character data into PNG format. Ensure the image is valid.");
  }
}

/**
 * Extracts and decodes character card metadata from standard uncompressed tEXt or compressed zTXt chunks.
 */
export async function extractCharacterCardMetadata(arrayBuffer: ArrayBuffer): Promise<string | null> {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);

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
      let nullPos = chunkData.indexOf(0);

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
            console.error("Failed to decode base64 tEXt chunk payload:", e);
          }
        }
      }
    } else if (type === 'zTXt') {
      const chunkData = bytes.subarray(pos + 8, pos + 8 + length);
      let nullPos = chunkData.indexOf(0);

      if (nullPos !== -1) {
        const keyword = decoder.decode(chunkData.subarray(0, nullPos));
        if (keyword === 'ccv3' || keyword === 'chara') {
          if (chunkData[nullPos + 1] === 0) { // Compression method 0
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
                return decodedStr; // Payload might not be base64 wrapped
              }
            } catch (e) {
              console.error("Failed to decompress zTXt metadata segment:", e);
            }
          }
        }
      }
    }
    pos += 12 + length;
  }
  return null;
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
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
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
      } catch (err) {
        reject(new Error("Error generating thumbnail: " + String(err)));
      }
    };
    img.onerror = () => reject(new Error("Browser failed to decode the source image format"));
    img.src = base64;
  });
}
