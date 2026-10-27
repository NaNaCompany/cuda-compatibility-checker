import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareVersions, normalizeVersion, parseNvidiaSmi, evaluateCompatibility} from '../src/cuda-core.mjs';

const data = JSON.parse(readFileSync(new URL('../src/data.json', import.meta.url), 'utf8'));
const messages = JSON.parse(readFileSync(new URL('../src/messages.json', import.meta.url), 'utf8'));
const run = (profileId, os, driverVersion, extra = {}) => evaluateCompatibility({profileId, os, driverVersion, ...extra}, data);

test('numeric comparison handles NVIDIA patch numbers without floating-point parsing', () => {
  assert.equal(compareVersions('550.10', '550.9'), 1);
  assert.equal(compareVersions('525.60.13', '525.60.12'), 1);
  assert.equal(compareVersions('580.88', '580.88.0'), 0);
  assert.equal(compareVersions('580.65.06', '580.65.7'), -1);
  assert.equal(compareVersions(' 580.88 ', '580.88'), 0);
  for (const value of ['', '580', 'v580.88', '580.88-beta', '580.88;alert(1)', '<img>', null, 580.88, '580..88', '580.88.1.2.3', '1'.repeat(100)]) {
    assert.equal(normalizeVersion(value), null);
    assert.equal(compareVersions(value, '580.88'), null);
  }
});

// Expected values are fixed from cited release notes; never obtained from the dataset under test.
test('OS-specific archived CUDA floors remain exact and distinct', () => {
  const expected = [
    ['cuda-11-8', 'linux', '450.80.02', '450.80.01'],
    ['cuda-11-8', 'windows', '452.39', '452.38'],
    ['cuda-12-1', 'linux', '525.60.13', '525.60.12'],
    ['cuda-12-1', 'windows', '527.41', '527.40'],
    ['cuda-12-4', 'linux', '525.60.13', '525.60.12'],
    ['cuda-12-4', 'windows', '528.33', '528.32'],
    ['cuda-13-0', 'linux', '580.65.06', '580.65.05'],
    ['cuda-13-0', 'windows', '580.88', '580.87']
  ];
  for (const [id, os, floor, below] of expected) {
    assert.equal(run(id, os, floor).minimumDriver, floor);
    assert.equal(run(id, os, floor).driverStatus, 'meets-minimum');
    assert.equal(run(id, os, floor).status, 'conditional');
    assert.equal(run(id, os, below).status, 'driver-too-old');
  }
  assert.equal(run('cuda-12-1', 'windows', '527.41').status, 'conditional');
  assert.equal(run('cuda-12-4', 'windows', '527.41').status, 'driver-too-old');
});

test('newer driver branches are never rejected for crossing minor-family upper ranges', () => {
  for (const id of ['cuda-11-8', 'cuda-12-1', 'cuda-12-4', 'cuda-13-0']) {
    for (const os of ['windows', 'linux']) {
      const result = run(id, os, '615.88.01');
      assert.equal(result.status, 'conditional');
      assert.equal(result.code, 'DRIVER_MINIMUM_MET_ONLY');
      assert.ok(result.unresolved.includes('GPU_ARCHITECTURE_UNVERIFIED'));
      assert.ok(result.unresolved.includes('PLATFORM_DETAILS_UNVERIFIED'));
    }
  }
});

test('official fixed PyTorch wheel combinations and driver floors are independently asserted', () => {
  const expected = [
    ['torch-2-5-1-cu118','2.5.1','11.8','cu118','452.39'],
    ['torch-2-5-1-cu121','2.5.1','12.1','cu121','527.41'],
    ['torch-2-5-1-cu124','2.5.1','12.4','cu124','528.33'],
    ['torch-2-13-0-cu130','2.13.0','13.0','cu130','580.88']
  ];
  for (const [id, torch, cuda, index, floor] of expected) {
    const profile = data.profiles.find(p => p.id === id);
    assert.equal(profile.torch, torch);
    assert.equal(profile.cuda, cuda);
    assert.equal(profile.indexUrl, 'https://download.pytorch.org/whl/' + index);
    const result = run(id, 'windows', floor, {pythonVersion:'3.99', architecture:'unknown'});
    assert.equal(result.minimumDriver, floor);
    assert.equal(result.status, 'conditional');
    assert.ok(result.unresolved.includes('PYTHON_WHEEL_UNVERIFIED'));
    assert.ok(result.unresolved.includes('FRAMEWORK_GPU_KERNELS_UNVERIFIED'));
    assert.equal(result.command, null);
  }
});

