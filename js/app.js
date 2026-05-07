/**
 * app.js — Main application controller
 * Handles UI interactions, state management, canvas preview, and Worker orchestration.
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  State                                                                      */
/* ═══════════════════════════════════════════════════════════════════════════ */

const state = {
  images: [],          // Array of { file, objectUrl, originalBuffer }
  selectedIndex: 0,    // Which image is shown in preview
  wmLogoFile: null,    // Logo File object
  wmLogoBuffer: null,  // Logo ArrayBuffer
  processing: false,
  workerBusy: false,
};

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  DOM references (populated in init)                                         */
/* ═══════════════════════════════════════════════════════════════════════════ */

const $ = id => document.getElementById(id);

let DOM = {};

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Initialisation                                                             */
/* ═══════════════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  DOM = {
    // Drop zone
    dropZone:       $('drop-zone'),
    fileInput:      $('file-input'),
    imageList:      $('image-list'),
    imageCount:     $('image-count'),
    clearImagesBtn: $('clear-images-btn'),

    // Preview canvas
    previewCanvas:  $('preview-canvas'),
    previewEmpty:   $('preview-empty'),
    previewWrap:    $('preview-wrap'),

    // Watermark type
    wmTypeText:     $('wm-type-text'),
    wmTypeImage:    $('wm-type-image'),
    panelText:      $('panel-text'),
    panelImage:     $('panel-image'),

    // Text settings
    wmText:         $('wm-text'),
    wmFontSize:     $('wm-font-size'),
    wmFontSizeVal:  $('wm-font-size-val'),
    wmFontFamily:   $('wm-font-family'),
    wmColor:        $('wm-color'),
    wmShadow:       $('wm-shadow'),
    wmStroke:       $('wm-stroke'),

    // Logo
    logoInput:      $('logo-input'),
    logoDropZone:   $('logo-drop-zone'),
    logoPreview:    $('logo-preview'),
    logoName:       $('logo-name'),
    wmLogoScale:    $('wm-logo-scale'),
    wmLogoScaleVal: $('wm-logo-scale-val'),

    // Common settings
    wmOpacity:      $('wm-opacity'),
    wmOpacityVal:   $('wm-opacity-val'),
    wmAngle:        $('wm-angle'),
    wmAngleVal:     $('wm-angle-val'),
    wmTile:         $('wm-tile'),
    tileOptions:    $('tile-options'),
    wmTileSpacingX: $('wm-tile-spacing-x'),
    wmTileSpacingXVal: $('wm-tile-spacing-x-val'),
    wmTileSpacingY: $('wm-tile-spacing-y'),
    wmTileSpacingYVal: $('wm-tile-spacing-y-val'),
    positionGrid:   $('position-grid'),

    // Output
    outputFormat:   $('output-format'),
    jpegQuality:    $('jpeg-quality'),
    jpegQualityRow: $('jpeg-quality-row'),
    jpegQualityVal: $('jpeg-quality-val'),

    // Actions
    processBtn:     $('process-btn'),
    progressBar:    $('progress-bar'),
    progressFill:   $('progress-fill'),
    progressText:   $('progress-text'),
    downloadAll:    $('download-all'),
  };

  bindEvents();
  refreshPositionGrid();
  updateSliderLabels();
  syncPanels();
  checkJpegQuality();
});

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Event binding                                                              */
/* ═══════════════════════════════════════════════════════════════════════════ */

