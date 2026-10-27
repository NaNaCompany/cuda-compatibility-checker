import {evaluateCompatibility, parseNvidiaSmi} from './cuda-core.mjs';

export async function initCuda(root = document) {
  const config = JSON.parse(root.querySelector('#app-config').textContent);
  const ui = config.ui, messages = config.messages;
  const status = root.querySelector('#status');
  const copy = root.querySelector('#copy-code');
  copy?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(copy.dataset.code || ''); if (status) status.textContent = ui.copied; }
    catch { if (status) status.textContent = ui.copyFailed; }
  });
  const form = root.querySelector('#cuda-form');
  if (!form) { root.documentElement.classList.add('app-ready'); return; }
  const url = new URL(config.dataURL, location.href);
  if (url.origin !== location.origin) throw new Error('DATA_ORIGIN');
  const response = await fetch(url, {credentials: 'same-origin', mode: 'same-origin'});
  if (!response.ok) throw new Error('DATA_LOAD');
  const data = await response.json();
  if (!Array.isArray(data.profiles)) throw new Error('DATA_SCHEMA');
  const profile = root.querySelector('#profile');
  const driver = root.querySelector('#driver-version');
  const driverMax = root.querySelector('#driver-max-cuda');
  let parsedDriver = null;
  const output = root.querySelector('#cuda-result');
  const node = (tag, text) => { const element = root.createElement(tag); element.textContent = String(text ?? ''); return element; };
  const paragraph = text => output.append(node('p', text));
  const field = (label, value) => paragraph(`${label}: ${value || ui.notProvided}`);
  const link = (label, value) => {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') return;
      const element = node('a', label); element.href = url.href; element.rel = 'noopener noreferrer';
      output.append(element);
    } catch { /* No malformed links. */ }
  };
  const selectHash = () => {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    if (id && [...profile.options].some(option => option.value === id)) profile.value = id;
  };
  selectHash();
  globalThis.addEventListener?.('hashchange', selectHash);
  root.querySelector('#parse-smi')?.addEventListener('click', () => {
    const result = parseNvidiaSmi(root.querySelector('#smi-output')?.value || '');
    if (driverMax) driverMax.textContent = result.ok && result.driverMaxCuda ? result.driverMaxCuda : ui.unknown;
    if (result.ok) { driver.value = result.driverVersion; parsedDriver = result.driverVersion; }
    else {
      if (parsedDriver !== null && driver.value === parsedDriver) driver.value = '';
      parsedDriver = null;
    }
    if (status) status.textContent = messages[result.code] || ui.unknown;
  });
  // A manually changed driver is no longer associated with the pasted report.
  driver.addEventListener('input', () => { parsedDriver = null; if (driverMax) driverMax.textContent = ui.unknown; });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const result = evaluateCompatibility({profileId: profile.value, os: root.querySelector('#os')?.value,
      driverVersion: driver.value, installedToolkit: root.querySelector('#installed-toolkit')?.value || ''}, data);
    output.replaceChildren();
    if (status) status.textContent = messages[result.code] || ui.unknown;
    output.append(node('h3', messages[result.status] || ui.unknown));
    paragraph(messages[result.code] || ui.unknown);
    field(messages.driverVersion || ui.driver, result.driverVersion);
    field(messages.minimumDriver, result.minimumDriver);
    field(messages.runtimeVersion, result.runtimeVersion);
    field(messages.installedToolkit, result.installedToolkit);
    paragraph(messages.layersNotice);
    paragraph(messages.limitedNotice);
    if (result.runtimeVersion === '13.0') paragraph(messages.baselineNotice);
    if (result.minimumKind === 'minor-version-compatibility') paragraph(messages.minorNotice);
    if (result.unresolved.length) {
      const list = root.createElement('ul');
      for (const key of result.unresolved) list.append(node('li', messages[key] || ui.unknown));
      output.append(list);
    }
    if (result.installUrl) link(messages.officialInstall, result.installUrl);
    link(messages.driverDownload, result.driverDownloadUrl);
    for (const source of result.sources) link(source.label, source.url);
  });
  for (const button of root.querySelectorAll('#cuda-form button')) button.disabled = false;
  const parse = root.querySelector('#parse-smi');
  if (parse) parse.disabled = false;
  root.documentElement.classList.add('app-ready');
}

if (typeof document !== 'undefined') {
  initCuda().catch(() => {
    const status = document.querySelector('#status');
    try { if (status) status.textContent = JSON.parse(document.querySelector('#app-config').textContent).ui.loadFailed; } catch { /* Invalid config. */ }
  });
}
