# Web Frontends

## MacOS Web Experience

The main browser app is the vanilla HTML/CSS/JavaScript interface under `frontend/`. Root `vite.config.js` defines its Vite root and multi-page build configuration. The shared Express API is started by root npm scripts; local browser requests use the configured development proxy and should use the same relative API paths as the app.

| Task | Command |
| --- | --- |
| Start frontend and API | `npm run dev:local` |
| Build production frontend | `npm run build` |
| Preview Vite build | `npm run preview` |

![MacOS screenshot placeholder: desktop shell and launcher](asset:screenshot-placeholder.svg)

**Figure WEB-01. MacOS desktop shell and launcher.** Capture a clean launch through the desktop and the app launcher using synthetic data. Record the app revision, browser, operating system, and viewport. Do not use a wallpaper image as a substitute for this UI capture.

![MacOS screenshot placeholder: billing dashboard and invoice editor](asset:screenshot-placeholder.svg)

**Figure WEB-02. Billing dashboard and invoice editor.** Capture the verified path from opening billing to a saved invoice, including only safe synthetic customer and line-item values. Record any modal, validation, or confirmation behavior shown.

![MacOS screenshot placeholder: product inventory and batch detail](asset:screenshot-placeholder.svg)

**Figure WEB-03. Product inventory and batch detail.** Capture a synthetic product with a non-sensitive variant/batch example, and label any expiry or stock state depicted. Keep the screenshot tied to a reproducible development dataset.

The root `npm run build` is a frontend build. Verify backend packaging and deployment separately in the active workflow; do not assume this command builds every platform.

## Zentra Analytics Dashboard

Zentra is a separate React/TypeScript project under `zentra-analytics-dashboard/`. Its manifest declares React 19, TypeScript, and its own Vite 6 toolchain. It has an independent lockfile and environment template.

| Task | Command |
| --- | --- |
| Start Zentra with shared API | `npm run dev:zentra` |
| Build Zentra | `npm --prefix zentra-analytics-dashboard run build` |
| Type-check Zentra | `npm --prefix zentra-analytics-dashboard run lint` |

![Zentra screenshot placeholder: analytics dashboard and report](asset:screenshot-placeholder.svg)

**Figure WEB-04. Zentra dashboard and report view.** Capture the dashboard and a representative report with non-production aggregates. Include viewport, build revision, active filter state, and whether the screen uses fixture or live development data.

Check the active Vite config and `zentra-analytics-dashboard/.env.example` for effective ports and API base URL before diagnosing connectivity. Do not assume the API URL in the example points to the root backend's default port.

## UI and Contract Changes

For API-facing work, record the endpoint, payload contract, auth assumptions, and loading/error behavior. Follow existing component and styling conventions within each frontend; shared backend data does not make their build systems or dependency graphs interchangeable. The generated `inventory.json` is the machine-readable source for locked Node package versions and npm scripts.