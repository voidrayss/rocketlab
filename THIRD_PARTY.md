# Third-party components

RocketLab loads the following unmodified published dependencies from CDNs. No
third-party WASM binaries or library source files are vendored in this repository.

- **Three.js 0.160.0** — MIT, Copyright © 2010–2023 Three.js authors.
  Source and license: https://github.com/mrdoob/three.js/tree/r160
- **replicad-opencascadejs 0.20.2** — published binding/build package declares
  MIT; author Steve Genoud. Source and build configuration at the pinned commit:
  https://github.com/sgenoud/replicad/tree/24b0570eda7090dd06f76a8083979647be62010e/packages/replicad-opencascadejs
- **OpenCascade.js / Open CASCADE Technology**, contained in that WASM build.
  OpenCascade.js project: https://github.com/donalffons/opencascade.js
  OCCT is licensed under LGPL 2.1 with an additional exception, with copyright
  held by Open CASCADE SAS and contributors. The binding package's MIT label
  does not supersede the kernel's license.
  Upstream license: https://occt3d.com/dev/doc/overview/html/occt_public_license.html
  OCCT source and license files: https://github.com/Open-Cascade-SAS/OCCT

Optional development-only independent validation uses **occt-import-js 0.0.23**,
licensed LGPL-2.1, by Viktor Kovacs and contributors. It is downloaded only to
temporary storage, not included in the app:
https://github.com/kovacsv/occt-import-js

The app uses the published kernel without modifications. Future vendoring or
redistribution of binary builds should retain upstream notices, license/exception
texts, corresponding kernel/build sources, and the ability to replace the library.


Optional reference validation invokes a locally installed **OpenRocket 24.12**
(GPL-3.0-or-later with its documented data-packaging permission) in a separate
process. No OpenRocket implementation, JAR, or runtime is vendored or loaded by
the website. The benchmark driver was written for RocketLab using public API
calls; stored reference data came from actual execution. See the release license:
https://github.com/openrocket/openrocket/blob/release-24.12/LICENSE.TXT
