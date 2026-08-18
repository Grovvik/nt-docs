# Windows NT Architecture & Boot Internals (x64)

Educational documentation and architectural reference for the Windows NT execution pipeline (x64), tracing the system lifecycle from hardware reset and UEFI initialization to the interactive user session, as well as the power management subsystem (Shutdown S5, Sleep S3/S0ix, and Hibernation S4 / Fast Startup).

> **Note**: Documentation articles are written in Russian, preserving original English API symbols, kernel structures, CPU registers, and decompiled C listings.

---

## Live Documentation

- **Online Docs**: [https://grovvik.github.io/nt-docs/](https://grovvik.github.io/nt-docs/)
---

## Local Setup

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Installation & Run

```bash
git clone https://github.com/Grovvik/nt-docs.git
cd nt-docs
npm install
npm run docs:dev
```

The local development server will start at `http://localhost:5173`.

---

## Available Scripts

- `npm run docs:dev` - Start local development server with VitePress HMR.
- `npm run docs:build` - Build production static bundle to `docs/.vitepress/dist`.
- `npm run docs:preview` - Preview the production build locally.

---

## Tech Stack

- **Documentation Engine**: [VitePress](https://vitepress.dev/) 1.6+
- **UI & Components**: [Vue 3](https://vuejs.org/) + TypeScript
- **Diagrams**: [Mermaid.js](https://mermaid.js.org/)
- **Icons**: [Lucide Vue Next](https://lucide.dev/)

---

## License

Created for educational, reverse-engineering, and architectural research purposes.  
Windows is a registered trademark of Microsoft Corporation.
