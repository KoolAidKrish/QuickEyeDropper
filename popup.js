// --- DOM Elements ---
const pickBtn = document.getElementById('pick-btn');
const result = document.getElementById('result');
const preview = document.getElementById('color-preview');
const nameDisplay = document.getElementById('color-name-display');
const hexVal = document.getElementById('hex-val');
const rgbVal = document.getElementById('rgb-val');
const hslVal = document.getElementById('hsl-val');
const copiedToast = document.getElementById('copied-toast');
const historySwatches = document.getElementById('history-swatches');
const clearHistoryBtn = document.getElementById('clear-history-btn');

// --- Manual Input Elements ---
const manualPreview = document.getElementById('manual-preview');
const inputHex = document.getElementById('input-hex');
const inputRgb = document.getElementById('input-rgb');
const inputHsl = document.getElementById('input-hsl');
const manualError = document.getElementById('manual-error');

// --- Swatch Menu & Global State Elements ---
const swatchMenu = document.getElementById('swatch-menu');
const menuSetBtn = document.getElementById('menu-set-btn');
const menuRGBBtn = document.getElementById('menu-rgb-btn');
const menuHexBtn = document.getElementById('menu-hex-btn');
const menuHSLBtn = document.getElementById('menu-hsl-btn');

let activeSwatchHex = null;
let activeSwatchRGB = null; 
let activeSwatchHSL = null; 
let currentColorHex = null; // Remembers the currently loaded color
let currentTab = 'picker-view'; // Tracks which tab we are on

// --- Tab Logic ---
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.target;
    
    // Check if we are leaving the Manual tab
    if (currentTab === 'manual-view' && target !== 'manual-view') {
      if (currentColorHex) {
        saveColorToHistory(currentColorHex);
      }
    }
    
    currentTab = target; // Update active tab tracker

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    
    btn.classList.add('active');
    document.getElementById(target).classList.add('active');
  });
});

// --- Get previous colors ---
chrome.storage.local.get(['colorHistory'], ({colorHistory}) => {
    renderHistory(colorHistory || []);
});

// --- Picker Logic ---
pickBtn.addEventListener('click', async () => {
  if (!window.EyeDropper) return alert('EyeDropper API not supported in this browser.');
  try {
    pickBtn.disabled = true; pickBtn.textContent = '⏳ Click anywhere on screen…';
    const dropResult = await new EyeDropper().open();
    const hex = dropResult.sRGBHex;
    const rgb = hexToRgb(hex);
    displayColor({ hex, rgb, hsl: rgbToHsl(rgb.r, rgb.g, rgb.b), name: getColorName(hex) }, true);
  } catch (err) { console.log('Eyedropper cancelled:', err); } 
  finally { pickBtn.disabled = false; pickBtn.textContent = '🔍 Pick Color from Screen'; }
});

// --- Display & Update UI (The Brain) ---
function displayColor(colorData, saveToHistory = true) {
  const { hex, rgb, hsl, name } = colorData;
  currentColorHex = hex; // Keep track of whatever is currently on screen
  
  // 1. Update Picker UI
  preview.style.background = hex;
  manualPreview.style.background = hex;
  nameDisplay.textContent = name || hex;
  hexVal.textContent = hex.toUpperCase();
  rgbVal.textContent = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  hslVal.textContent = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
  result.style.display = 'block';
  
  // 2. Sync to Manual Tab (Two-Way Binding)
  if (colorPicker.color.hexString.toLowerCase() !== hex.toLowerCase()) {
    colorPicker.color.hexString = hex;
  }
  inputHex.value = hex.toUpperCase();
  inputRgb.value = `${rgb.r}, ${rgb.g}, ${rgb.b}`;
  inputHsl.value = `${hsl.h}, ${hsl.s}%, ${hsl.l}%`;

  // 3. Save History conditionally & Update Analysis
  if (saveToHistory) {
    saveColorToHistory(hex);
  }
  updateAnalysis(hex, rgb, hsl);
}

// Extracted History Saver so we can call it when switching tabs
function saveColorToHistory(hex) {
  if (!hex) return;
  chrome.storage.local.get(['colorHistory'], ({ colorHistory }) => {
    const history = colorHistory || [];
    // If the color is already the most recent one, don't duplicate it
    if (history[0] === hex) return; 
    const newHistory = [hex, ...history.filter(c => c !== hex)].slice(0, 10);
    chrome.storage.local.set({ colorHistory: newHistory });
    renderHistory(newHistory);
  });
}

// --- Manual Input Logic ---

// 1. Initialize the iro.js Color Wheel
const colorPicker = new iro.ColorPicker("#color-wheel", {
  width: 220,
  color: "#8b5cf6", 
  borderWidth: 2,
  borderColor: "#222",
  handleRadius: 14, 
  layout: [
    { component: iro.ui.Wheel, options: {} },
    { component: iro.ui.Slider, options: { sliderType: 'value', marginTop: 16 } } 
  ]
});

