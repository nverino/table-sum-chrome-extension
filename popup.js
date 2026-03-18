// popup.js

let allTables = [];
let activeTableIndex = 0;
let selectedColumns = new Set();

const $ = (id) => document.getElementById(id);

function fmt(num) {
  // Format number nicely: up to 2 decimal places, with thousands separator
  if (Number.isInteger(num)) return num.toLocaleString();
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

async function scanTables() {
  showLoading();
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractTablesFromPage,
    });

    allTables = results[0]?.result || [];
    selectedColumns.clear();
    activeTableIndex = 0;

    if (allTables.length === 0) {
      showEmpty();
    } else {
      showContent();
      renderTableTabs();
      renderTable(activeTableIndex);
    }
  } catch (e) {
    showError(e.message);
  }
}

function showLoading() {
  $('loading').style.display = 'flex';
  $('empty').style.display = 'none';
  $('content').style.display = 'none';
}
function showEmpty() {
  $('loading').style.display = 'none';
  $('empty').style.display = 'flex';
  $('content').style.display = 'none';
}
function showContent() {
  $('loading').style.display = 'none';
  $('empty').style.display = 'none';
  $('content').style.display = 'block';
}
function showError(msg) {
  $('loading').style.display = 'none';
  $('empty').style.display = 'flex';
  $('empty').querySelector('p').textContent = 'Error: ' + msg;
  $('content').style.display = 'none';
}

function renderTableTabs() {
  const tabs = $('tableTabs');
  tabs.innerHTML = '';
  allTables.forEach((t, i) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (i === activeTableIndex ? ' active' : '');
    btn.textContent = t.name;
    btn.title = t.name;
    btn.addEventListener('click', () => {
      document
        .querySelectorAll('.tab-btn')
        .forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeTableIndex = i;
      renderTable(i);
    });
    tabs.appendChild(btn);
  });
}

function renderTable(index) {
  const table = allTables[index];

  // Stats bar
  const numericCols = table.columns.filter((c) => c.isNumeric).length;
  $('statsBar').innerHTML = `
    <div class="stat"><div class="stat-val">${table.rowCount}</div><div class="stat-lbl">Rows</div></div>
    <div class="stat"><div class="stat-val">${table.columnCount}</div><div class="stat-lbl">Columns</div></div>
    <div class="stat"><div class="stat-val">${numericCols}</div><div class="stat-lbl">Numeric</div></div>
  `;

  // Columns grid
  const grid = $('columnsGrid');
  grid.innerHTML = '';

  table.columns.forEach((col) => {
    const row = document.createElement('div');
    const isNumeric = col.isNumeric;
    const isSelected = selectedColumns.has(`${index}-${col.index}`);

    row.className =
      'col-row' +
      (!isNumeric ? ' non-numeric' : '') +
      (isSelected ? ' selected' : '');

    const checkMark = isSelected ? '✓' : '';
    const sumDisplay = isNumeric
      ? `<span class="col-sum">${fmt(col.sum)}</span>`
      : `<span class="col-sum muted">—</span>`;

    row.innerHTML = `
      <div class="col-check">${checkMark}</div>
      <div class="col-name">${escapeHtml(col.header)}</div>
      <div class="col-type">${isNumeric ? `${col.numericCount}/${col.rowCount}` : 'text'}</div>
      ${sumDisplay}
    `;

    if (isNumeric) {
      row.addEventListener('click', () => {
        const key = `${index}-${col.index}`;
        if (selectedColumns.has(key)) {
          selectedColumns.delete(key);
          row.classList.remove('selected');
          row.querySelector('.col-check').textContent = '';
        } else {
          selectedColumns.add(key);
          row.classList.add('selected');
          row.querySelector('.col-check').textContent = '✓';
        }
        updateGrandTotal();
      });
    }

    grid.appendChild(row);
  });

  updateGrandTotal();
}

