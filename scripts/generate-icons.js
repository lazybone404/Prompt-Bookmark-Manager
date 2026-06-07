/**
 * 简易 PNG 图标生成器（零依赖）
 * 生成纯色圆角矩形 + emoji 的占位图标
 */
import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const dataLen = Buffer.alloc(4);
  dataLen.writeUInt32BE(data.length);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcVal = Buffer.alloc(4);
  crcVal.writeUInt32BE(crc32(crcInput));
  return Buffer.concat([dataLen, typeBytes, data, crcVal]);
}

function generatePNG(size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);  // width
  ihdr.writeUInt32BE(size, 4);  // height
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // color type (RGB)
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  // Image data (filter byte 0 + RGB per pixel)
  const rawData = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const rowOffset = y * (1 + size * 3);
    rawData[rowOffset] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const px = rowOffset + 1 + x * 3;
      // Purple background (#4f46e5)
      rawData[px] = 79;
      rawData[px + 1] = 70;
      rawData[px + 2] = 229;
    }
  }

  const compressed = deflateSync(rawData);

  return Buffer.concat([
    signature,
    createChunk('IHDR', ihdr),
    createChunk('IDAT', compressed),
    createChunk('IEND', Buffer.alloc(0)),
  ]);
}

// 生成 4 个尺寸
const sizes = [16, 32, 48, 128];
const iconsDir = 'public/icons';

for (const size of sizes) {
  const png = generatePNG(size);
  const path = `${iconsDir}/icon-${size}.png`;
  writeFileSync(path, png);
  console.log(`Generated ${path} (${png.length} bytes)`);
}

console.log('Icon generation complete!');
