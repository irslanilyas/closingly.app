#!/usr/bin/env node
/**
 * Converts CFF-flavoured OpenType (.otf) to WOFF2 with nothing but Node.
 *
 *   node scripts/fonts/otf-to-woff2.mjs <input.otf> <output.woff2>
 *
 * WOFF2 (W3C) for CFF outlines needs no glyph transform: the glyf/loca
 * transforms only exist for TrueType outlines. Every table is stored with
 * the null transform, in tag order, as one Brotli stream in font mode. The
 * result is decoded again before it is written, and every table must come
 * back byte-identical, so a bad file never lands in the repo.
 *
 * Used to produce app/fonts/general-sans/*.woff2 from the supplied files.
 */
import fs from "node:fs";
import zlib from "node:zlib";

const round4 = (n) => (n + 3) & ~3;
const tagNumber = (tag) => Buffer.from(tag, "latin1").readUInt32BE(0);

function readSfnt(buf) {
  const flavor = buf.toString("latin1", 0, 4);
  const count = buf.readUInt16BE(4);
  const tables = [];
  for (let i = 0; i < count; i++) {
    const o = 12 + i * 16;
    const offset = buf.readUInt32BE(o + 8);
    const length = buf.readUInt32BE(o + 12);
    tables.push({ tag: buf.toString("latin1", o, o + 4), data: buf.subarray(offset, offset + length) });
  }
  return { flavor, tables };
}

/** UIntBase128: big-endian base 128, high bit set on every byte but the last. */
function base128(n) {
  const out = [n & 0x7f];
  n = Math.floor(n / 128);
  while (n > 0) {
    out.unshift((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  if (out.length > 5) throw new Error("UIntBase128 overflow");
  return Buffer.from(out);
}

function readBase128(buf, pos) {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const byte = buf[pos + i];
    if (i === 0 && byte === 0x80) throw new Error("UIntBase128 with a leading zero");
    value = value * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) return [value, pos + i + 1];
  }
  throw new Error("UIntBase128 longer than 5 bytes");
}

function encode(otf) {
  const { flavor, tables: all } = readSfnt(otf);
  if (flavor !== "OTTO") throw new Error("Expected CFF outlines ('OTTO'); TrueType needs the glyf transform.");
  // A DSIG signs the original file layout, which this changes.
  const tables = all.filter((t) => t.tag !== "DSIG").sort((a, b) => tagNumber(a.tag) - tagNumber(b.tag));

  // Directory: flag 63 means "explicit tag follows"; transform version 0 is
  // the null transform for every table that is not glyf or loca.
  const directory = Buffer.concat(
    tables.map((t) => {
      const tag = Buffer.alloc(4);
      tag.write(t.tag, "latin1");
      return Buffer.concat([Buffer.from([63]), tag, base128(t.data.length)]);
    })
  );
  const stream = Buffer.concat(tables.map((t) => t.data));
  const compressed = zlib.brotliCompressSync(stream, {
    params: {
      [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_FONT,
      [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
      [zlib.constants.BROTLI_PARAM_LGWIN]: 24,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: stream.length,
    },
  });

  const header = Buffer.alloc(48);
  const length = round4(header.length + directory.length + compressed.length);
  const head = tables.find((t) => t.tag === "head").data;
  header.write("wOF2", 0, "latin1");
  header.write(flavor, 4, "latin1");
  header.writeUInt32BE(length, 8);
  header.writeUInt16BE(tables.length, 12);
  // totalSfntSize: the rebuilt font, table directory and 4-byte padding included.
  header.writeUInt32BE(12 + 16 * tables.length + tables.reduce((s, t) => s + round4(t.data.length), 0), 16);
  header.writeUInt32BE(compressed.length, 20);
  header.writeUInt16BE(head.readUInt16BE(4), 24); // major/minor version from fontRevision
  header.writeUInt16BE(head.readUInt16BE(6), 26);
  // No metadata or private blocks: the remaining fields stay zero.

  const out = Buffer.alloc(length);
  Buffer.concat([header, directory, compressed]).copy(out);
  return { woff2: out, tables };
}

function decode(woff2) {
  if (woff2.toString("latin1", 0, 4) !== "wOF2") throw new Error("Not WOFF2");
  if (woff2.readUInt32BE(8) !== woff2.length) throw new Error("Header length does not match the file");
  const count = woff2.readUInt16BE(12);
  const compressedLength = woff2.readUInt32BE(20);
  let pos = 48;
  const directory = [];
  for (let i = 0; i < count; i++) {
    const flags = woff2[pos++];
    const tag = woff2.toString("latin1", pos, pos + 4);
    pos += 4;
    let length;
    [length, pos] = readBase128(woff2, pos);
    if ((flags & 0x3f) !== 63 || flags >> 6 !== 0) throw new Error(`Unexpected flags on ${tag}`);
    directory.push({ tag, length });
  }
  const data = zlib.brotliDecompressSync(woff2.subarray(pos, pos + compressedLength));
  let offset = 0;
  return directory.map(({ tag, length }) => {
    const table = { tag, data: data.subarray(offset, offset + length) };
    offset += length;
    return table;
  });
}

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error("Usage: node scripts/fonts/otf-to-woff2.mjs <input.otf> <output.woff2>");
  process.exit(1);
}
const otf = fs.readFileSync(input);
const { woff2, tables } = encode(otf);
const decoded = decode(woff2);
if (decoded.length !== tables.length || decoded.some((t, i) => t.tag !== tables[i].tag || !t.data.equals(tables[i].data))) {
  console.error("Round trip failed: the WOFF2 does not decode to the original tables.");
  process.exit(1);
}
fs.writeFileSync(output, woff2);
console.log(`${input} (${otf.length} B) -> ${output} (${woff2.length} B), ${tables.length} tables verified`);