test('missing, unknown and unsupported combinations cannot become compatible', () => {
  assert.equal(evaluateCompatibility({}, data).code, 'UNKNOWN_PROFILE');
  assert.equal(evaluateCompatibility(null, data).status, 'unknown');
  assert.equal(run('__proto__', 'windows', '999.99').status, 'unknown');
  assert.equal(run('torch-9-cu999', 'windows', '999.99').status, 'unknown');
  assert.equal(run('cuda-12-4', 'solaris', '999.99').code, 'UNKNOWN_OS');
  assert.equal(run('cuda-12-4', '', '999.99').status, 'unknown');
  assert.equal(run('cuda-12-4', 'linux', '').code, 'DRIVER_REQUIRED');
  assert.equal(run('cuda-12-4', 'linux', '550.1<script>').code, 'INVALID_DRIVER_VERSION');
  for (const profile of data.profiles) {
    assert.equal(run(profile.id, 'macos', '999.99').status, 'unsupported');
    assert.equal(run(profile.id, 'macos', '').code, 'MACOS_CUDA_UNSUPPORTED');
  }
});

test('installed toolkit is a separate reported field, never substituted for a driver or wheel runtime', () => {
  const result = run('torch-2-5-1-cu118', 'windows', '580.88', {installedToolkit:'13.0'});
  assert.equal(result.runtimeVersion, '11.8');
  assert.equal(result.installedToolkit, '13.0');
  assert.equal(result.driverVersion, '580.88');
  assert.equal(result.status, 'conditional');
  assert.equal(result.autoDetected, false);
  assert.equal(run('cuda-13-0', 'linux', '', {installedToolkit:'13.0'}).status, 'unknown');
  assert.ok(run('cuda-13-0','linux','580.65.06',{installedToolkit:'<svg>'}).unresolved.includes('INVALID_TOOLKIT_VERSION'));
});

test('nvidia-smi parser only uses exact Driver Version label and keeps CUDA capability separate', () => {
  const parsed = parseNvidiaSmi('| NVIDIA-SMI 550.54.14    Driver Version: 551.61    CUDA Version: 12.4 |');
  assert.deepEqual(parsed, {ok:true, code:'SMI_PARSED', driverVersion:'551.61', driverMaxCuda:'12.4'});
  assert.equal(parseNvidiaSmi('NVIDIA-SMI 580.65.06\nCUDA Version: 13.0').driverVersion, null);
  assert.equal(parseNvidiaSmi('DriverVersion: 580.88').ok, false);
  assert.equal(parseNvidiaSmi('Fake Driver Version: 580.88').ok, false);
  assert.equal(parseNvidiaSmi('Driver Version: 580.88\nDriver Version: 551.61').code,'SMI_AMBIGUOUS_DRIVER');
  assert.equal(parseNvidiaSmi('Driver Version: 580.88\nDriver Version: 580.88').ok,true);
  assert.equal(parseNvidiaSmi('Driver Version: 580.88<script>').code,'SMI_INVALID_DRIVER');
  assert.equal(parseNvidiaSmi('Driver Version: N/A').code,'SMI_INVALID_DRIVER');
  assert.equal(parseNvidiaSmi('<script>throw new Error()</script>').ok,false);
  assert.equal(parseNvidiaSmi('KMD Version: 580.88').code,'SMI_NO_DRIVER_LABEL');
  assert.equal(parseNvidiaSmi('').code,'SMI_EMPTY');
  assert.equal(parseNvidiaSmi(null).code,'SMI_EMPTY');
  assert.equal(parseNvidiaSmi('x'.repeat(50001)).code,'SMI_TOO_LONG');
});

test('six-language data and result dictionaries are complete', () => {
  const languages=['ko','en','es','zh','ja','de'];
  const keys=Object.keys(messages.en).sort();
  assert.equal(data.entries.length,8);
  assert.equal(new Set(data.entries.map(e=>e.id)).size,8);
  for(const lang of languages) {
    assert.ok(data.title[lang]); assert.ok(data.description[lang]);
    assert.deepEqual(Object.keys(messages[lang]).sort(),keys);
    for(const entry of data.entries) {
      for(const key of ['title','summary','escalation','scope']) assert.ok(entry.text[lang][key]);
      assert.ok(entry.text[lang].checks.length>=2);
    }
    for(const profile of data.profiles) assert.ok(profile.text[lang].summary);
  }
  for (const profile of data.profiles) {
    assert.equal(profile.sources.every(s => s.url.startsWith('https://')), true);
    assert.ok(['minor-version-compatibility','verified-release-baseline'].includes(profile.minimumKind));
  }
});
