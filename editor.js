/* SPDX-License-Identifier: AGPL-3.0-or-later */
function initializeEditor() {
const io = window.arguments[0].wrappedJSObject || window.arguments[0];
const keys = { title: '标题', author: '作者', 'container-title': '刊名／书名', 'container-title-short': '刊名缩写', 'title-short': '短标题', publisher: '出版者', 'publisher-place': '出版地' };
for (const [key, label] of Object.entries(keys)) {
  const row = document.createElement('tr');
  const labelCell = document.createElement('td'); labelCell.textContent = label; row.append(labelCell);
  for (const lang of ['zh', 'en']) {
    const cell = document.createElement('td');
    const input = document.createElement(['author', 'title', 'title-short'].includes(key) ? 'textarea' : 'input');
    if (key.startsWith('title')) input.className = key === 'title-short' ? 'title-short' : 'title';
    input.id = lang + '-' + key; input.setAttribute('aria-label', lang + ' ' + label);
    const value = io.data.variants[lang]?.[key];
    input.value = key === 'author' ? (value || []).map(BilingualAuthors.displayName).join('\n') : value || '';
    cell.append(input); row.append(cell);
  }
  document.getElementById('fields').append(row);
}
function fillJournal(showStatus = false) {
  try {
    if (!io.loadJournalTable) return;
    const catalog = io.loadJournalTable();
    const result = BilingualJournals.fill(catalog.rows,
      document.getElementById('zh-container-title').value || io.nativeJournal || '',
      document.getElementById('en-container-title').value,
      document.getElementById('en-container-title-short').value);
    if (result.changed) {
      document.getElementById('en-container-title').value = result.title;
      document.getElementById('en-container-title-short').value = result.short;
    }
    if (showStatus) document.getElementById('operation-status').textContent = result.changed ? '已补全英文刊名，点击保存后生效。' : result.matched ? '英文刊名已填写，无需补全。' : '对照表中没有这本期刊，可在“更多”中添加。';
  } catch (error) { document.getElementById('operation-status').textContent = '刊名匹配失败：' + error.message; }
}
document.getElementById('journal-tools').hidden = io.isJournal === false;
document.getElementById('fill-journal').onclick = () => fillJournal(true);
document.getElementById('zh-container-title').addEventListener('change', () => { if (io.isJournal !== false) fillJournal(); });
document.getElementById('manage-journals').onclick = () => {
  try {
    const managerIO = { catalog: io.loadJournalTable(), save: io.saveJournalTable, result: null };
    managerIO.wrappedJSObject = managerIO;
    window.openDialog('chrome://bilingual-records/content/journal-manager.xhtml', '', 'chrome,dialog,modal,resizable,centerscreen,width=1050,height=650', managerIO);
    if (managerIO.result && io.isJournal !== false) fillJournal(true);
  } catch (error) { document.getElementById('error').textContent = error.message; }
};
if (io.isJournal !== false) fillJournal();

document.getElementById('romanize-authors').onclick = () => {
  try {
    const result = BilingualAuthors.fillMissing(document.getElementById('zh-author').value,
      document.getElementById('en-author').value, pinyinPro.pinyin);
    document.getElementById('en-author').value = result.text;
    document.getElementById('operation-status').textContent = '已补全 ' + result.generated + ' 位英文作者，请核对姓名拼音。';
    document.getElementById('error').textContent = '';
  } catch (error) { document.getElementById('error').textContent = error.message; }
};
document.getElementById('cancel').onclick = () => window.close();
document.getElementById('save').onclick = () => {
  try {
    const data = { version: 1, variants: {} };
    for (const lang of ['zh', 'en']) {
      const variant = {};
      for (const key of Object.keys(keys)) {
        const value = document.getElementById(lang + '-' + key).value.trim();
        if (!value) continue;
        variant[key] = key !== 'author' ? value.replace(/\s*\r?\n\s*/g, ' ') : value.split(/\r?\n/).filter(s => s.trim()).map(line => {
          const text = line.trim();
          const parts = text.split('|');
          if (parts.length > 2 || !parts[0].trim()) throw new Error('作者格式应为：姓 | 名');
          if (parts.length === 1) return { literal: text };
          return { family: parts[0].trim(), given: (parts[1] || '').trim() };
        });
      }
      if (!variant.title || !variant.author) throw new Error((lang === 'zh' ? '中文' : '英文') + '题录必须填写标题和作者。');
      data.variants[lang] = variant;
    }
    if (data.variants.zh.author.length !== data.variants.en.author.length) throw new Error('中英文作者人数不一致，请补全并核对作者顺序。');
    io.result = data; window.close();
  } catch (error) { document.getElementById('error').textContent = error.message; }
};
}
window.addEventListener('DOMContentLoaded', () => {
  try { initializeEditor(); }
  catch (error) {
    const output = document.getElementById('error');
    if (output) output.textContent = '编辑窗口初始化失败：' + error.message;
    document.getElementById('cancel')?.addEventListener('click', () => window.close());
  }
}, { once: true });
