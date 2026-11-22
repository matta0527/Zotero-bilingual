/* SPDX-License-Identifier: AGPL-3.0-or-later */
var state;
var chromeHandle;
function install() {}
function uninstall() {}
async function startup({ rootURI }) {
  await Zotero.initializationPromise;
  const aomStartup = Cc['@mozilla.org/addons/addon-manager-startup;1'].getService(Ci.amIAddonManagerStartup);
  chromeHandle = aomStartup.registerChrome(Services.io.newURI(rootURI + 'manifest.json'), [
    ['content', 'bilingual-records', rootURI]
  ]);
  const scope = { Zotero, Services };
  Services.scriptloader.loadSubScript(rootURI + 'core.js', scope);
  Services.scriptloader.loadSubScript(rootURI + 'journals.js', scope);
  Services.scriptloader.loadSubScript(rootURI + 'plugin.js', scope);
  state = scope.BilingualPlugin;
  await state.start(rootURI);
  Zotero.debug('Bilingual Records 0.2.0 startup completed');
}
function onMainWindowLoad({ window }) { if (state) state.addMenu(window); }
function onMainWindowUnload({ window }) { if (state) state.removeMenu(window); }
function shutdown() {
  if (state) state.stop(); state = null;
  if (chromeHandle) chromeHandle.destruct(); chromeHandle = null;
}
