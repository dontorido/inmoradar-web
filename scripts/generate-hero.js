const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const width = 1600;
const height = 1000;
const data = Buffer.alloc(width * height * 4);

function hex(color) {
  const value = color.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
    value.length === 8 ? parseInt(value.slice(6, 8), 16) : 255
  ];
}

function setPixel(x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const [r, g, b, a] = color;
  const i = (Math.floor(y) * width + Math.floor(x)) * 4;
  data[i] = r;
  data[i + 1] = g;
  data[i + 2] = b;
  data[i + 3] = a;
}

function blendPixel(x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const [r, g, b, a] = color;
  const i = (Math.floor(y) * width + Math.floor(x)) * 4;
  const alpha = a / 255;
  data[i] = Math.round(r * alpha + data[i] * (1 - alpha));
  data[i + 1] = Math.round(g * alpha + data[i + 1] * (1 - alpha));
  data[i + 2] = Math.round(b * alpha + data[i + 2] * (1 - alpha));
  data[i + 3] = 255;
}

function fillRect(x, y, w, h, color) {
  for (let yy = Math.max(0, y); yy < Math.min(height, y + h); yy += 1) {
    for (let xx = Math.max(0, x); xx < Math.min(width, x + w); xx += 1) {
      blendPixel(xx, yy, color);
    }
  }
}

function fillCircle(cx, cy, radius, color) {
  const r2 = radius * radius;
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) blendPixel(x, y, color);
    }
  }
}

function roundRect(x, y, w, h, radius, color) {
  fillRect(x + radius, y, w - radius * 2, h, color);
  fillRect(x, y + radius, w, h - radius * 2, color);
  fillCircle(x + radius, y + radius, radius, color);
  fillCircle(x + w - radius, y + radius, radius, color);
  fillCircle(x + radius, y + h - radius, radius, color);
  fillCircle(x + w - radius, y + h - radius, radius, color);
}

function line(x0, y0, x1, y1, thickness, color) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    fillCircle(Math.round(x0 + dx * t), Math.round(y0 + dy * t), thickness, color);
  }
}

function textBars(x, y, bars, color) {
  bars.forEach((bar, index) => {
    roundRect(x, y + index * 18, bar, 8, 4, color);
  });
}

function writePng(filePath) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    data.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  function crc32(buffer) {
    let crc = -1;
    for (let i = 0; i < buffer.length; i += 1) {
      crc ^= buffer[i];
      for (let j = 0; j < 8; j += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ -1) >>> 0;
  }

  function chunk(type, body) {
    const typeBuffer = Buffer.from(type);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length, 0);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, body])), 0);
    return Buffer.concat([length, typeBuffer, body, crc]);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);

  fs.writeFileSync(filePath, png);
}

const bg = hex("#e9eee9");
fillRect(0, 0, width, height, bg);

for (let y = 0; y < height; y += 3) {
  for (let x = 0; x < width; x += 3) {
    const shade = 238 + Math.floor(Math.sin(x * 0.01 + y * 0.02) * 7);
    setPixel(x, y, [shade, shade + 2, shade, 255]);
  }
}

fillRect(0, 780, width, 220, hex("#86d4df"));
line(0, 780, 380, 720, 36, hex("#86d4df"));
line(390, 740, 830, 835, 32, hex("#86d4df"));
line(800, 838, 1600, 760, 38, hex("#86d4df"));

fillRect(40, 240, 250, 170, hex("#98deb6cc"));
fillRect(1090, 520, 260, 170, hex("#a3e0b7cc"));
fillRect(1000, 110, 420, 260, hex("#ddd9cec8"));

const road = hex("#c5d0d9");
const roadLight = hex("#eef2f5");
[
  [60, 120, 680, 60], [120, 250, 860, 210], [30, 430, 820, 360],
  [240, 0, 300, 760], [430, 0, 500, 820], [650, 0, 710, 760],
  [780, 80, 990, 760], [960, 30, 1300, 710], [1120, 110, 1470, 720],
  [140, 620, 900, 520], [280, 760, 960, 640], [850, 420, 1600, 300],
  [1220, 0, 1160, 740], [70, 710, 560, 620]
].forEach(([x0, y0, x1, y1]) => {
  line(x0, y0, x1, y1, 12, road);
  line(x0, y0, x1, y1, 7, roadLight);
});

[
  [400, 150, "7,8"], [580, 275, "8,2"], [800, 185, "6,9"],
  [920, 425, "8,8"], [520, 540, "7,4"], [1120, 610, "5,9"],
  [1240, 250, "8,5"]
].forEach(([x, y]) => {
  roundRect(x, y, 104, 40, 10, hex("#d9f99dcc"));
  fillRect(x + 76, y + 5, 20, 30, hex("#111827"));
  textBars(x + 14, y + 12, [44, 62], hex("#111827"));
});

roundRect(880, 132, 420, 470, 28, hex("#ffffffe8"));
roundRect(880, 132, 420, 82, 28, hex("#0f172aff"));
textBars(916, 166, [120, 80], hex("#ffffff"));
roundRect(1180, 158, 72, 28, 14, hex("#ffffff26"));
textBars(1196, 168, [38], hex("#ffffff"));
roundRect(916, 252, 130, 110, 16, hex("#f8fafcff"));
roundRect(1070, 252, 130, 110, 16, hex("#f8fafcff"));
textBars(942, 286, [48, 76, 58], hex("#0f172a"));
textBars(1094, 286, [48, 72, 58], hex("#0f172a"));
roundRect(916, 392, 326, 54, 14, hex("#f1f5f9ff"));
roundRect(916, 462, 326, 54, 14, hex("#f1f5f9ff"));
roundRect(916, 532, 170, 38, 14, hex("#111827ff"));
textBars(942, 546, [96], hex("#ffffff"));

roundRect(150, 120, 360, 140, 26, hex("#111827e6"));
fillCircle(220, 190, 48, hex("#22c55eff"));
fillCircle(220, 190, 28, hex("#111827ff"));
fillCircle(220, 190, 10, hex("#f8fafcff"));
textBars(292, 158, [152, 210, 176], hex("#ffffff"));

writePng(path.join(__dirname, "..", "assets", "hero-inmoradar.png"));
