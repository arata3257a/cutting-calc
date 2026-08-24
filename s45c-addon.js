// Beginner free version add-on: restore S45C reference conditions
// Source: Union Tool CZS published milling conditions for S45C/S50C annealed material (<=225HB).

presetData.S45C = {
  category: '鉄',
  teethOptions: {
    4: {
      toolName: 'ユニオンツール CZS',
      sourceName: 'ユニオンツール',
      sourceScope: 'S45C / S50C 焼鈍材（～225HB）',
      side: {
        1:{N:18000,F:1200,ap:1.5,ae:0.1}, 2:{N:12000,F:1800,ap:3,ae:0.2},
        3:{N:8500,F:2400,ap:4.5,ae:0.3}, 4:{N:7200,F:1350,ap:6,ae:0.8},
        5:{N:6000,F:1500,ap:7.5,ae:1.0}, 6:{N:5000,F:1600,ap:9,ae:1.2},
        7:{N:4200,F:1500,ap:10.5,ae:1.4}, 8:{N:3500,F:1400,ap:12,ae:1.6},
        9:{N:2900,F:1300,ap:13.5,ae:1.8}, 10:{N:2300,F:1200,ap:15,ae:2.0},
        11:{N:2050,F:1150,ap:16.5,ae:2.2}, 12:{N:1850,F:1100,ap:18,ae:2.4}
      },
      slot: {
        1:{N:18000,F:200,ap:0.5,ae:1}, 2:{N:12000,F:400,ap:1,ae:2},
        3:{N:8500,F:600,ap:3,ae:3}, 4:{N:7200,F:650,ap:4,ae:4},
        5:{N:6000,F:700,ap:5,ae:5}, 6:{N:5000,F:700,ap:6,ae:6},
        7:{N:4200,F:700,ap:7,ae:7}, 8:{N:3500,F:700,ap:8,ae:8},
        9:{N:2900,F:700,ap:9,ae:9}, 10:{N:2300,F:700,ap:10,ae:10},
        11:{N:2050,F:670,ap:11,ae:11}, 12:{N:1850,F:650,ap:12,ae:12}
      }
    }
  }
};

// Beginner version: only show aluminum grades whose reference basis has been verified.
const BEGINNER_ALUMINUM = new Set(['A5052', 'A7075']);

const __origRenderInputsS45C = renderInputs;
renderInputs = function() {
  __origRenderInputsS45C();
  if (currentMode === 'preset') {
    cleanBeginnerMaterialOptions();
    addS45COption();
  }
};

function cleanBeginnerMaterialOptions() {
  const sel = document.getElementById('input-material');
  if (!sel) return;
  [...sel.options].forEach(opt => {
    if (/^A\d{4}$/.test(opt.value) && !BEGINNER_ALUMINUM.has(opt.value)) opt.remove();
  });
}

function addS45COption() {
  const sel = document.getElementById('input-material');
  if (!sel || [...sel.options].some(o => o.value === 'S45C')) return;
  let ironGroup = [...sel.querySelectorAll('optgroup')].find(g => g.label === '鉄');
  if (!ironGroup) {
    ironGroup = document.createElement('optgroup');
    ironGroup.label = '鉄';
    const stainlessGroup = [...sel.querySelectorAll('optgroup')].find(g => g.label === 'ステンレス');
    sel.insertBefore(ironGroup, stainlessGroup || null);
  }
  const opt = document.createElement('option');
  opt.value = 'S45C';
  opt.textContent = 'S45C（焼鈍材 ～225HB）';
  ironGroup.appendChild(opt);
}

const __origUpdateResultPlaceholderS45C = updateResultPlaceholder;
updateResultPlaceholder = function() {
  __origUpdateResultPlaceholderS45C();
  if (currentMode !== 'preset') return;
  const material = document.getElementById('input-material')?.value;
  if (material !== 'S45C') return;
  document.getElementById('preset-source-info-a5052')?.classList.add('hidden');
  document.getElementById('preset-source-info-sus304')?.classList.add('hidden');
  document.getElementById('preset-source-info-copper')?.classList.add('hidden');
  document.getElementById('preset-source-info-s45c')?.classList.remove('hidden');
};

// Clean the initial selector too, because the original page may have rendered before this add-on loaded.
if (currentMode === 'preset') {
  cleanBeginnerMaterialOptions();
  addS45COption();
}