// 2. Listen for when the user drags the wheel
colorPicker.on('input:change', function(color) {
  const hex = color.hexString;
  const rgb = hexToRgb(hex);
  displayColor({ hex, rgb, hsl: rgbToHsl(rgb.r, rgb.g, rgb.b), name: getColorName(hex) }, false);
});

inputHex.addEventListener('change', (e) => {
  let val = e.target.value.trim();
  if (!val.startsWith('#')) val = '#' + val;
  if (/^#[0-9A-Fa-f]{6}$/i.test(val)) {
    const rgb = hexToRgb(val);
    displayColor({ hex: val, rgb, hsl: rgbToHsl(rgb.r, rgb.g, rgb.b), name: getColorName(val) }, false);
  } else showManualError();
});

inputRgb.addEventListener('change', (e) => {
  const vals = e.target.value.match(/\d+/g); 
  if (vals && vals.length >= 3) {
    const r = Math.min(255, Math.max(0, parseInt(vals[0])));
    const g = Math.min(255, Math.max(0, parseInt(vals[1])));
    const b = Math.min(255, Math.max(0, parseInt(vals[2])));
    const hex = rgbToHex(r, g, b);
    displayColor({ hex, rgb: {r,g,b}, hsl: rgbToHsl(r, g, b), name: getColorName(hex) }, false);
  } else showManualError();
});

inputHsl.addEventListener('change', (e) => {
  const vals = e.target.value.match(/\d+/g); 
  if (vals && vals.length >= 3) {
    const h = Math.min(360, Math.max(0, parseInt(vals[0])));
    const s = Math.min(100, Math.max(0, parseInt(vals[1])));
    const l = Math.min(100, Math.max(0, parseInt(vals[2])));
    const hex = hslToHex(h, s, l);
    displayColor({ hex, rgb: hexToRgb(hex), hsl: {h,s,l}, name: getColorName(hex) }, false);
  } else showManualError();
});

// --- Analysis Logic ---
function updateAnalysis(hex, rgb, hsl) {
  document.getElementById('analysis-placeholder').style.display = 'none';
  document.getElementById('analysis-content').style.display = 'block';

  const lum = getLuminance(rgb.r, rgb.g, rgb.b);
  const whiteContrast = getContrastRatio(1, lum); 
  const blackContrast = getContrastRatio(0, lum); 

  updateContrastBadge('white', whiteContrast, hex, '#ffffff');
  updateContrastBadge('black', blackContrast, hex, '#000000');

  const cbWarning = document.getElementById('colorblind-warning');
  cbWarning.style.display = (whiteContrast < 3 && blackContrast < 4.5) ? 'block' : 'none';

  renderPalette('palette-comp', [ hslToHex((hsl.h + 180) % 360, hsl.s, hsl.l) ]);
  renderPalette('palette-analog', [ hslToHex((hsl.h + 30) % 360, hsl.s, hsl.l), hslToHex((hsl.h + 330) % 360, hsl.s, hsl.l) ]);
  renderPalette('palette-triad', [ hslToHex((hsl.h + 120) % 360, hsl.s, hsl.l), hslToHex((hsl.h + 240) % 360, hsl.s, hsl.l) ]);
}

function updateContrastBadge(type, ratio, bgColor, textColor) {
  const box = document.getElementById(`contrast-${type}-box`);
  const badge = document.getElementById(`badge-${type}`);
  box.style.backgroundColor = bgColor;
  let status = 'FAIL', className = 'fail';
  if (ratio >= 7) { status = 'AAA'; className = 'pass'; }
  else if (ratio >= 4.5) { status = 'AA'; className = 'pass'; }
  else if (ratio >= 3) { status = 'AA Large'; className = 'warn'; }
  badge.textContent = `${status} (${ratio.toFixed(2)})`;
  badge.className = `badge ${className}`;
}

// --- Swatch Menu Logic ---
function openSwatchMenu(event, hex) {
  event.stopPropagation();
  activeSwatchHex = hex;
  activeSwatchRGB = hexToRgb(hex);
  activeSwatchHSL = rgbToHsl(activeSwatchRGB.r, activeSwatchRGB.g, activeSwatchRGB.b);
  
  swatchMenu.style.display = 'flex';
  let x = event.pageX; let y = event.pageY;
  if (x + 140 > window.innerWidth) x = window.innerWidth - 150; 
  let finalY = y - swatchMenu.offsetHeight - 5;
  if (finalY < 0) finalY = y + 15; 
  swatchMenu.style.left = `${x}px`; swatchMenu.style.top = `${finalY}px`;
}

document.addEventListener('click', () => swatchMenu.style.display = 'none');

