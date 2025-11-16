# Traycer PoC

Proof of Concept for Traycer - A VS Code extension that wraps GitHub Spec-Kit workflow with AI-powered task execution.

## What It Does

- **Workflow Steps Panel**: Initialize → Constitution → Specification → Plan → Tasks → Implementation
- **Task Management**: Tree view of tasks with inline implement/verify buttons
- **Zero Dependencies**: All spec-kit files bundled (no external installations)
- **AI Integration**: Works with GitHub Copilot Chat

## Quick Start

1. **Initialize**: Click "Traycer" icon in VS Code sidebar → Click ▶️ on "0. Initialize Spec-Kit"
   - Creates `.github/`, `.specify/`, `.vscode/` folders
   - Includes default constitution (code quality, testing, UX, performance principles)

2. **Constitution** (Optional - skip if default is fine)
   - To customize: Click ▶️ on "1. Constitution"
   - Input box appears → Enter:
     ```
     Create principles focused on code quality, testing standards, user experience consistency, and performance requirements
     ```
   - Command copied to clipboard → Click "Open Copilot Chat" → Paste (Ctrl+V)

3. **Specification**: Click ▶️ on "2. Specification"
   - Input box appears → Enter:
     ```
     Build an application that can help me organize my photos in separate photo albums. Albums are grouped by date and can be re-organized by dragging and dropping on the main page.
     ```
   - Command copied to clipboard → Click "Open Copilot Chat" → Paste (Ctrl+V)

4. **Implementation Plan**: Click ▶️ on "3. Implementation Plan"
   - Input box appears → Enter:
     ```
     The application uses Vite with minimal number of libraries. Use vanilla HTML, CSS, and JavaScript as much as possible.
     ```
   - Command copied to clipboard → Click "Open Copilot Chat" → Paste (Ctrl+V)

5. **Task Breakdown**: Click ▶️ on "4. Task Breakdown"
   - Command copied to clipboard → Click "Open Copilot Chat" → Paste (Ctrl+V)

6. **Execute**: Click ▶️ on "5. Implementation" (or the ▶️ Run All button in Implementation Tasks header)
   - Command copied to clipboard → Click "Open Copilot Chat" → Paste (Ctrl+V)

## Package & Install

### Install VSCE (one-time)
```powershell
npm install -g @vscode/vsce
```

### Package & Install Extension
```powershell
vsce package
code --install-extension traycer-poc-1.0.0.vsix --force
```

## Requirements

- VS Code 1.85.0+
- GitHub Copilot (optional but recommended)