function updateGrandTotal() {
  const gt = $('grandTotal');
  const gv = $('grandValue');

  if (selectedColumns.size === 0) {
    gt.style.display = 'none';
    return;
  }

  let total = 0;
  selectedColumns.forEach((key) => {
    const [tableIdx, colIdx] = key.split('-').map(Number);
    const table = allTables[tableIdx];

    if (table) {
      const col = table.columns[colIdx];

      if (col && col.isNumeric) {
        total += col.sum;
      }
    }
  });

  gt.style.display = 'flex';
  gv.textContent = fmt(total);
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ====== FUNCTION INJECTED INTO PAGE ======
function extractTablesFromPage() {
  const tables = Array.from(document.querySelectorAll('table'));
  const parseNumericCellValue = (value) => {
    const normalized = value
      .replace(/US\$/gi, '')
      .replace(/AR\$/gi, '')
      .replace(/[$€£¥%\s]/g, '');
    const lastComma = normalized.lastIndexOf(',');
    const lastDot = normalized.lastIndexOf('.');
    let numeric = normalized;

    if (lastComma !== -1 && lastDot !== -1) {
      if (lastComma > lastDot) {
        numeric = normalized.replace(/\./g, '').replace(',', '.');
      } else {
        numeric = normalized.replace(/,/g, '');
      }
    } else if (lastComma !== -1) {
      numeric = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      numeric = normalized.replace(/,/g, '');
    }

    const parsed = parseFloat(numeric);
    return Number.isFinite(parsed) ? parsed : null;
  };

  return tables.map((table, tableIndex) => {
    const headerCells = Array.from(
      table.querySelectorAll(
        'thead tr:first-child th, thead tr:first-child td',
      ),
    );
    const fallbackHeaders =
      headerCells.length === 0
        ? Array.from(
            table.querySelectorAll('tr:first-child th, tr:first-child td'),
          )
        : [];
    const hCells = headerCells.length > 0 ? headerCells : fallbackHeaders;
    const headers = hCells.map(
      (cell, i) => cell.innerText.trim() || `Col ${i + 1}`,
    );
    const hasExplicitHeader = headerCells.length > 0;

    const allRows = Array.from(table.querySelectorAll('tbody tr, tr'));
    const dataRows = hasExplicitHeader
      ? allRows
      : fallbackHeaders.length > 0
        ? allRows.slice(1)
        : allRows;

    const columnData = [];

    dataRows.forEach((row) => {
      const cells = Array.from(row.querySelectorAll('td, th'));
      cells.forEach((cell, colIndex) => {
        if (!columnData[colIndex]) columnData[colIndex] = [];
        // Use textContent so hidden cells (e.g. d-none, d-xxl-table-cell) are still read
        const text = (cell.textContent || cell.innerText || '')
          .replace(/\s+/g, ' ')
          .trim();
        columnData[colIndex].push(text);
      });
    });

    const colCount = Math.max(hCells.length, columnData.length);

    const columns = Array.from({ length: colCount }, (_, colIndex) => {
      const values = columnData[colIndex] || [];
      const nums = values
        .map(parseNumericCellValue)
        .filter((n) => n !== null);
      const isNumeric =
        nums.length > 0 && nums.length / Math.max(values.length, 1) >= 0.4;
      const sum = isNumeric ? nums.reduce((a, b) => a + b, 0) : null;

      return {
        index: colIndex,
        header: headers[colIndex] || `Col ${colIndex + 1}`,
        isNumeric,
        sum,
        rowCount: values.length,
        numericCount: nums.length,
      };
    });

    const caption = table.querySelector('caption');
    let tableName = caption ? caption.innerText.trim() : null;
    if (!tableName) {
      let prev = table.previousElementSibling;
      let attempts = 0;
      while (prev && attempts < 5) {
        if (/^H[1-6]$/.test(prev.tagName)) {
          tableName = prev.innerText.trim().slice(0, 50);
          break;
        }
        prev = prev.previousElementSibling;
        attempts++;
      }
    }
    tableName = tableName || `Table ${tableIndex + 1}`;

    return {
      index: tableIndex,
      name: tableName,
      rowCount: dataRows.length,
      columnCount: colCount,
      columns,
    };
  });
}

// === INIT ===
document.addEventListener('DOMContentLoaded', () => {
  scanTables();
  $('btnRefresh').addEventListener('click', () => {
    selectedColumns.clear();
    scanTables();
  });
});
