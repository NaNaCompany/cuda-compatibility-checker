/** Pure, local checks. No hardware access, network, storage, commands or DOM. */
export function normalizeVersion(value) {
  if (typeof value !== 'string') return null;
  const version = value.trim();
  return /^[0-9]{1,6}(?:\.[0-9]{1,6}){1,3}$/.test(version) ? version : null;
}

export function compareVersions(a, b) {
  const av = normalizeVersion(a), bv = normalizeVersion(b);
  if (!av || !bv) return null;
  const x = av.split('.').map(Number), y = bv.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1;
  }
  return 0;
}

export function parseNvidiaSmi(value) {
  const result = {ok: false, code: 'SMI_NO_DRIVER_LABEL', driverVersion: null, driverMaxCuda: null};
  if (typeof value !== 'string' || !value.trim()) return {...result, code: 'SMI_EMPTY'};
  if (value.length > 50000) return {...result, code: 'SMI_TOO_LONG'};
  // Deliberately do not infer a driver from the NVIDIA-SMI or CUDA Version numbers.
  const driverPattern = /(?:^[\t ]*|\|[\t ]*|\bNVIDIA-SMI[\t ]+[0-9.]+[\t ]+)Driver Version[\t ]*:[\t ]*([^\s|]+)/gm;
  const drivers = [...value.matchAll(driverPattern)].map(m => normalizeVersion(m[1]));
  const cuda = [...value.matchAll(/(?:^|[|\t ]+)CUDA Version[\t ]*:[\t ]*([^\s|]+)/gm)].map(m => normalizeVersion(m[1]));
  if (cuda.length && cuda.every(Boolean) && new Set(cuda).size === 1) result.driverMaxCuda = cuda[0];
  if (!drivers.length) return result;
  if (drivers.some(v => !v)) return {...result, code: 'SMI_INVALID_DRIVER'};
  if (new Set(drivers).size !== 1) return {...result, code: 'SMI_AMBIGUOUS_DRIVER'};
  return {...result, ok: true, code: 'SMI_PARSED', driverVersion: drivers[0]};
}

/** Dataset is an explicit argument so browser and Node use exactly the same facts. */
export function evaluateCompatibility(input = {}, data = {}) {
  if (!input || typeof input !== 'object') input = {};
  const profile = Array.isArray(data.profiles) ? data.profiles.find(p => p.id === input.profileId) : null;
  const result = {
    status: 'unknown', code: 'UNKNOWN_PROFILE', driverStatus: 'unknown', minimumDriver: null,
    minimumKind: null, profileId: profile?.id || null, os: input.os || null,
    driverVersion: normalizeVersion(input.driverVersion), runtimeVersion: profile?.cuda || null,
    installedToolkit: normalizeVersion(input.installedToolkit), toolkitStatus: input.installedToolkit ? 'reported' : 'not-reported',
    unresolved: [], sources: profile?.sources || [], installUrl: profile?.installUrl || null,
    driverDownloadUrl: 'https://www.nvidia.com/en-us/drivers/', command: null,
    autoDetected: false
  };
  if (!profile) return result;
  if (input.os === 'macos') return {...result, status: 'unsupported', code: 'MACOS_CUDA_UNSUPPORTED'};
  if (!['linux', 'windows'].includes(input.os)) return {...result, code: 'UNKNOWN_OS'};
  const minimum = profile.minimumDriver?.[input.os];
  result.minimumDriver = minimum || null;
  result.minimumKind = profile.minimumKind || null;
  if (!minimum) return {...result, code: 'UNKNOWN_DRIVER_MINIMUM'};
  if (!result.driverVersion) return {...result, code: input.driverVersion ? 'INVALID_DRIVER_VERSION' : 'DRIVER_REQUIRED'};
  result.driverStatus = compareVersions(result.driverVersion, minimum) >= 0 ? 'meets-minimum' : 'below-minimum';
  if (result.driverStatus === 'below-minimum') return {...result, status: 'driver-too-old', code: 'DRIVER_BELOW_MINIMUM'};
  // There is intentionally no maximum driver branch rejection: backward compatibility applies.
  result.unresolved = ['GPU_ARCHITECTURE_UNVERIFIED', 'PLATFORM_DETAILS_UNVERIFIED', 'APPLICATION_FEATURES_UNVERIFIED'];
  if (profile.kind === 'pytorch-wheel') result.unresolved.push('PYTHON_WHEEL_UNVERIFIED', 'FRAMEWORK_GPU_KERNELS_UNVERIFIED');
  if (profile.kind === 'toolkit') result.unresolved.push('TOOLCHAIN_UNVERIFIED');
  if (input.installedToolkit && !result.installedToolkit) result.unresolved.push('INVALID_TOOLKIT_VERSION');
  return {...result, status: 'conditional', code: 'DRIVER_MINIMUM_MET_ONLY'};
}
