/* ============================================================================
 * tools/pack.js — ساخت بسته‌ی قابل‌بارگذاری (zip) برای انتشار
 * اجرا: node tools/pack.js
 * فقط فایل‌های لازم را بسته‌بندی می‌کند: test، tools، node_modules و پشتیبان‌ها
 * را کنار می‌گذارد.
 * ==========================================================================*/
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist');

const INCLUDE = ['manifest.json', 'README.md', 'README.fa.md', 'LICENSE', 'CHANGELOG.md',
                 'src', 'fonts', 'icons', '_locales'];

function walk(rel, out) {
  const abs = path.join(ROOT, rel);
  const st = fs.statSync(abs);
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(abs).sort()) walk(path.join(rel, name), out);
  } else {
    out.push({ rel: rel.split(path.sep).join('/'), abs, size: st.size, mtime: st.mtime });
  }
}

/* --- کمینه‌ی نویسنده‌ی ZIP (بدون وابستگی بیرونی) --- */
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTime(d) {
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
  const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { time, date };
}

function zip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const data = fs.readFileSync(f.abs);
    const comp = zlib.deflateRawSync(data, { level: 9 });
    const name = Buffer.from(f.rel, 'utf8');
    const { time, date } = dosTime(f.mtime);
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    chunks.push(local, name, comp);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, name);

    offset += local.length + name.length + comp.length;
  }

  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...chunks, cdBuf, end]);
}

const files = [];
for (const item of INCLUDE) {
  if (!fs.existsSync(path.join(ROOT, item))) {
    console.error('گمشده: ' + item);
    process.exit(1);
  }
  walk(item, files);
}

const mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
fs.mkdirSync(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, 'persian-web-mixer-v' + mf.version + '.zip');
const buf = zip(files);
fs.writeFileSync(out, buf);

const total = files.reduce((a, f) => a + f.size, 0);
console.log('بسته ساخته شد:');
console.log('  ' + out);
console.log('  ' + files.length + ' فایل · ' + (total / 1024).toFixed(1) + ' KB خام → ' + (buf.length / 1024).toFixed(1) + ' KB فشرده');
