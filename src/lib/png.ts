const crcTable: number[] = [];
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c >>>= 1;
  }
  crcTable[i] = c;
}

function crc32(buffer: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return crc ^ 0xffffffff;
}

// Memory-safe base64 encoding chunk by chunk to prevent max call stack limits
function uint8ToBase64(u8Arr: Uint8Array): string {
  let binary = '';
  const CHUNK_SIZE = 8192;
  for (let i = 0; i < u8Arr.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode.apply(null, Array.from(u8Arr.subarray(i, i + CHUNK_SIZE)));
  }
  return btoa(binary);
}

function createTextChunk(keyword: string, dataB64: string): Uint8Array {
  const textStr = keyword + '\0' + dataB64;
  const dataEncoder = new TextEncoder();
  const dataBytes = dataEncoder.encode(textStr);

  const chunk = new Uint8Array(4 + 4 + dataBytes.length + 4);
  const view = new DataView(chunk.buffer);

  // Length
  view.setUint32(0, dataBytes.length, false);

  // Type: tEXt (116, 69, 88, 116)
  chunk[4] = 116; chunk[5] = 69; chunk[6] = 88; chunk[7] = 116;

  // Data
  chunk.set(dataBytes, 8);

  // CRC over Type + Data
  const crcInput = chunk.subarray(4, 8 + dataBytes.length);
  view.setUint32(8 + dataBytes.length, crc32(crcInput), false);

  return chunk;
}

export function injectCharacterCardMetadata(base64Image: string, v3JsonString: string, v2JsonString: string): string {
  const b64DataPart = base64Image.split(',')[1];
  if (!b64DataPart) throw new Error("Invalid base64 image data");

  const binaryString = atob(b64DataPart);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // UTF-8 base64 encoding guarantees robust Unicode compatibility!
  const utf8Encoder = new TextEncoder();
  const v3Data = uint8ToBase64(utf8Encoder.encode(v3JsonString));
  const v2Data = uint8ToBase64(utf8Encoder.encode(v2JsonString));

  // For maximum compatibility, inject both V2 and V3 spec tags
  const v3Chunk = createTextChunk('ccv3', v3Data);
  const v2Chunk = createTextChunk('chara', v2Data);

  // Locate the start of the IEND chunk (usually at the very end of file)
  let iendPos = bytes.length - 12;
  for (let i = bytes.length - 4; i >= 0; i--) {
    if (bytes[i] === 73 && bytes[i+1] === 69 && bytes[i+2] === 78 && bytes[i+3] === 68) {
      iendPos = i - 4; // Step back to include the 4-byte chunk length
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

export function extractCharacterCardMetadata(arrayBuffer: ArrayBuffer): string | null {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);

  // Verify PNG signature
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
    throw new Error("Invalid PNG file signature");
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
            console.error("Failed to decode chunk data:", e);
            // Will fall through and search for alternative fallback chunks
          }
        }
      }
    }

    pos += 12 + length; // length (4) + type (4) + data (length) + crc (4)
  }

  return null;
}

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