function bindEvents() {
  // ── Drop zone ──────────────────────────────────────────────────────────
  const dz = DOM.dropZone;
  dz.addEventListener('click', () => DOM.fileInput.click());
  dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    handleFiles([...e.dataTransfer.files]);
  });
  DOM.fileInput.addEventListener('change', e => handleFiles([...e.target.files]));
  DOM.clearImagesBtn.addEventListener('click', clearImages);

  // ── WM type toggle ─────────────────────────────────────────────────────
  DOM.wmTypeText.addEventListener('change',  syncPanels);
  DOM.wmTypeImage.addEventListener('change', syncPanels);

  // ── Text inputs / sliders ──────────────────────────────────────────────
  ['wmText','wmFontSize','wmFontFamily','wmColor','wmShadow','wmStroke',
   'wmOpacity','wmAngle','wmTile','wmTileSpacingX','wmTileSpacingY',
   'wmLogoScale','outputFormat'].forEach(key => {
    DOM[key]?.addEventListener('input',  schedulePreview);
    DOM[key]?.addEventListener('change', schedulePreview);
  });

  // Slider labels
  const sliders = [
    ['wmFontSize',     'wmFontSizeVal',     v => v],
    ['wmOpacity',      'wmOpacityVal',      v => v + '%'],
    ['wmAngle',        'wmAngleVal',        v => v + '°'],
    ['wmTileSpacingX', 'wmTileSpacingXVal', v => v + 'px'],
    ['wmTileSpacingY', 'wmTileSpacingYVal', v => v + 'px'],
    ['wmLogoScale',    'wmLogoScaleVal',    v => v + '%'],
    ['jpegQuality',    'jpegQualityVal',    v => v + '%'],
  ];
  sliders.forEach(([srcId, dstId, fmt]) => {
    const el = DOM[srcId];
    if (!el) return;
    el.addEventListener('input', () => {
      DOM[dstId].textContent = fmt(el.value);
      schedulePreview();
    });
  });

  DOM.wmTile.addEventListener('change', () => {
    DOM.tileOptions.style.display = DOM.wmTile.checked ? 'block' : 'none';
    DOM.positionGrid.closest('.setting-group').style.display = DOM.wmTile.checked ? 'none' : 'block';
    schedulePreview();
  });

  // ── Logo upload ────────────────────────────────────────────────────────
  const ldz = DOM.logoDropZone;
  ldz.addEventListener('click', () => DOM.logoInput.click());
  ldz.addEventListener('dragover',  e => { e.preventDefault(); ldz.classList.add('drag-over'); });
  ldz.addEventListener('dragleave', () => ldz.classList.remove('drag-over'));
  ldz.addEventListener('drop', e => {
    e.preventDefault();
    ldz.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f) handleLogoFile(f);
  });
  DOM.logoInput.addEventListener('change', e => {
    if (e.target.files[0]) handleLogoFile(e.target.files[0]);
  });

  // ── Position grid ──────────────────────────────────────────────────────
  DOM.positionGrid.addEventListener('click', e => {
    const cell = e.target.closest('.pos-cell');
    if (!cell) return;
    DOM.positionGrid.querySelectorAll('.pos-cell').forEach(c => c.classList.remove('active'));
    cell.classList.add('active');
    schedulePreview();
  });

  // ── Output format ──────────────────────────────────────────────────────
  DOM.outputFormat.addEventListener('change', checkJpegQuality);
  DOM.jpegQuality.addEventListener('input', () => {
    DOM.jpegQualityVal.textContent = DOM.jpegQuality.value + '%';
    schedulePreview();
  });

  // ── Process ────────────────────────────────────────────────────────────
  DOM.processBtn.addEventListener('click', startBatchProcessing);
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  File handling                                                              */
/* ═══════════════════════════════════════════════════════════════════════════ */

async function handleFiles(files) {
  const imageFiles = files.filter(f => f.type.startsWith('image/'));
  if (!imageFiles.length) return;

  for (const file of imageFiles) {
    const buf = await readFileAsArrayBuffer(file);
    const url = URL.createObjectURL(file);
    state.images.push({ file, objectUrl: url, originalBuffer: buf });
  }

  renderImageList();
  if (state.images.length === imageFiles.length) {
    // First batch — select first
    selectImage(0);
  }
  schedulePreview();
}

function clearImages() {
  state.images.forEach(img => URL.revokeObjectURL(img.objectUrl));
  state.images = [];
  state.selectedIndex = 0;
  renderImageList();
  clearPreview();
  DOM.downloadAll.classList.add('hidden');
}

