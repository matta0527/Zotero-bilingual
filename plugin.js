/* SPDX-License-Identifier: AGPL-3.0-or-later */
var BilingualPlugin = {
  restorers: [], windows: new Set(), engines: new Map(),
  patch(object, key, factory) {
    const original = object[key];
    if (typeof original !== 'function') throw new Error('双语题录：找不到接口 ' + key);
    const replacement = factory(original);
    object[key] = replacement;
    this.restorers.push(() => { if (object[key] === replacement) object[key] = original; });
  },
  async start(rootURI) {
    this.rootURI = rootURI;
    const plugin = this;
    const proto = Zotero.Integration.Session.prototype;
    try {
      this.patch(proto, 'setData', original => async function (data, reset) {
        const changed = this.data?.prefs?.bilingualRecordsLanguage !== data.prefs?.bilingualRecordsLanguage;
        const result = await original.call(this, data, reset || changed);
        plugin.bindEngine(this);
        return result;
      });
      this.patch(proto, 'setDocPrefs', original => async function (...args) {
        const oldData = await original.apply(this, args);
        // The original method throws on Cancel. No dialog is shown on an ordinary Refresh.
        if (!this.data?.style?.styleID || !this.style) return oldData;
        const current = this.data.prefs.bilingualRecordsLanguage || 'original';
        const selection = { value: ['original', 'zh', 'en'].indexOf(current) };
        const accepted = Services.prompt.select(Zotero.getMainWindow(), '本篇文档的题录语言',
          '选择传给引用样式的信息。仅影响本篇文档；未配置双语的条目使用原题录。',
          ['原始题录（不替换）', '中文题录', '英文题录'], selection);
        if (!accepted) return oldData;
        const lang = ['original', 'zh', 'en'][selection.value];
        if (lang !== current) {
          this.data.prefs.bilingualRecordsLanguage = lang;
          await this.setData(this.data, true);
          this.forceUpdateAllCitations = true;
          this.rebuildCiteprocState = true;
        }
        return oldData;
      });
      for (const session of Object.values(Zotero.Integration.sessions)) {
        if (session.style) {
          this.bindEngine(session);
          session.rebuildCiteprocState = true;
          session.forceUpdateAllCitations = true;
        }
      }
      for (const win of Zotero.getMainWindows()) this.addMenu(win);
      if (Zotero.MenuManager) {
        this.contextMenuID = Zotero.MenuManager.registerMenu({
          menuID: 'bilingual-records-edit', pluginID: 'bilingual-records@local.invalid', target: 'main/library/item',
          menus: [{ menuType: 'menuitem', icon: 'chrome://bilingual-records/content/icons/bilingual.svg',
            darkIcon: 'chrome://bilingual-records/content/icons/bilingual-dark.svg',
            onShowing: (event, context) => {
              context.menuElem.setAttribute('label', '编辑双语题录…');
              context.setVisible(context.items?.length === 1 && context.items[0].isRegularItem());
            },
            onCommand: (event, context) => {
              const win = context.menuElem.ownerGlobal;
              this.edit(win).catch(error => { Zotero.logError(error); Services.prompt.alert(win, '双语题录', error.message); });
            }
          }]
        });
      }
    } catch (error) { this.stop(); Zotero.logError(error); throw error; }
  },
  bindEngine(session) {
    // New documents pass through setData({style:{},prefs:{}}) before the
    // preferences dialog creates an engine. This is a normal lifecycle stage.
    if (!session.style) return;
    const sys = session.style?.sys;
    if (!sys || typeof sys.retrieveItem !== 'function') throw new Error('双语题录原型仅支持可访问 sys.retrieveItem 的引用引擎');
    const existing = this.engines.get(sys);
    if (existing) { existing.session = session; return; }
    const entry = { session, original: sys.retrieveItem, wrapper: null };
    entry.wrapper = function (id) {
      const csl = entry.original.call(this, id);
      const lang = entry.session.data?.prefs?.bilingualRecordsLanguage || 'original';
      if (lang === 'original') return csl;
      // Embedded-only records lack the library Extra. Refuse silent language changes.
      if (typeof id === 'string' && id.includes('/')) throw new Error('双语题录：此文献仅嵌入在文档内，请先导入当前 Zotero 文献库后再选择语言。');
      const item = typeof id === 'object' ? id : Zotero.Items.get(id);
      if (!item) throw new Error('双语题录：找不到文献 ' + id);
      return BilingualCore.project(csl, BilingualCore.read(item.getField('extra')), lang);
    };
    sys.retrieveItem = entry.wrapper;
    const engine = session.style;
    if (typeof engine.makeBibliography === 'function') {
      entry.engine = engine;
      entry.bibliographyOriginal = engine.makeBibliography;
      entry.bibliographyWrapper = function (...args) {
        const bib = entry.bibliographyOriginal.apply(this, args);
        if (entry.session.data?.prefs?.bilingualRecordsLanguage !== 'en') return bib;
        const format = this.opt?.mode || entry.session.outputFormat;
        return BilingualCore.annotateBibliography(bib, id => {
          if (typeof id === 'string' && id.includes('/')) return false;
          const item = typeof id === 'object' ? id : Zotero.Items.get(id);
          return item && BilingualCore.isTranslatedChinese(entry.original.call(sys, id), BilingualCore.read(item.getField('extra')));
        }, format);
      };
      engine.makeBibliography = entry.bibliographyWrapper;
    }
    this.engines.set(sys, entry);
  },
  addMenu(win) {
    if (win.document.getElementById('bilingual-records-edit')) return;
    const menu = win.document.getElementById('menu_ToolsPopup');
    if (!menu) return;
    const node = win.document.createXULElement('menuitem');
    node.id = 'bilingual-records-edit';
    node.setAttribute('label', '编辑所选文献的双语题录…');
    node.classList.add('menuitem-iconic');
    node.setAttribute('image', 'chrome://bilingual-records/content/icons/bilingual.svg');
    node.addEventListener('command', () => this.edit(win).catch(e => {
      Zotero.logError(e); Services.prompt.alert(win, '双语题录', e.message);
    }));
    menu.appendChild(node); this.windows.add(win);
  },
  removeMenu(win) { win.document.getElementById('bilingual-records-edit')?.remove(); this.windows.delete(win); },
  loadJournalTable() {
    const revision = Zotero.Prefs.get('bilingualRecords.journals.v1') || '';
    return { ...BilingualJournals.load(revision), revision };
  },
  saveJournalTable(rows, expectedRevision) {
    const current = this.loadJournalTable();
    if (current.revision !== expectedRevision) throw new Error('对照表已被其他窗口修改，请关闭后重新打开。');
    const catalog = { version: 1, rows: BilingualJournals.validate(rows) };
    Zotero.Prefs.set('bilingualRecords.journals.v1', JSON.stringify(catalog));
    return this.loadJournalTable();
  },
  async edit(win) {
    const items = win.ZoteroPane.getSelectedItems().filter(i => i.isRegularItem());
    if (items.length !== 1) throw new Error('请先选中一条文献。');
    const item = items[0];
    const originalExtra = item.getField('extra');
    const native = Zotero.Utilities.Item.itemToCSLJSON(item);
    const fields = Object.fromEntries([...BilingualCore.fields, 'author'].filter(k => native[k] !== undefined).map(k => [k, native[k]]));
    const data = BilingualCore.read(originalExtra) || { version: 1, variants: { zh: fields, en: {} } };
    const io = { data, result: null,
      isJournal: Zotero.ItemTypes.getName(item.itemTypeID) === 'journalArticle',
      nativeJournal: native['container-title'] || '',
      loadJournalTable: () => this.loadJournalTable(),
      saveJournalTable: (rows, revision) => this.saveJournalTable(rows, revision)
    };
    io.wrappedJSObject = io;
    const height = Math.min(840, Math.max(480, win.screen.availHeight - 80));
    const width = Math.min(1000, Math.max(700, win.screen.availWidth - 80));
    win.openDialog('chrome://bilingual-records/content/editor.xhtml', '', `chrome,dialog,modal,resizable,centerscreen,width=${width},height=${height}`, io);
    if (!io.result) return;
    if (item.getField('extra') !== originalExtra) throw new Error('编辑期间条目发生变化，请重新打开再保存。');
    item.setField('extra', BilingualCore.write(originalExtra, io.result));
    await item.saveTx();
    for (const session of Object.values(Zotero.Integration.sessions)) {
      if (session.style) { session.rebuildCiteprocState = true; session.forceUpdateAllCitations = true; }
    }
  },
  stop() {
    if (this.contextMenuID && Zotero.MenuManager) Zotero.MenuManager.unregisterMenu(this.contextMenuID);
    this.contextMenuID = null;
    for (const win of [...this.windows]) this.removeMenu(win);
    for (const [sys, entry] of this.engines) {
      if (sys.retrieveItem === entry.wrapper) sys.retrieveItem = entry.original;
      if (entry.engine?.makeBibliography === entry.bibliographyWrapper) entry.engine.makeBibliography = entry.bibliographyOriginal;
      entry.session.rebuildCiteprocState = true;
      entry.session.forceUpdateAllCitations = true;
    }
    this.engines.clear();
    for (const restore of this.restorers.reverse()) restore();
    this.restorers = [];
  }
};
