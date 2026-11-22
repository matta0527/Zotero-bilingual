const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const C = require('./core.js');
const J = require('./journals.js');
test('Journal matching normalizes whitespace and full-width punctuation and preserves existing English', () => {
  const rows = J.validate([{ zh: '测试学报（自然科学版）', en: 'Test Journal', short: 'Test J.' }]);
  assert.equal(J.match(rows, ' 测试学报 (自然科学版) ').en, 'Test Journal');
  assert.equal(J.fill(rows, '测试学报（自然科学版）', '', '').short, 'Test J.');
  assert.equal(J.fill(rows, '测试学报（自然科学版）', 'Manual Journal', 'M. J.').title, 'Manual Journal');
  assert.equal(J.fill(rows, '测试学报', '', '').matched, false);
});
test('Journal catalog rejects missing and duplicate names, supports three-column exports and legacy catalogs', () => {
  assert.throws(() => J.validate([{ zh: '刊名', en: '' }]));
  assert.throws(() => J.validate([{ zh: '刊名', en: 'A' }, { zh: '刊 名', en: 'B' }]));
  const legacy = J.load(JSON.stringify({ version: 1, rows: [{ zh: '刊名', en: 'Journal', aliases: ['旧写法'] }] })).rows;
  assert.equal(J.match(legacy, '刊名').en, 'Journal');
  assert.equal(J.match(legacy, '旧写法'), null);
  assert.equal(Object.keys(legacy[0]).length, 3);
  assert.ok(J.toTSV(legacy).split('\n').every(line => line.split('\t').length === 3));
  assert.equal(J.fromTSV('刊名\tJournal\tJ.\t旧写法')[0].short, 'J.');
  const rows = J.load('').rows;
  assert.equal(J.match(rows, '工程力学').en, 'Engineering Mechanics');
  assert.deepEqual(J.fromTSV(J.toTSV(rows)), rows);
  assert.equal(J.load(JSON.stringify({ version: 1, rows: [] })).rows.length, 0);
});
const Authors = require('./authors.js');
const { pinyin } = require('./vendor/pinyin-pro.js');
test('Author romanization splits surnames, compound surnames and converts surname polyphones offline', () => {
  for (const [source, expected] of [
    ['张三', 'Zhang | San'], ['郑文智', 'Zheng | Wenzhi'], ['欧阳修', 'Ouyang | Xiu'],
    ['单田芳', 'Shan | Tianfang'], ['曾 | 国藩', 'Zeng | Guofan'], ['吕布', 'Lü | Bu']
  ]) assert.equal(Authors.romanizeLine(source, pinyin), expected);
  assert.equal(Authors.romanizeLine('Smith | John', pinyin), 'Smith | John');
  assert.equal(Authors.displayName({ literal: '郑文智' }), '郑文智');
  assert.equal(Authors.displayName({ family: '郑文智', given: '' }), '郑文智');
  assert.equal(Authors.displayName({ literal: 'Existing literal name' }), 'Existing literal name');
});
test('Author generation preserves existing English spellings and row alignment', () => {
  const out = Authors.fillMissing('张三\n李四\n王五', 'Chang | San\n\nWang | Wu', pinyin);
  assert.equal(out.text, 'Chang | San\nLi | Si\nWang | Wu');
  assert.equal(out.generated, 1);
  assert.equal(Authors.fillMissing('张三', 'Zhang | San', pinyin).generated, 0);
  assert.throws(() => Authors.fillMissing('张三', 'Zhang | San\nLi | Si', pinyin));
});
test('Install manifest declares Zotero 9 through 10 compatibility and mandatory HTTPS update URL', () => {
  const manifest = JSON.parse(fs.readFileSync(__dirname + '/manifest.json', 'utf8'));
  const app = manifest.applications.zotero;
  for (const key of ['id', 'update_url', 'strict_max_version']) assert.ok(app[key], key);
  const url = new URL(app.update_url);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 'example.invalid');
  assert.equal(app.strict_min_version, '9.0');
  assert.equal(app.strict_max_version, '10.0.*');
  assert.equal(manifest.version, '0.2.0');
});
const native = { id: 7, type: 'article-journal', title: '中文标题', author: [{ family: '张', given: '三' }], 'container-title': '工程力学', 'title-short': '中文', 'container-title-short': '中文缩写', issued: { 'date-parts': [[2024]] }, volume: '41', page: '1-10', DOI: '10.1234/example' };
const data = { version: 1, variants: {
  zh: { title: '中文标题', author: [{ family: '张', given: '三' }], 'container-title': '工程力学' },
  en: { title: 'Seismic response of structures', author: [{ family: 'Zhang', given: 'San' }], 'container-title': 'Engineering Mechanics' }
} };
test('Extra round trip preserves unrelated metadata and rejects duplicates', () => {
  const extra = C.write('DOI: test\nOther: unchanged', data);
  assert.deepEqual(C.read(extra), data);
  assert.ok(extra.startsWith('DOI: test\nOther: unchanged\n'));
  assert.equal(C.write(extra, data), extra);
  assert.throws(() => C.read(extra + '\n' + C.PREFIX + '{}'));
});
test('Projection keeps source, identifiers and common fields intact; no stale abbreviations', () => {
  const before = JSON.stringify(native);
  const out = C.project(native, data, 'en');
  assert.equal(out.title, data.variants.en.title);
  assert.equal(out.author[0].family, 'Zhang');
  assert.equal(out.DOI, native.DOI);
  assert.deepEqual(out.issued, native.issued);
  assert.ok(!('title-short' in out));
  assert.ok(!('container-title-short' in out));
  out.author[0].family = 'Changed';
  assert.equal(data.variants.en.author[0].family, 'Zhang');
  assert.equal(JSON.stringify(native), before);
});
test('Incomplete bilingual records fail instead of mixing languages', () => {
  assert.throws(() => C.project(native, { version: 1, variants: { en: { title: 'English' } } }, 'en'));
  assert.throws(() => C.project(native, { version: 1, variants: { en: { ...data.variants.en, 'container-title': '' } } }, 'en'));
  assert.deepEqual(C.project(native, null, 'en'), native);
  assert.throws(() => C.validate({ version: 1, variants: { en: { DOI: 'wrong' } } }));
});
test('Chinese note eligibility uses source language and never marks native English or unconfigured entries', () => {
  assert.equal(C.isTranslatedChinese(native, data), true);
  assert.equal(C.isTranslatedChinese({ ...native, title: 'English title', language: 'zh-CN' }, data), true);
  assert.equal(C.isTranslatedChinese({ ...native, language: 'en-US' }, data), false);
  assert.equal(C.isTranslatedChinese({ ...native, title: 'English title' }, data), false);
  assert.equal(C.isTranslatedChinese(native, null), false);
});
test('Bibliography notes retain HTML and RTF layout, respect entry IDs, and do not duplicate existing labels', () => {
  const original = [{ entry_ids: [['2'], ['7']] }, ['Native English.\n', 'Translated Chinese.\n']];
  const out = C.annotateBibliography(original, id => id === '7', 'text');
  assert.equal(out[1][0], original[1][0]);
  assert.equal(out[1][1], 'Translated Chinese (in Chinese).\n');
  assert.equal(original[1][1], 'Translated Chinese.\n');
  assert.equal(C.appendChineseNote(out[1][1], 'text'), out[1][1]);
  assert.equal(C.appendChineseNote('Title. [in Chinese]\n', 'text'), 'Title. [in Chinese]\n');
  const html = '<div class="csl-entry"><div class="csl-left-margin">[1]</div><div class="csl-right-inline">Title.</div></div>\n';
  assert.equal(C.appendChineseNote(html, 'html'), html.replace('Title.', 'Title (in Chinese).'));
  assert.equal(C.appendChineseNote('{\\i Journal}.\\par\r\n', 'rtf'), '{\\i Journal} (in Chinese).\\par\r\n');
  assert.equal(C.appendChineseNote('Title\n', 'text'), 'Title (in Chinese)\n');
  assert.equal(C.appendChineseNote('Title', 'latex'), 'Title');
  assert.equal(C.annotateBibliography(false, () => true, 'rtf'), false);
});
function harness(version = '9.0.6') {
  function Session() { this.sessionID = Math.random().toString(); this.outputFormat = 'rtf'; }
  const style = { hasBibliography: true, class: 'in-text', getCiteProc() { return { opt: { development_extensions: {}, mode: 'rtf' }, makeBibliography: () => [{ entry_ids: [['7']] }, ['English entry.\r\n']], sys: { retrieveItem: () => JSON.parse(JSON.stringify(native)) } }; } };
  const Zotero = {
    Integration: { Session, sessions: {} }, Styles: { init: async () => {}, get: () => style },
    Items: { get: () => ({ getField: () => C.write('', data) }) }, getMainWindows: () => [], getMainWindow: () => null,
    logError: e => { throw e; }, version, Utilities: { htmlSpecialChars: s => s }
  };
  const menus = new Map();
  const prefs = new Map();
  Zotero.Prefs = { get: key => prefs.get(key), set: (key, value) => prefs.set(key, value) };
  Zotero.MenuManager = { registerMenu: options => { menus.set(options.menuID, options); return options.menuID; }, unregisterMenu: id => menus.delete(id) };
  const context = vm.createContext({ Zotero, BilingualCore: C, BilingualJournals: J, Services: { prompt: { select: (win, title, text, options, selected) => { selected.value = context.nextChoice; return true; } } }, console });
  const upstream = fs.readFileSync(__dirname + '/research/integration-' + version + '.js', 'utf8');
  const start = upstream.indexOf('Zotero.Integration.Session.prototype.setData =');
  const end = upstream.indexOf('\n};', start) + 3;
  vm.runInContext(upstream.slice(start, end), context);
  Session.prototype.setDocPrefs = async function () { return this.data; };
  vm.runInContext(fs.readFileSync(__dirname + '/plugin.js', 'utf8'), context);
  return { context, Zotero, Session, plugin: context.BilingualPlugin, upstream, menus };
}
test('Context menu only appears for one regular item and unregisters on shutdown', async () => {
  const h = harness(); await h.plugin.start('');
  const registration = h.menus.get('bilingual-records-edit');
  assert.equal(registration.target, 'main/library/item');
  const menu = registration.menus[0];
  let visible, label;
  const context = { items: [{ isRegularItem: () => true }], menuElem: { setAttribute: (key, value) => { label = value; } }, setVisible: value => { visible = value; } };
  // Zotero 10 throws when a plugin reads this removed singular menu property.
  Object.defineProperty(context, 'collectionTreeRow', { get() { throw new Error('Use collectionTreeRows'); } });
  menu.onShowing(null, context); assert.equal(visible, true); assert.ok(label);
  context.items = []; menu.onShowing(null, context); assert.equal(visible, false);
  context.items = [{ isRegularItem: () => false }]; menu.onShowing(null, context); assert.equal(visible, false);
  h.plugin.stop(); assert.equal(h.menus.size, 0);
});
test('Journal preference updates survive reloads, reject stale editors and keep invalid edits out of storage', () => {
  const h = harness();
  const original = h.plugin.loadJournalTable();
  const updated = h.plugin.saveJournalTable([...original.rows, { zh: '测试学报', en: 'Test Journal' }], original.revision);
  assert.equal(J.match(h.plugin.loadJournalTable().rows, '测试学报').en, 'Test Journal');
  assert.throws(() => h.plugin.saveJournalTable(original.rows, original.revision));
  assert.throws(() => h.plugin.saveJournalTable([{ zh: '', en: '' }], updated.revision));
  assert.equal(h.plugin.loadJournalTable().revision, updated.revision);
});
for (const version of ['9.0.6', '10.0.7']) {
test(`Zotero ${version}: first insertion allows an unconfigured session before style selection`, async () => {
  const h = harness(version); await h.plugin.start('');
  const session = new h.Session();
  await assert.doesNotReject(() => session.setData({ style: {}, prefs: {} }));
  assert.equal(session.style, undefined);
  await session.setData({ style: { styleID: 'ordinary-csl' }, prefs: { bilingualRecordsLanguage: 'en' } });
  assert.equal(session.style.sys.retrieveItem(7).title, data.variants.en.title);
  h.plugin.stop();
});
test(`Actual Zotero ${version} setData: concurrent sessions stay independent across style resets and shutdown`, async () => {
  const h = harness(version); await h.plugin.start('');
  const en = new h.Session(), zh = new h.Session();
  const doc = lang => ({ prefs: { bilingualRecordsLanguage: lang }, style: { styleID: 'unchanged-style' } });
  await en.setData(doc('en')); await zh.setData(doc('zh'));
  assert.equal(en.style.sys.retrieveItem(7).author[0].family, 'Zhang');
  assert.equal(zh.style.sys.retrieveItem(7).author[0].family, '张');
  assert.match(en.style.makeBibliography()[1][0], /\(in Chinese\)/);
  assert.doesNotMatch(zh.style.makeBibliography()[1][0], /\(in Chinese\)/);
  await en.setData(doc('en'), true);
  assert.equal(en.style.sys.retrieveItem(7).title, data.variants.en.title);
  assert.equal(zh.style.sys.retrieveItem(7).title, native.title);
  h.context.nextChoice = 1; await en.setDocPrefs();
  assert.equal(en.data.prefs.bilingualRecordsLanguage, 'zh');
  assert.equal(en.style.sys.retrieveItem(7).title, native.title);
  assert.equal(en.rebuildCiteprocState, true);
  h.context.nextChoice = 2; await en.setDocPrefs();
  assert.equal(en.style.sys.retrieveItem(7).title, data.variants.en.title);
  assert.equal(zh.style.sys.retrieveItem(7).title, native.title);
  h.plugin.stop();
  assert.equal(en.style.sys.retrieveItem(7).title, native.title);
  assert.doesNotMatch(en.style.makeBibliography()[1][0], /\(in Chinese\)/);
});
test(`Actual Zotero ${version} document serializer includes language preference in XML and JSON`, () => {
  const h = harness(version);
  h.Zotero.Integration.DocumentData = function () {};
  const start = h.upstream.indexOf('Zotero.Integration.DocumentData.prototype.serialize =');
  const end = h.upstream.indexOf('\n};', start) + 3;
  vm.runInContext('const DATA_VERSION = 3;\n' + h.upstream.slice(start, end), h.context);
  const doc = new h.Zotero.Integration.DocumentData();
  doc.prefs = { bilingualRecordsLanguage: 'en' }; doc.style = { styleID: 'ordinary-csl' }; doc.sessionID = 'test';
  assert.match(doc.serialize(), /name="bilingualRecordsLanguage" value="en"/);
  doc.dataVersion = 4;
  assert.equal(JSON.parse(doc.serialize()).prefs.bilingualRecordsLanguage, 'en');
});
}
test('Unmodified Elsevier and Springer CSL render selected English metadata and author-date citations', () => {
  const processor = vm.createContext({ console });
  vm.runInContext(fs.readFileSync(__dirname + '/research/citeproc.js', 'utf8'), processor);
  const CSL = processor.CSL;
  const locale = fs.readFileSync(__dirname + '/research/locales-en-US.xml', 'utf8');
  for (const filename of ['elsevier-vancouver.csl', 'springer-basic-author-date.csl']) {
    const csl = fs.readFileSync(__dirname + '/research/' + filename, 'utf8');
    const engine = new CSL.Engine({ retrieveLocale: () => locale, retrieveItem: () => C.project(native, data, 'en') }, csl, 'en-US');
    engine.setOutputFormat('text'); engine.updateItems([7]);
    const citation = engine.makeCitationCluster([{ id: 7 }]);
    const bibliography = engine.makeBibliography()[1].join('\n');
    assert.match(bibliography, /Seismic response of structures/);
    assert.match(bibliography, /Zhang/);
    assert.match(bibliography, /Engineering Mechanics/);
    assert.doesNotMatch(bibliography, /[\u3400-\u9fff]/);
    if (filename.startsWith('springer')) assert.match(citation, /Zhang.*2024/);
    else assert.match(citation, /1/);
  }
});