function renderImageList() {
  DOM.imageList.innerHTML = '';
  DOM.imageCount.textContent = state.images.length
    ? `${state.images.length} file${state.images.length !== 1 ? 's' : ''}`
    : '';

  state.images.forEach((img, i) => {
    const item = document.createElement('div');
    item.className = 'image-item' + (i === state.selectedIndex ? ' active' : '');
    item.dataset.index = i;

    const thumb = document.createElement('img');
    thumb.src = img.objectUrl;
    thumb.className = 'image-thumb';

    const info = document.createElement('div');
    info.className = 'image-info';
    info.innerHTML = `
      <span class="image-name" title="${img.file.name}">${truncate(img.file.name, 22)}</span>
      <span class="image-size">${formatBytes(img.file.size)}</span>
    `;

    const del = document.createElement('button');
    del.className = 'image-delete';
    del.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    del.title = 'Remove';
    del.addEventListener('click', e => { e.stopPropagation(); removeImage(i); });

    item.appendChild(thumb);
    item.appendChild(info);
    item.appendChild(del);
    item.addEventListener('click', () => selectImage(i));
    DOM.imageList.appendChild(item);
  });

  DOM.clearImagesBtn.style.display = state.images.length ? 'flex' : 'none';
}

function selectImage(index) {
  state.selectedIndex = index;
  renderImageList();
  schedulePreview();
}

function removeImage(index) {
  URL.revokeObjectURL(state.images[index].objectUrl);
  state.images.splice(index, 1);
  if (state.selectedIndex >= state.images.length) {
    state.selectedIndex = Math.max(0, state.images.length - 1);
  }
  renderImageList();
  if (state.images.length) schedulePreview();
  else clearPreview();
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Logo handling                                                              */
/* ═══════════════════════════════════════════════════════════════════════════ */

async function handleLogoFile(file) {
  if (!file.type.startsWith('image/')) return;
  state.wmLogoFile   = file;
  state.wmLogoBuffer = await readFileAsArrayBuffer(file);

  const url = URL.createObjectURL(file);
  DOM.logoPreview.src = url;
  DOM.logoPreview.style.display = 'block';
  DOM.logoName.textContent = truncate(file.name, 28);
  schedulePreview();
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Canvas Preview                                                             */
/* ═══════════════════════════════════════════════════════════════════════════ */

let previewTimer = null;

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, 80);
}

async function renderPreview() {
  if (!state.images.length) { clearPreview(); return; }

  const img = state.images[state.selectedIndex];
  if (!img) return;

  const canvas = DOM.previewCanvas;
  const ctx    = canvas.getContext('2d');
  const s      = getSettings();

  // Load image into bitmap
  const blob   = new Blob([img.originalBuffer]);
  const bitmap = await createImageBitmap(blob);

  // Fit canvas to preview container
  const maxW = DOM.previewWrap.clientWidth  || 800;
  const maxH = DOM.previewWrap.clientHeight || 520;
  const scale = Math.min(maxW / bitmap.width, maxH / bitmap.height, 1);
  canvas.width  = Math.round(bitmap.width  * scale);
  canvas.height = Math.round(bitmap.height * scale);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // Watermark on preview (draw at preview resolution)
  if (s.wmType === 'text' && s.wmText.trim()) {
    applyTextWatermarkPreview(ctx, canvas.width, canvas.height, s);
  } else if (s.wmType === 'image' && state.wmLogoBuffer) {
    await applyImageWatermarkPreview(ctx, canvas.width, canvas.height, s);
  }

  DOM.previewCanvas.style.display = 'block';
  DOM.previewEmpty.style.display  = 'none';
}

function clearPreview() {
  DOM.previewCanvas.style.display = 'none';
  DOM.previewEmpty.style.display  = 'flex';
}

