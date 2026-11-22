/* SPDX-License-Identifier: AGPL-3.0-or-later */
(function (root) {
  const PREFIX = 'Bilingual-Records: ';
  const fields = ['title', 'title-short', 'container-title', 'container-title-short', 'publisher', 'publisher-place'];
  const clone = value => JSON.parse(JSON.stringify(value));
  function validate(data) {
    if (!data || data.version !== 1 || !data.variants || typeof data.variants !== 'object') throw new Error('不支持的双语数据格式');
    for (const lang of Object.keys(data.variants)) {
      if (!['zh', 'en'].includes(lang)) throw new Error('未知语言: ' + lang);
      const variant = data.variants[lang];
      if (!variant || typeof variant !== 'object' || Array.isArray(variant)) throw new Error('题录必须是对象');
      for (const key of Object.keys(variant)) {
        if (fields.includes(key)) {
          if (typeof variant[key] !== 'string') throw new Error(key + ' 必须是文本');
        } else if (key === 'author') {
          if (!Array.isArray(variant.author) || !variant.author.length) throw new Error('作者列表不能为空');
          for (const name of variant.author) {
            if (!name || typeof name !== 'object' || Array.isArray(name)) throw new Error('无效作者');
            if (Object.keys(name).some(k => !['family', 'given', 'literal'].includes(k))) throw new Error('无效作者字段');
            if (Object.values(name).some(v => typeof v !== 'string')) throw new Error('作者必须为文本');
            if (!(name.family || name.literal) || (name.literal && (name.family || name.given))) throw new Error('作者需填写姓，或只填写机构名称');
          }
        } else throw new Error('不允许覆盖字段: ' + key);
      }
    }
    return data;
  }
  function read(extra) {
    const lines = String(extra || '').split(/\r?\n/).filter(line => line.startsWith(PREFIX));
    if (!lines.length) return null;
    if (lines.length !== 1) throw new Error('发现重复的双语数据，请检查 Extra');
    return validate(JSON.parse(lines[0].slice(PREFIX.length)));
  }
  function write(extra, data) {
    validate(data);
    const rest = String(extra || '').split(/\r?\n/).filter(line => !line.startsWith(PREFIX)).join('\n').trimEnd();
    return (rest ? rest + '\n' : '') + PREFIX + JSON.stringify(data);
  }
  function project(csl, data, lang) {
    const result = clone(csl);
    if (lang === 'original' || !data) return result;
    validate(data);
    const variant = data.variants[lang];
    if (!variant || !variant.title || !variant.author) throw new Error('双语条目缺少所选语言的标题或作者：' + (csl.title || csl.id));
    if (csl['container-title'] && !variant['container-title']) throw new Error('双语条目缺少所选语言的刊名：' + csl.title);
    Object.assign(result, clone(variant));
    // Do not let a native short title/journal abbreviation leak into another language.
    for (const key of ['title-short', 'container-title-short']) if (!variant[key]) delete result[key];
    delete result.multi;
    result.language = lang === 'en' ? 'en-US' : 'zh-CN';
    return result;
  }
  function isTranslatedChinese(csl, data) {
    if (!data?.variants?.en || !data?.variants?.zh) return false;
    const language = String(csl.language || '').trim().toLowerCase();
    if (/^(zh(?:[-_]|$)|chinese$|中文|汉语)/u.test(language)) return true;
    // An explicit non-Chinese source language wins over translated Chinese fields.
    if (language) return false;
    return /[\u3400-\u9fff]/u.test(csl.title || '');
  }
  function appendChineseNote(text, format) {
    if (/\(in\s+Chinese\)|\[in\s+Chinese\]/i.test(text)) return text;
    const place = body => body.endsWith('.')
      ? body.slice(0, -1) + ' (in Chinese).'
      : body + ' (in Chinese)';
    if (format === 'html') {
      // Put the note inside the entry/right-inline div, never after its container.
      const tail = text.match(/(?:\s*<\/div>)+\s*$/i);
      if (tail) return place(text.slice(0, tail.index)) + tail[0];
      const whitespace = text.match(/\s*$/);
      return place(text.slice(0, whitespace.index)) + whitespace[0];
    }
    if (format === 'rtf' || format === 'text') {
      const tail = text.match(format === 'rtf' ? /(?:\\par\b)?\s*$/ : /\s*$/);
      return place(text.slice(0, tail.index)) + tail[0];
    }
    return text; // Do not corrupt unknown output formats (e.g. LaTeX).
  }
  function annotateBibliography(bib, shouldMark, format) {
    if (!bib || !Array.isArray(bib[1]) || !Array.isArray(bib[0]?.entry_ids)) return bib;
    return [bib[0], bib[1].map((text, index) => {
      const ids = bib[0].entry_ids[index];
      return Array.isArray(ids) && ids.some(shouldMark) ? appendChineseNote(text, format) : text;
    })];
  }
  const api = { PREFIX, fields, validate, read, write, project, isTranslatedChinese, appendChineseNote, annotateBibliography };
  if (typeof module !== 'undefined') module.exports = api;
  else root.BilingualCore = api;
})(this);
