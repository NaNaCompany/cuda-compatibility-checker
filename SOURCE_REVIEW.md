# CUDA profile review

Checked: 2026-10-27. Scope: eight fixed profiles, Windows/Linux x86_64 driver comparison, and six languages (ko/en/es/zh/ja/de). This review records documentation checks, not physical GPU execution.

## API and integration

- `normalizeVersion(string)` returns a trimmed dotted numeric version or `null`.
- `compareVersions(a, b)` returns `-1`, `0`, `1` or `null` for invalid input. Comparison uses integer segments, not floating-point numbers.
- `parseNvidiaSmi(text)` returns `{ok, code, driverVersion, driverMaxCuda}`. It only accepts an exact `Driver Version:` field at a line/cell start or following an NVIDIA-SMI version header. The NVIDIA-SMI utility version is never substituted. Conflicting driver values return `SMI_AMBIGUOUS_DRIVER`. `CUDA Version:` is a separate driver capability field, never an installed toolkit field. The parser intentionally does not guess newer `KMD Version`/`CUDA UMD Version` labels; manual input remains available.
- `evaluateCompatibility({profileId, os, driverVersion, installedToolkit?}, data)` returns stable status/code fields, OS-specific `minimumDriver`, `minimumKind`, `driverStatus`, `unresolved`, `runtimeVersion`, independent `installedToolkit`, source URLs and official installation/download destinations. `os` accepts `windows`, `linux`, `macos`; unsupported/unknown values do not pass. It has no external dependencies or side effects.
- A sufficient numeric driver always returns `conditional` / `DRIVER_MINIMUM_MET_ONLY`, never a full compatibility result. Render this as a caution/incomplete state, not a green compatibility success. Show `unresolved` through `messages[lang][code]`.
- Display `automaticReadNotice`, `layersNotice`, `limitedNotice`, `minorNotice` and `noCommandNotice`. For `minimumKind === 'verified-release-baseline'`, also show `baselineNotice` with the numeric floor. Never call this latter baseline an absolute minimum patch for every NVIDIA product.
- Input text is untrusted. Render pasted/entered values via `textContent`. The module performs no HTML generation or execution.
- No browser hardware detection, shell command execution, network request, storage, installation command generation, or automatic repair exists. `command` is always `null`; `autoDetected` is always `false`.

## Sources actually opened

1. [CUDA 11.8 archived release notes](https://docs.nvidia.com/cuda/archive/11.8.0/cuda-toolkit-release-notes/index.html): minor compatibility floor is Linux 450.80.02 / Windows 452.39. The packaged toolkit driver is a separate value and is not used as that floor.
2. [CUDA 12.1 archived release notes](https://docs.nvidia.com/cuda/archive/12.1.0/cuda-toolkit-release-notes/index.html): minor compatibility floor is Linux 525.60.13 / Windows 527.41.
3. [CUDA 12.4 archived release notes](https://docs.nvidia.com/cuda/archive/12.4.0/cuda-toolkit-release-notes/index.html): minor compatibility floor is Linux 525.60.13 / Windows 528.33. This differs from the Windows number in the 12.1 archive; the dataset preserves each cited profile's source scope instead of flattening all CUDA 12.x into one Windows patch value.
4. [CUDA 13.0 archived release notes](https://docs.nvidia.com/cuda/archive/13.0.0/cuda-toolkit-release-notes/index.html) and [NVIDIA R580 release notes](https://docs.nvidia.com/datacenter/tesla/tesla-release-notes-580-65-06/index.html): use the documented CUDA 13 R580 release baseline Linux 580.65.06 / Windows 580.88. The 13.0 archive's Windows packaged-driver cell is N/A; the Windows baseline comes from the separate official R580 document. This is explicitly typed `verified-release-baseline`.
5. [NVIDIA minor version compatibility](https://docs.nvidia.com/deploy/cuda-compatibility/minor-version-compatibility.html): newer branches retain backward compatibility. The apparent upper bounds on a minor-compatibility family must not become incompatibility ceilings. New features and PTX/JIT can require a newer driver than the family floor. Forward compatibility packages are outside this checker.
6. [Official PyTorch previous versions](https://pytorch.org/get-started/previous-versions/): directly observed Linux/Windows wheel listings for PyTorch 2.5.1 with cu118/cu121/cu124, and PyTorch 2.13.0 with cu130. These exact fixed combinations are recorded. No claim that a profile is the latest release is made. Listing availability does not verify Python ABI, CPU architecture or compiled GPU kernels; those remain unresolved.
7. [PyTorch binary runtime explanation](https://discuss.pytorch.org/t/is-it-required-to-set-up-cuda-on-pc-before-installing-cuda-enabled-pytorch/60181): maintainer explanation distinguishes the wheel's CUDA runtime from a local toolkit, with a local toolkit needed for relevant source/custom extension builds. The app's explanation is independently written.
8. [nvidia-smi official field reference](https://docs.nvidia.com/deploy/nvidia-smi/index.html): driver and CUDA user-mode-driver fields are distinct. The maximum supported CUDA display is not proof of a local toolkit installation.
9. [CUDA 10.2 archived release notes](https://docs.nvidia.com/cuda/archive/10.2/cuda-toolkit-release-notes/index.html): macOS support ends with CUDA 10.2. Thus all CUDA 11.8+ profiles in this dataset are unsupported on macOS. The checker does not claim PyTorch itself is unavailable there; users are directed to CPU/MPS options.
10. [NVIDIA Toolkit archive](https://developer.nvidia.com/cuda-toolkit-archive): official destination for version selection/download documentation. [CUDA 13.0 Windows installation guide](https://docs.nvidia.com/cuda/archive/13.0.0/cuda-installation-guide-microsoft-windows/index.html) was also opened to confirm that Windows release/compiler/GPU requirements are separate from driver numbers.
11. Current [CUDA release notes](https://docs.nvidia.com/cuda/cuda-toolkit-release-notes/index.html) were opened as a current-document sanity check. Both PyTorch start-locally host variants were opened; their selector/version text differed. No changing selector state is used to manufacture a command or declare a latest release.

## Authorship and redistribution

The files contain original application code, original operating instructions/translations, version-number facts, and citation URLs only. No external paragraphs, tables, images, logos, fonts, manuals, installers, firmware, or binary packages are redistributed. Sources are reference links; their documentation is not relicensed as application content.

## Verification

Executed using the explicit workspace RTK executable:

`rtk.exe test node --test output/search-portals-2026-10-27/cuda.test.mjs`

Result: 8 tests passed, 0 failed. Tests contain independently fixed expected driver floors and wheel versions, numeric/version boundaries, recent driver branches, unknown and macOS routes, absent/invalid input, injection-like strings, parser label distinctions/conflicts, runtime/toolkit separation, and six-language key parity. This does not establish physical GPU, live browser UI, package installation, Python ABI, GPU architecture/kernel support, GitHub publication or deployed-page behavior.