menuSetBtn.addEventListener('click', () => {
  displayColor({ hex: activeSwatchHex, rgb: activeSwatchRGB, hsl: activeSwatchHSL, name: getColorName(activeSwatchHex) }, true);
  swatchMenu.style.display = 'none';
});
menuHexBtn.addEventListener('click', () => copyToClipboard(activeSwatchHex.toUpperCase()));
menuRGBBtn.addEventListener('click', () => copyToClipboard(`rgb(${activeSwatchRGB.r}, ${activeSwatchRGB.g}, ${activeSwatchRGB.b})`));
menuHSLBtn.addEventListener('click', () => copyToClipboard(`hsl(${activeSwatchHSL.h}, ${activeSwatchHSL.s}%, ${activeSwatchHSL.l}%)`));

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    copiedToast.style.display = 'block';
    setTimeout(() => { copiedToast.style.display = 'none'; }, 1500);
  });
  swatchMenu.style.display = 'none';
}

document.querySelectorAll('.value-row').forEach(row => {
  row.addEventListener('click', () => {
    const type = row.dataset.copy;
    if (type === 'hex') copyToClipboard(hexVal.textContent);
    if (type === 'rgb') copyToClipboard(rgbVal.textContent);
    if (type === 'hsl') copyToClipboard(hslVal.textContent);
  });
});

// --- UI Rendering ---
function renderPalette(containerId, hexArray) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  hexArray.forEach(hex => {
    const swatch = document.createElement('div'); swatch.className = 'swatch';
    swatch.style.background = hex; swatch.title = hex;
    swatch.addEventListener('click', (e) => openSwatchMenu(e, hex));
    container.appendChild(swatch);
  });
}

function renderHistory(history) {
  historySwatches.innerHTML = '';

  if (history.length === 0) {
    historySwatches.innerHTML = '<div style="color: #555; font-size: 11px; font-style: italic; padding: 4px 0;">No recent colors.</div>';
    return;
  }

  history.forEach(hex => {
    const swatch = document.createElement('div'); swatch.className = 'swatch';
    swatch.style.background = hex; swatch.title = hex;
    swatch.addEventListener('click', () => {
      const rgb = hexToRgb(hex);
      displayColor({ hex, rgb, hsl: rgbToHsl(rgb.r, rgb.g, rgb.b), name: getColorName(hex) }, true);
    });
    historySwatches.appendChild(swatch);
  });
}

clearHistoryBtn.addEventListener('click', () => {
  chrome.storage.local.set({ colorHistory: [] }, () => renderHistory([]));
});

// --- Math Helpers ---
function getLuminance(r, g, b) {
  const a = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function getContrastRatio(l1, l2) {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function hslToHex(h, s, l) {
  l /= 100;
  const a = s * Math.min(l, 1 - l) / 100;
  const f = n => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return { r, g, b };
}

function rgbToHex(r, g, b) {
  return "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1).toLowerCase();
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h, s, l = (max+min)/2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch(max) {
      case r: h = ((g-b)/d + (g<b?6:0))/6; break;
      case g: h = ((b-r)/d + 2)/6; break;
      case b: h = ((r-g)/d + 4)/6; break;
    }
  }
  return { h: Math.round(h*360), s: Math.round(s*100), l: Math.round(l*100) };
}

const CSS_COLORS = {
  "#FF0000":"Red","#00FF00":"Lime","#0000FF":"Blue","#FFFF00":"Yellow",
  "#FF00FF":"Magenta","#00FFFF":"Cyan","#FFFFFF":"White","#000000":"Black",
  "#808080":"Gray","#800000":"Maroon","#808000":"Olive","#008000":"Green",
  "#800080":"Purple","#008080":"Teal","#000080":"Navy","#FFA500":"Orange",
  "#FFC0CB":"Pink","#A52A2A":"Brown","#FFD700":"Gold","#C0C0C0":"Silver",
  "#F5F5DC":"Beige","#FF6347":"Tomato","#40E0D0":"Turquoise","#EE82EE":"Violet"
};

function getColorName(hex) {
  const upper = hex.toUpperCase();
  if (CSS_COLORS[upper]) return CSS_COLORS[upper];
  
  let minDist = Infinity, nearest = null;
  const r1 = parseInt(hex.slice(1,3),16), g1 = parseInt(hex.slice(3,5),16), b1 = parseInt(hex.slice(5,7),16);
  for (const [namedHex, name] of Object.entries(CSS_COLORS)) {
    const r2 = parseInt(namedHex.slice(1,3),16), g2 = parseInt(namedHex.slice(3,5),16), b2 = parseInt(namedHex.slice(5,7),16);
    const dist = Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2);
    if (dist < minDist) { minDist = dist; nearest = name; }
  }
  return minDist < 40 ? `~${nearest}` : null;
}