/* Duplicated drawing logic for preview (same as worker but on main thread) */
function applyTextWatermarkPreview(ctx, W, H, s) {
  ctx.save();
  ctx.globalAlpha = s.wmOpacity / 100;
  const fontSize  = Math.round(s.wmFontSize * (W / 1000));
  ctx.font         = `bold ${fontSize}px "${s.wmFontFamily}", sans-serif`;
  ctx.fillStyle    = s.wmColor;
  ctx.textBaseline = 'middle';
  ctx.textAlign    = 'center';

  if (s.wmShadow) {
    ctx.shadowColor   = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur    = fontSize * 0.15;
    ctx.shadowOffsetX = fontSize * 0.04;
    ctx.shadowOffsetY = fontSize * 0.04;
  }
  if (s.wmStroke) {
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth   = fontSize * 0.04;
  }

  if (s.wmTile) {
    drawTiledPreview(ctx, W, H, s.wmText, s.wmAngle, s.wmTileSpacingX * (W / 1000), s.wmTileSpacingY * (W / 1000), s.wmStroke);
  } else {
    const [cx, cy] = getPosition(s.wmPosition, W, H);
    ctx.translate(cx, cy);
    ctx.rotate((s.wmAngle * Math.PI) / 180);
    if (s.wmStroke) ctx.strokeText(s.wmText, 0, 0);
    ctx.fillText(s.wmText, 0, 0);
  }
  ctx.restore();
}

function drawTiledPreview(ctx, W, H, text, angle, stepX, stepY, stroke) {
  const rad = (angle * Math.PI) / 180;
  for (let y = -stepY * 2; y < H + stepY * 2; y += stepY) {
    for (let x = -stepX * 2; x < W + stepX * 2; x += stepX) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rad);
      if (stroke) ctx.strokeText(text, 0, 0);
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
  }
}

async function applyImageWatermarkPreview(ctx, W, H, s) {
  const blob   = new Blob([state.wmLogoBuffer]);
  const bitmap = await createImageBitmap(blob);
  const logoW  = Math.round(W * (s.wmScale / 100));
  const logoH  = Math.round((bitmap.height / bitmap.width) * logoW);

  ctx.save();
  ctx.globalAlpha = s.wmOpacity / 100;

  if (s.wmTile) {
    const stepX = s.wmTileSpacingX * (W / 1000);
    const stepY = s.wmTileSpacingY * (W / 1000);
    for (let y = -stepY; y < H + stepY; y += stepY) {
      for (let x = -stepX; x < W + stepX; x += stepX) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((s.wmAngle * Math.PI) / 180);
        ctx.drawImage(bitmap, -logoW / 2, -logoH / 2, logoW, logoH);
        ctx.restore();
      }
    }
  } else {
    const [cx, cy] = getPosition(s.wmPosition, W, H);
    ctx.translate(cx, cy);
    ctx.rotate((s.wmAngle * Math.PI) / 180);
    ctx.drawImage(bitmap, -logoW / 2, -logoH / 2, logoW, logoH);
  }
  bitmap.close();
  ctx.restore();
}

