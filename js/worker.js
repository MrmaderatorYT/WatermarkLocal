'use strict';

// Guard: if OffscreenCanvas is absent, notify main thread immediately
if (typeof OffscreenCanvas === 'undefined') {
  self.onmessage = function (e) {
    const idx = e.data?.payload?.index ?? 0;
    self.postMessage({ type: 'unsupported', index: idx });
  };
} else {
  self.onmessage = async function (e) {
    if (e.data.type !== 'process') return;
    await processImage(e.data.payload);
  };
}

async function processImage({ index, total, imageData, fileName, settings }) {
  try {
    const blob   = new Blob([imageData]);
    const bitmap = await createImageBitmap(blob);
    const { width, height } = bitmap;

    const canvas = new OffscreenCanvas(width, height);
    const ctx    = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    if (settings.wmType === 'text') {
      applyText(ctx, width, height, settings);
    } else if (settings.wmType === 'image' && settings.wmImageData) {
      await applyLogo(ctx, width, height, settings);
    }

    const mime    = settings.outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
    const quality = settings.outputFormat === 'jpeg' ? settings.quality / 100 : undefined;
    const outBlob = await canvas.convertToBlob({ type: mime, quality });
    const buffer  = await outBlob.arrayBuffer();

    self.postMessage({ type: 'result', index, fileName, buffer, mimeType: mime }, [buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', index, message: err.message });
  }
}

/* ─── Text ─────────────────────────────────────────────────────────────── */
function applyText(ctx, W, H, s) {
  ctx.save();
  ctx.globalAlpha   = s.wmOpacity / 100;
  const fs          = Math.round(s.wmFontSize * (W / 1000));
  ctx.font          = `bold ${fs}px "${s.wmFontFamily}", sans-serif`;
  ctx.fillStyle     = s.wmColor;
  ctx.textBaseline  = 'middle';
  ctx.textAlign     = 'center';
  if (s.wmShadow) {
    ctx.shadowColor   = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur    = fs * 0.15;
    ctx.shadowOffsetX = ctx.shadowOffsetY = fs * 0.04;
  }
  if (s.wmStroke) { ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = fs * 0.04; }

  if (s.wmTile) {
    tile(ctx, W, H, (x, y) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(s.wmAngle * Math.PI / 180);
      if (s.wmStroke) ctx.strokeText(s.wmText, 0, 0);
      ctx.fillText(s.wmText, 0, 0); ctx.restore();
    }, s.wmTileSpacingX, s.wmTileSpacingY);
  } else {
    const [cx, cy] = pos(s.wmPosition, W, H);
    ctx.translate(cx, cy); ctx.rotate(s.wmAngle * Math.PI / 180);
    if (s.wmStroke) ctx.strokeText(s.wmText, 0, 0);
    ctx.fillText(s.wmText, 0, 0);
  }
  ctx.restore();
}

/* ─── Logo ─────────────────────────────────────────────────────────────── */
async function applyLogo(ctx, W, H, s) {
  const bm   = await createImageBitmap(new Blob([s.wmImageData]));
  const lw   = Math.round(W * s.wmScale / 100);
  const lh   = Math.round(bm.height / bm.width * lw);
  ctx.save();
  ctx.globalAlpha = s.wmOpacity / 100;
  if (s.wmTile) {
    tile(ctx, W, H, (x, y) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(s.wmAngle * Math.PI / 180);
      ctx.drawImage(bm, -lw / 2, -lh / 2, lw, lh); ctx.restore();
    }, s.wmTileSpacingX, s.wmTileSpacingY);
  } else {
    const [cx, cy] = pos(s.wmPosition, W, H);
    ctx.translate(cx, cy); ctx.rotate(s.wmAngle * Math.PI / 180);
    ctx.drawImage(bm, -lw / 2, -lh / 2, lw, lh);
  }
  bm.close(); ctx.restore();
}

/* ─── Helpers ───────────────────────────────────────────────────────────── */
function tile(ctx, W, H, draw, sx, sy) {
  for (let y = -sy * 2; y < H + sy * 2; y += sy)
    for (let x = -sx * 2; x < W + sx * 2; x += sx)
      draw(x, y);
}
function pos(p, W, H) {
  const d = Math.min(W, H) * 0.05;
  return ({ tl:[d,d], tc:[W/2,d], tr:[W-d,d], ml:[d,H/2], mc:[W/2,H/2],
            mr:[W-d,H/2], bl:[d,H-d], bc:[W/2,H-d], br:[W-d,H-d] })[p] || [W-d,H-d];
}
