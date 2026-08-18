# Windows NT Internals & Architecture

Interactive low-level documentation and visual exploration of the Windows NT kernel architecture (x64), covering the complete execution lifecycle from hardware reset and kernel initialization phases to memory management, I/O dispatch, Session 0 services, and userland subsystems.

> **Note**: The documentation articles are currently written in Russian, preserving original English API symbols, kernel structures, registers, and C pseudocode.

---

## Live Demo

- Online Documentation: [https://grovvik.github.io/nt-docs/](https://grovvik.github.io/nt-docs/)
- Source Repository: [https://github.com/Grovvik/nt-docs](https://github.com/Grovvik/nt-docs)

---

## Key Features

- **Decompiled C Pseudocode**: Real signatures and disassembly reconstructions of critical kernel functions (`KiSystemStartup`, `MmInitSystem`, `ObInitSystem`, `SmpInit`, `IopInitializeBootDrivers`, etc.).
- **Interactive Term Tooltips (`<Term>`)**: Contextual hover tooltips with definitions, register mappings, and privilege rings for structures like `_KPCR`, `_KPRCB`, `_EPROCESS`, `_IRP`, `SSDT`, `IDT`, `GDT`.
- **Canvas Call Graph**: Vector-based Mermaid call graph supporting pan and zoom with cursor targeting.
- **Stage Lifecycle Visualizer**: Step-by-step pipeline covering hardware initialization, boot manager, kernel phases 0/1, SMSS, Wininit, and user logon.
- **Kernel Structure Glossary**: Searchable index of x64 Windows NT internal structures and CPU control registers based on build `10.0.19045.2965`.

---

## Local Setup

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Installation

```bash
git clone https://github.com/Grovvik/nt-docs.git
cd nt-docs
npm install
npm run docs:dev
```

The development server will be available at `http://localhost:5173`.

---

## Available Scripts

- `npm run docs:dev` - Start local development server with HMR.
- `npm run docs:build` - Build production static bundle to `docs/.vitepress/dist`.
- `npm run docs:preview` - Locally preview the production build.

---

## Tech Stack

- **Documentation Engine**: [VitePress](https://vitepress.dev/) 1.6+
- **UI & Components**: [Vue 3](https://vuejs.org/) + TypeScript
- **Diagrams**: [Mermaid.js](https://mermaid.js.org/)
- **Icons**: [Lucide Vue Next](https://lucide.dev/)

---

## License

Created for educational and reverse-engineering research purposes.  
Windows is a registered trademark of Microsoft Corporation.
