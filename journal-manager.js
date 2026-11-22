/* SPDX-License-Identifier: AGPL-3.0-or-later */
window.addEventListener('DOMContentLoaded', () => {
  const io = window.arguments[0].wrappedJSObject || window.arguments[0];
  const table = document.getElementById('journal-rows');
  const error = document.getElementById('error');
  function run(action) { try { error.textContent = ''; return action(); } catch (e) { error.textContent = e.message; } }
  function readRows() {
    return [...table.children].map(row => {
      const values = [...row.querySelectorAll('input')].map(input => input.value);
      return { zh: values[0], en: values[1], short: values[2] };
    }).filter(row => row.zh.trim() || row.en.trim() || row.short.trim());
  }
  function filter() {
    const value = BilingualJournals.normalize(document.getElementById('filter').value);
    for (const row of table.children) row.hidden = ![...row.querySelectorAll('input')].some(input => BilingualJournals.normalize(input.value).includes(value));
  }
  function addRow(row = { zh: '', en: '', short: '' }) {
    const tr = document.createElement('tr');
    for (const [i, text] of [row.zh, row.en, row.short].entries()) {
      const td = document.createElement('td'), input = document.createElement('input');
      input.value = text; input.setAttribute('aria-label', ['中文刊名', '英文刊名', '英文缩写'][i]);
      td.append(input); tr.append(td);
    }
    const td = document.createElement('td'), remove = document.createElement('button');
    remove.textContent = '删除'; remove.onclick = () => tr.remove(); td.append(remove); tr.append(td); table.append(tr);
  }
  io.catalog.rows.forEach(addRow);
  document.getElementById('filter').oninput = filter;
  document.getElementById('add-row').onclick = () => { document.getElementById('filter').value = ''; filter(); addRow(); table.lastElementChild.querySelector('input').focus(); };
  document.getElementById('cancel').onclick = () => window.close();
  document.getElementById('import-tsv').onclick = () => run(() => {
    const rows = BilingualJournals.validate([...readRows(), ...BilingualJournals.fromTSV(document.getElementById('bulk').value)]);
    table.replaceChildren(); rows.forEach(addRow); filter(); document.getElementById('status').textContent = '已合并 ' + rows.length + ' 条，点击保存后生效。';
  });
  document.getElementById('export-tsv').onclick = () => run(() => {
    document.getElementById('bulk').value = BilingualJournals.toTSV(readRows()); document.getElementById('bulk').select();
    document.getElementById('status').textContent = '导出文本已选中，可复制并保存备份。';
  });
  document.getElementById('save-catalog').onclick = () => run(() => {
    const rows = BilingualJournals.validate(readRows()); io.result = io.save(rows, io.catalog.revision); window.close();
  });
}, { once: true });