function getPosition(position, W, H) {
  const pad = Math.min(W, H) * 0.05;
  const map = {
    tl: [pad,       pad      ], tc: [W / 2,   pad      ], tr: [W - pad, pad      ],
    ml: [pad,       H / 2    ], mc: [W / 2,   H / 2    ], mr: [W - pad, H / 2    ],
    bl: [pad,       H - pad  ], bc: [W / 2,   H - pad  ], br: [W - pad, H - pad  ],
  };
  return map[position] || map['br'];
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Batch processing via Web Worker                                            */
/* ═══════════════════════════════════════════════════════════════════════════ */

let resultBuffers = []; // { fileName, buffer, mimeType }

async function startBatchProcessing() {
  if (!state.images.length) { alert('Please add at least one image.'); return; }
  if (state.processing) return;

  state.processing = true;
  resultBuffers    = [];
  DOM.processBtn.disabled = true;
  DOM.progressBar.style.display = 'block';
  DOM.downloadAll.classList.add('hidden');

  const settings = getSettings();
  const total    = state.images.length;

  // Detect OffscreenCanvas support before spawning a Worker.
  // Safari defines OffscreenCanvas but its Worker implementation doesn't support
  // convertToBlob(), so we skip the Worker path entirely in that case.
  const canUseWorker = typeof OffscreenCanvas !== 'undefined'
    && typeof OffscreenCanvas.prototype.convertToBlob === 'function';

  if (!canUseWorker) {
    await processMainThread(settings, total);
    return;
  }

  // ── Chromium / Firefox path: process off-thread ───────────────────────
  let worker;
  let completed = 0;
  try { worker = new Worker('./js/worker.js'); }
  catch (_) { await processMainThread(settings, total); return; }

  worker.onmessage = async e => {
    const { type, index, fileName, buffer, mimeType, message } = e.data;

    if (type === 'unsupported') {
      worker.terminate();
      await processMainThread(settings, total);
      return;
    }
    if (type === 'result') {
      resultBuffers[index] = { fileName: outputFileName(fileName, settings.outputFormat), buffer, mimeType };
      completed++;
      updateProgress(completed, total);
      if (completed === total) { worker.terminate(); finishProcessing(); }
    } else if (type === 'error') {
      console.warn(`Worker image error [${index}]: ${message}`);
      completed++;
      updateProgress(completed, total);
      if (completed === total) { worker.terminate(); finishProcessing(); }
    }
  };

  worker.onerror = async () => {
    worker.terminate();
    await processMainThread(settings, total);
  };

  for (let i = 0; i < total; i++) {
    const img       = state.images[i];
    const cloned    = img.originalBuffer.slice(0);
    const logoClone = state.wmLogoBuffer ? state.wmLogoBuffer.slice(0) : null;
    const payload   = {
      index: i, total,
      imageData: cloned,
      fileName:  img.file.name,
      settings:  { ...settings, wmImageData: logoClone },
    };
    const transfers = [cloned];
    if (logoClone) transfers.push(logoClone);
    worker.postMessage({ type: 'process', payload }, transfers);
  }
}

/* ─── Main-thread fallback (for Safari / no OffscreenCanvas) ───────────── */
async function processMainThread(settings, total) {
  const canvas = document.createElement('canvas');
  const ctx    = canvas.getContext('2d');
  const mime   = settings.outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
  const quality = settings.outputFormat === 'jpeg' ? settings.quality / 100 : undefined;

  for (let i = 0; i < total; i++) {
    const img    = state.images[i];
    const blob   = new Blob([img.originalBuffer]);
    const bitmap = await createImageBitmap(blob);

    canvas.width  = bitmap.width;
    canvas.height = bitmap.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    if (settings.wmType === 'text') {
      applyTextWatermarkPreview(ctx, canvas.width, canvas.height, settings);
    } else if (settings.wmType === 'image' && state.wmLogoBuffer) {
      await applyImageWatermarkPreview(ctx, canvas.width, canvas.height, settings);
    }

    // canvas.toBlob → ArrayBuffer
    const outBlob = await new Promise(res => {
      if (quality !== undefined) canvas.toBlob(res, mime, quality);
      else canvas.toBlob(res, mime);
    });
    const buffer = await outBlob.arrayBuffer();
    resultBuffers[i] = {
      fileName: outputFileName(img.file.name, settings.outputFormat),
      buffer,
      mimeType: mime,
    };

    updateProgress(i + 1, total);
    // Yield to browser so UI stays responsive
    await new Promise(r => setTimeout(r, 0));
  }

  finishProcessing();
}

function updateProgress(done, total) {
  const pct = Math.round((done / total) * 100);
  DOM.progressFill.style.width = pct + '%';
  DOM.progressText.textContent = `Processing ${done} of ${total}…`;
}

function finishProcessing() {
  state.processing = false;
  DOM.processBtn.disabled = false;
  DOM.progressText.textContent = `Done — ${resultBuffers.filter(Boolean).length} image(s) saved.`;

  // Auto-download if single file, else show Download All
  const valid = resultBuffers.filter(Boolean);
  if (valid.length === 1) {
    downloadBuffer(valid[0]);
  } else if (valid.length > 1) {
    DOM.downloadAll.classList.remove('hidden');
    DOM.downloadAll.onclick = () => downloadAllBuffers(valid);
  }
}

function downloadBuffer({ fileName, buffer, mimeType }) {
  const blob = new Blob([buffer], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function downloadAllBuffers(results) {
  // Sequential downloads with tiny delay so browser doesn't block them
  for (let i = 0; i < results.length; i++) {
    downloadBuffer(results[i]);
    await new Promise(r => setTimeout(r, 200));
  }
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Settings collection                                                        */
/* ═══════════════════════════════════════════════════════════════════════════ */

function getSettings() {
  const activeCell = DOM.positionGrid.querySelector('.pos-cell.active');
  const position   = activeCell ? activeCell.dataset.pos : 'br';

  return {
    wmType:        DOM.wmTypeText.checked ? 'text' : 'image',
    wmText:        DOM.wmText.value || 'Watermark',
    wmFontSize:    parseInt(DOM.wmFontSize.value, 10),
    wmFontFamily:  DOM.wmFontFamily.value,
    wmColor:       DOM.wmColor.value,
    wmShadow:      DOM.wmShadow.checked,
    wmStroke:      DOM.wmStroke.checked,
    wmOpacity:     parseInt(DOM.wmOpacity.value, 10),
    wmAngle:       parseInt(DOM.wmAngle.value, 10),
    wmTile:        DOM.wmTile.checked,
    wmTileSpacingX:parseInt(DOM.wmTileSpacingX.value, 10),
    wmTileSpacingY:parseInt(DOM.wmTileSpacingY.value, 10),
    wmPosition:    position,
    wmScale:       parseInt(DOM.wmLogoScale.value, 10),
    outputFormat:  DOM.outputFormat.value,
    quality:       parseInt(DOM.jpegQuality.value, 10),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  UI Helpers                                                                 */
/* ═══════════════════════════════════════════════════════════════════════════ */

function syncPanels() {
  const isText = DOM.wmTypeText.checked;
  DOM.panelText.style.display  = isText ? 'block' : 'none';
  DOM.panelImage.style.display = isText ? 'none'  : 'block';
  schedulePreview();
}

function checkJpegQuality() {
  const isJpeg = DOM.outputFormat.value === 'jpeg';
  DOM.jpegQualityRow.style.display = isJpeg ? 'flex' : 'none';
}

function updateSliderLabels() {
  DOM.wmFontSizeVal.textContent     = DOM.wmFontSize.value;
  DOM.wmOpacityVal.textContent      = DOM.wmOpacity.value + '%';
  DOM.wmAngleVal.textContent        = DOM.wmAngle.value + '°';
  DOM.wmTileSpacingXVal.textContent = DOM.wmTileSpacingX.value + 'px';
  DOM.wmTileSpacingYVal.textContent = DOM.wmTileSpacingY.value + 'px';
  DOM.wmLogoScaleVal.textContent    = DOM.wmLogoScale.value + '%';
  DOM.jpegQualityVal.textContent    = DOM.jpegQuality.value + '%';
}

function refreshPositionGrid() {
  const positions = ['tl','tc','tr','ml','mc','mr','bl','bc','br'];
  const labels    = ['↖','↑','↗','←','·','→','↙','↓','↘'];
  DOM.positionGrid.innerHTML = '';
  positions.forEach((pos, i) => {
    const cell = document.createElement('button');
    cell.className   = 'pos-cell' + (pos === 'br' ? ' active' : '');
    cell.dataset.pos = pos;
    cell.textContent = labels[i];
    cell.title       = pos;
    DOM.positionGrid.appendChild(cell);
  });
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Utility                                                                    */
/* ═══════════════════════════════════════════════════════════════════════════ */

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

function truncate(str, max) {
  if (str.length <= max) return str;
  const ext   = str.lastIndexOf('.');
  const name  = ext > 0 ? str.slice(0, ext) : str;
  const suffix = ext > 0 ? str.slice(ext) : '';
  return name.slice(0, max - suffix.length - 3) + '…' + suffix;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function outputFileName(original, format) {
  const dot = original.lastIndexOf('.');
  const base = dot > 0 ? original.slice(0, dot) : original;
  return `${base}_watermarked.${format}`;
}
