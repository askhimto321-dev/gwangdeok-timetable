function findEndOfCentralDirectory(view) {
  const minOffset = Math.max(0, view.byteLength - 0xffff - 22);
  for (let offset = view.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("유효한 ZIP 파일이 아닙니다.");
}

function decodeFileName(bytes, utf8) {
  const encodings = utf8 ? ["utf-8"] : ["euc-kr", "utf-8"];
  for (const encoding of encodings) {
    try {
      return new TextDecoder(encoding, { fatal: false }).decode(bytes);
    } catch {
      // Try the next decoder.
    }
  }
  return Array.from(bytes, byte => String.fromCharCode(byte)).join("");
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("이 브라우저는 ZIP 압축 해제를 지원하지 않습니다. 최신 Chrome 또는 Edge를 사용해주세요.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function extractEntry(data, view, entry) {
  const localOffset = entry.localOffset;
  if (view.getUint32(localOffset, true) !== 0x04034b50) {
    throw new Error(`${entry.name}: ZIP 내부 헤더가 손상되었습니다.`);
  }
  const localNameLength = view.getUint16(localOffset + 26, true);
  const localExtraLength = view.getUint16(localOffset + 28, true);
  const dataStart = localOffset + 30 + localNameLength + localExtraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > data.byteLength) throw new Error(`${entry.name}: 압축 데이터가 손상되었습니다.`);
  const compressed = data.slice(dataStart, dataEnd);

  let output;
  if (entry.method === 0) output = compressed;
  else if (entry.method === 8) output = await inflateRaw(compressed);
  else throw new Error(`${entry.name}: 지원하지 않는 ZIP 압축 방식(${entry.method})입니다.`);

  if (entry.uncompressedSize !== 0xffffffff && output.byteLength !== entry.uncompressedSize) {
    throw new Error(`${entry.name}: 압축 해제된 파일 크기가 일치하지 않습니다.`);
  }
  return output;
}

export async function extractPdfFilesFromZip(file, options = {}) {
  if (!file) throw new Error("ZIP 파일을 선택해주세요.");
  const maxFiles = options.maxFiles ?? 100;
  const maxTotalBytes = options.maxTotalBytes ?? 500 * 1024 * 1024;
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const eocdOffset = findEndOfCentralDirectory(view);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);
  if (totalEntries === 0xffff || centralOffset === 0xffffffff) {
    throw new Error("ZIP64 형식은 지원하지 않습니다. 일반 ZIP으로 다시 압축해주세요.");
  }

  const entries = [];
  let offset = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < totalEntries; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("ZIP 중앙 디렉터리가 손상되었습니다.");
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const nameBytes = data.slice(offset + 46, offset + 46 + nameLength);
    const name = decodeFileName(nameBytes, Boolean(flags & 0x0800)).replace(/\\/g, "/");

    if ((flags & 0x0001) !== 0) throw new Error(`${name}: 암호화된 ZIP 파일은 지원하지 않습니다.`);
    if (!name.endsWith("/") && /\.pdf$/i.test(name) && !name.includes("__MACOSX/")) {
      totalUncompressed += uncompressedSize;
      if (totalUncompressed > maxTotalBytes) throw new Error("압축 해제 후 PDF 전체 용량이 500MB를 초과합니다.");
      entries.push({ name, flags, method, compressedSize, uncompressedSize, localOffset });
      if (entries.length > maxFiles) throw new Error(`한 번에 최대 ${maxFiles}개의 PDF를 처리할 수 있습니다.`);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }

  if (!entries.length) throw new Error("ZIP 안에서 PDF 파일을 찾지 못했습니다.");

  const results = new Array(entries.length);
  const concurrency = Math.max(1, Math.min(3, Number(options.concurrency || 3)));
  let cursor = 0;
  let completed = 0;
  const worker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= entries.length) return;
      const entry = entries[index];
      const bytes = await extractEntry(data, view, entry);
      const fileName = entry.name.split("/").pop() || `모집요강_${index + 1}.pdf`;
      results[index] = {
        name: fileName,
        fullName: entry.name,
        blob: new Blob([bytes], { type: "application/pdf" }),
      };
      completed += 1;
      options.onProgress?.(completed, entries.length, entry.name);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, () => worker()));
  return results;
}
