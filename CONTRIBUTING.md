# Contributing to Zero

Thank you for your interest in contributing to Zero. This document explains how to get involved.

---

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/your-username/zero.git
   cd zero
   ```
3. **Install** dependencies:
   ```bash
   npm install
   ```
4. **Create a branch** for your change:
   ```bash
   git checkout -b feat/your-feature-name
   ```
5. Make your changes, commit, and **open a Pull Request** against `main`

---

## Code Style

- **TypeScript strict mode** is enabled. All new code must be fully typed — avoid `any`.
- **No native packages** (e.g. packages requiring node-gyp). Zero must install cleanly on Windows without build tools for development.
- Follow existing file and folder conventions. Components go in `src/components/`, IPC handlers in `src/main/`, and utilities in `src/lib/`.
- Run the linter before pushing:
  ```bash
  npm run lint
  ```
- Format with Prettier (runs automatically on commit via the pre-commit hook).

---

## Writing Plugins

If your contribution is a plugin rather than a core change, you do not need to modify the main repository. Plugins are standalone `.js` files. See [docs/PLUGIN_DEVELOPMENT.md](docs/PLUGIN_DEVELOPMENT.md) for the full API and examples.

To submit a plugin for inclusion in the official plugin registry, open a PR adding it to `plugins/community/` with a short README describing what it does.

---

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Describe what the PR does and why in the PR description
- Reference any related issues with `Closes #123`
- Ensure `npm run build:win` succeeds before submitting
- Add or update tests if your change affects business logic

---

## Issue Templates

When opening issues, use the templates provided:

- **Bug report** — for reproducible defects
- **Feature request** — for new functionality proposals

Templates are in `.github/ISSUE_TEMPLATE/`.

---

## Questions

Open a Discussion on GitHub rather than an issue if you have a general question or need help setting up the project.
