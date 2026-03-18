// content.js — injected into the active tab

function extractTables() {
  const tables = Array.from(document.querySelectorAll('table'));

  return tables.map((table, tableIndex) => {
    // Get header row
    const headerCells = Array.from(
      table.querySelectorAll('thead tr th, thead tr td, tr:first-child th, tr:first-child td')
    );
    const headers = headerCells.map(cell => cell.innerText.trim() || `Col ${headerCells.indexOf(cell) + 1}`);

    // Collect all data rows
    const rows = Array.from(table.querySelectorAll('tbody tr, tr')).slice(headerCells.length ? 1 : 0);

    const columnData = []; // columnData[colIndex] = array of values

    rows.forEach(row => {
      const cells = Array.from(row.querySelectorAll('td, th'));
      cells.forEach((cell, colIndex) => {
        if (!columnData[colIndex]) columnData[colIndex] = [];
        columnData[colIndex].push(cell.innerText.trim());
      });
    });

    // Figure out which columns are numeric
    const columns = columnData.map((values, colIndex) => {
      const nums = values
        .map((v) => {
          const normalized = v
            .replace(/US\$/gi, '')
            .replace(/[^0-9.,-]/g, '');
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
        })
        .filter((n) => n !== null);
      const isNumeric = nums.length > 0 && nums.length / values.length >= 0.5;
      const sum = isNumeric ? nums.reduce((a, b) => a + b, 0) : null;

      return {
        index: colIndex,
        header: headers[colIndex] || `Col ${colIndex + 1}`,
        isNumeric,
        sum,
        rowCount: values.length,
        numericCount: nums.length,
        values: values.slice(0, 5) // preview
      };
    });

    // Try to get a caption or nearby heading for the table name
    const caption = table.querySelector('caption');
    let tableName = caption ? caption.innerText.trim() : null;
    if (!tableName) {
      // Look for preceding heading
      let prev = table.previousElementSibling;
      while (prev && !['H1','H2','H3','H4','H5','H6'].includes(prev.tagName)) {
        prev = prev.previousElementSibling;
      }
      tableName = prev ? prev.innerText.trim().slice(0, 60) : null;
    }
    tableName = tableName || `Table ${tableIndex + 1}`;

    return {
      index: tableIndex,
      name: tableName,
      rowCount: rows.length,
      columnCount: columnData.length,
      columns
    };
  });
}

// Make available for scripting injection
extractTables();
