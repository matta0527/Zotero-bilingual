/* SPDX-License-Identifier: AGPL-3.0-or-later */
(function (root) {
  const compounds = new Set('欧阳 司马 上官 诸葛 夏侯 东方 皇甫 尉迟 公孙 慕容 司徒 司空 令狐 宇文 长孙 闻人 轩辕 端木 独孤 南宫 万俟 澹台 申屠 太史 仲孙 钟离 呼延 赫连 申公 公羊 公冶 濮阳 西门 东郭 公西 梁丘 左丘 第五'.split(' '));
  const han = /^[\u3400-\u9fff]+$/u;
  function isPersonalLiteral(name) {
    return han.test(name) && name.length >= 2 && name.length <= 4;
  }
  function displayName(name) {
    if (name.literal) return name.literal;
    if (!name.given && isPersonalLiteral(name.family)) return name.family;
    return name.family + ' | ' + (name.given || '');
  }
  function romanizeLine(line, pinyin) {
    const value = line.trim();
    if (!value) throw new Error('中文作者不能为空');
    if (!/[\u3400-\u9fff]/u.test(value)) return value;
    const parts = value.split('|').map(s => s.trim());
    let family, given;
    if (parts.length === 2) [family, given] = parts;
    else if (parts.length === 1 && isPersonalLiteral(value)) {
      const length = compounds.has(value.slice(0, 2)) ? 2 : 1;
      family = value.slice(0, length); given = value.slice(length);
    } else throw new Error('无法自动拆分作者 ' + value + '，请按“姓 | 名”填写。');
    if (!family || !given) throw new Error('请为 ' + value + ' 填写完整的姓和名');
    function convert(text, surname) {
      if (!han.test(text)) throw new Error('混合文字姓名请手动填写英文：' + value);
      const result = pinyin(text, { toneType: 'none', type: 'array', ...(surname ? { mode: 'surname' } : {}) }).join('');
      if (/[\u3400-\u9fff]/u.test(result)) throw new Error('无法转换生僻字，请手动填写：' + value);
      return result.charAt(0).toUpperCase() + result.slice(1);
    }
    return convert(family, true) + ' | ' + convert(given, false);
  }
  function fillMissing(chinese, english, pinyin) {
    const source = chinese.trim().split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!source.length) throw new Error('请先填写中文作者');
    const existing = english.trimEnd() ? english.trimEnd().split(/\r?\n/) : [];
    if (existing.length > source.length) throw new Error('英文作者行数多于中文，请先核对作者顺序');
    let generated = 0;
    const lines = source.map((line, index) => {
      if (existing[index]?.trim()) return existing[index].trim();
      const result = romanizeLine(line, pinyin);
      generated++; return result;
    });
    return { text: lines.join('\n'), generated };
  }
  const api = { displayName, romanizeLine, fillMissing };
  if (typeof module !== 'undefined') module.exports = api;
  else root.BilingualAuthors = api;
})(this);
