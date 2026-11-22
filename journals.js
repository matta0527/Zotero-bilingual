/* SPDX-License-Identifier: AGPL-3.0-or-later */
(function (root) {
  const defaults = [
    { zh: '工程力学', en: 'Engineering Mechanics', short: '' },
    { zh: '中国公路学报', en: 'China Journal of Highway and Transport', short: 'China J. Highw. Transp.' }
  ];
  const normalize = text => String(text || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  function validate(rows) {
    if (!Array.isArray(rows) || rows.length > 10000) throw new Error('刊名对照表必须是最多 10000 条的列表');
    const seen = new Set();
    return rows.map((row, i) => {
      if (!row || typeof row.zh !== 'string' || typeof row.en !== 'string') throw new Error('第 ' + (i + 1) + ' 行请填写中文和英文刊名');
      if (row.short !== undefined && typeof row.short !== 'string') throw new Error('刊名缩写必须是文本');
      // Older catalogs may contain extra fields; retain the three supported columns only.
      const result = { zh: row.zh.trim(), en: row.en.trim(), short: (row.short || '').trim() };
      if (!result.zh || !result.en) throw new Error('第 ' + (i + 1) + ' 行请填写中文和英文刊名');
      if ([result.zh, result.en, result.short].some(s => /[\r\n\t]/.test(s))) throw new Error('刊名和缩写不能包含换行或制表符');
      const key = normalize(result.zh);
      if (seen.has(key)) throw new Error('中文刊名重复：' + result.zh);
      seen.add(key);
      return result;
    });
  }
  function load(raw) {
    if (raw === undefined || raw === null || raw === '') return { version: 1, rows: validate(defaults) };
    const data = JSON.parse(raw);
    if (data.version !== 1) throw new Error('不支持的刊名对照表版本');
    return { version: 1, rows: validate(data.rows) };
  }
  function match(rows, title) {
    const key = normalize(title);
    return key ? rows.find(row => normalize(row.zh) === key) || null : null;
  }
  function fill(rows, chinese, english, abbreviation) {
    const row = match(rows, chinese);
    if (!row) return { title: english, short: abbreviation, matched: false, changed: false };
    if (english.trim()) return { title: english, short: abbreviation, matched: true, changed: false };
    return { title: row.en, short: abbreviation.trim() ? abbreviation : row.short, matched: true, changed: true };
  }
  function fromTSV(text) {
    const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter(s => s.trim());
    if (/^(中文刊名|zh)\t/i.test(lines[0] || '')) lines.shift();
    return validate(lines.map((line, i) => {
      const cells = line.split('\t');
      // Accept a fourth column solely to read exports from versions 0.1.8–0.1.9.
      if (cells.length < 2 || cells.length > 4) throw new Error('第 ' + (i + 1) + ' 行请填写中文刊名、英文刊名和可选的英文缩写');
      return { zh: cells[0], en: cells[1], short: cells[2] || '' };
    }));
  }
  function toTSV(rows) {
    return '中文刊名\t英文刊名\t英文缩写\n' + validate(rows).map(r => [r.zh, r.en, r.short].join('\t')).join('\n');
  }
  const api = { defaults, normalize, validate, load, match, fill, fromTSV, toTSV };
  if (typeof module !== 'undefined') module.exports = api;
  else root.BilingualJournals = api;
})(this);
