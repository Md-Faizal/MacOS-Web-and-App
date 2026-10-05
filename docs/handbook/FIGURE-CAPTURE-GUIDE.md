# Figure and Screenshot Capture Guide

## Figure Status

Use editable SVG or Mermaid source for architecture, sequence, deployment, and data-flow diagrams. Use screenshots only to explain visible UI or device behavior. Every screenshot slot must be visibly labeled until replaced with a real capture; the generic image at `assets/screenshot-placeholder.svg` is not evidence of a working screen.

## Required Figure Record

For each captured screen, include a concise caption and these facts in the chapter source or figure metadata:

| Field | Required value |
| --- | --- |
| Figure ID and caption | Stable identifier and the task or state shown |
| Product surface | MacOS web, Zentra, or Android POS |
| Build identity | Git revision or app version used to capture |
| Platform and viewport | Browser/OS/window size or Android device/emulator dimensions and density |
| Scenario | Screen state and actions needed to reproduce it |
| Data classification | Synthetic/demo data; no production PII or financial records |
| Status | `placeholder`, `captured`, or `needs-refresh` |

Store approved captures beside the owning chapter under `docs/handbook/assets/screenshots/`. Use descriptive ASCII filenames such as `macos-billing-ledger-desktop.png`. Optimize images for print; preserve enough resolution for labels and tables to remain readable at A4 size.

## Capture Checklist

1. Launch the exact local/staging build and record its revision. Use a dedicated synthetic account and records.
2. Set the intended device and viewport. Frame the relevant state without hiding controls needed to understand the task.
3. Inspect the entire image for names, customer/contact details, invoice values, tokens, private hostnames, personal notifications, logs, and debug overlays.
4. Save the image and update the figure caption with product surface, build, platform, viewport, scenario, and status.
5. Rebuild the handbook and inspect both the HTML and PDF figure at full size. Ensure text is legible and the image does not split awkwardly across pages.

## Priority Capture Queue

| Priority | Surface / screen | Intended walkthrough |
| --- | --- | --- |
| 1 | MacOS desktop and launcher | Open an app, move between windows, and reach the task entry point |
| 2 | MacOS billing dashboard and invoice editor | Create/validate an invoice and show the save/feedback state |
| 3 | Ledger and payment screen | Record a payment and demonstrate the resulting balance/event update |
| 4 | Product inventory and batch detail | Inspect stock, variant, and batch-expiry context |
| 5 | Contacts and analytics | Find a customer and inspect the associated summary/report |
| 6 | Zentra dashboard and report | Navigate an analytics view and demonstrate filter/data states |
| 7 | Android billing, ledger, and settings | Show a representative Compose screen and device-specific controls |

The queue is not a claim that the capture has been made. Mark screens `captured` only after review and source revision are recorded.