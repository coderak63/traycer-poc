const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

/**
 * Copy setup files from extension to workspace
 * @param {string} extensionPath - Path to extension directory
 * @param {string} workspacePath - Path to workspace directory
 */
async function copySetupFiles(extensionPath, workspacePath) {
    const setupSource = path.join(extensionPath, 'setup');
    
    if (!fs.existsSync(setupSource)) {
        throw new Error('Setup files not found in extension directory');
    }

    // Directories to copy
    const directories = ['.github', '.specify', '.vscode'];
    let copiedFiles = 0;

    for (const dir of directories) {
        const sourcePath = path.join(setupSource, dir);
        const destPath = path.join(workspacePath, dir);

        if (!fs.existsSync(sourcePath)) {
            continue;
        }

        // Special handling for .vscode/settings.json (merge)
        if (dir === '.vscode') {
            await copyVSCodeSettings(sourcePath, destPath);
            copiedFiles++;
        } else {
            // Copy entire directory recursively
            await copyDirectoryRecursive(sourcePath, destPath);
            copiedFiles++;
        }
    }

    return copiedFiles;
}

/**
 * Copy directory recursively
 * @param {string} source - Source directory path
 * @param {string} dest - Destination directory path
 */
async function copyDirectoryRecursive(source, dest) {
    // Create destination directory if it doesn't exist
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(source, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(source, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            await copyDirectoryRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

/**
 * Copy and merge VS Code settings
 * @param {string} sourcePath - Source .vscode directory
 * @param {string} destPath - Destination .vscode directory
 */
async function copyVSCodeSettings(sourcePath, destPath) {
    const settingsFile = 'settings.json';
    const sourceSettings = path.join(sourcePath, settingsFile);
    const destSettings = path.join(destPath, settingsFile);

    if (!fs.existsSync(sourceSettings)) {
        return;
    }

    // Create .vscode directory if it doesn't exist
    if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
    }

    // Read source settings
    const sourceContent = fs.readFileSync(sourceSettings, 'utf8');
    
    // Parse source settings (strip comments if any)
    let sourceJson;
    try {
        sourceJson = JSON.parse(sourceContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, ''));
    } catch (err) {
        // If parsing fails, just copy as-is
        fs.copyFileSync(sourceSettings, destSettings);
        return;
    }

    // If destination exists, merge settings
    if (fs.existsSync(destSettings)) {
        try {
            const destContent = fs.readFileSync(destSettings, 'utf8');
            const destJson = JSON.parse(destContent);
            
            // Merge settings (source takes precedence for Spec-Kit settings)
            const merged = { ...destJson, ...sourceJson };
            
            fs.writeFileSync(destSettings, JSON.stringify(merged, null, 4));
        } catch (err) {
            // If merge fails, skip settings.json
            vscode.window.showWarningMessage(
                'Could not merge .vscode/settings.json. Manual merge may be required.'
            );
        }
    } else {
        // No existing settings, just copy
        fs.copyFileSync(sourceSettings, destSettings);
    }
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Spec Task Viewer is now active');

    const taskProvider = new SpecTaskProvider();
    const workflowProvider = new SpecWorkflowProvider();
    
    vscode.window.registerTreeDataProvider('specTaskView', taskProvider);
    vscode.window.registerTreeDataProvider('specWorkflowView', workflowProvider);

    context.subscriptions.push(
        vscode.commands.registerCommand('specTaskViewer.refresh', () => {
            taskProvider.refresh();
            workflowProvider.refresh();
        }),
        
        vscode.commands.registerCommand('specTaskViewer.runAll', async () => {
            await runAllTasks();
        }),
        
        vscode.commands.registerCommand('specTaskViewer.implement', async (taskItem) => {
            await implementTask(taskItem);
        }),
        
        vscode.commands.registerCommand('specTaskViewer.verify', async (taskItem) => {
            await verifyTask(taskItem);
        }),
        
        vscode.commands.registerCommand('specTaskViewer.implementPhase', async (phaseItem) => {
            await implementPhase(phaseItem);
        }),
        
        vscode.commands.registerCommand('specTaskViewer.verifyPhase', async (phaseItem) => {
            await verifyPhase(phaseItem);
        }),
        
        vscode.commands.registerCommand('specWorkflow.runStep', async (stepItem) => {
            await runWorkflowStep(stepItem);
        }),
        
        vscode.commands.registerCommand('specWorkflow.viewOutput', async (stepItem) => {
            await viewWorkflowOutput(stepItem);
        })
    );
}

// ========== WORKFLOW PROVIDER ==========

class SpecWorkflowProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element) {
        return element;
    }

    async getChildren(element) {
        if (!element) {
            return this.getWorkflowSteps();
        }
        return [];
    }

    async getWorkflowSteps() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return [];
        }

        const steps = [
            {
                id: 'init',
                label: '0. Initialize Spec-Kit',
                description: 'Copy setup files to workspace',
                command: 'copySetupFiles',
                outputFile: '.specify/',
                icon: 'rocket',
                needsInput: false
            },
            {
                id: 'constitution',
                label: '1. Constitution',
                description: 'Project principles',
                command: '/speckit.constitution',
                outputFile: '.specify/memory/constitution.md',
                icon: 'book',
                needsInput: true,
                inputPrompt: 'Describe project principles (optional - press Enter to skip)'
            },
            {
                id: 'specify',
                label: '2. Specification',
                description: 'User stories & requirements',
                command: '/speckit.specify',
                outputFile: 'specs/[feature]/spec.md',
                icon: 'list-unordered',
                needsInput: true,
                inputPrompt: 'Describe what to build (optional - press Enter to skip)'
            },
            {
                id: 'plan',
                label: '3. Implementation Plan',
                description: 'Technical approach',
                command: '/speckit.plan',
                outputFile: 'specs/[feature]/plan.md',
                icon: 'project',
                needsInput: true,
                inputPrompt: 'Describe tech stack & architecture (optional - press Enter to skip)'
            },
            {
                id: 'tasks',
                label: '4. Task Breakdown',
                description: 'Actionable tasks',
                command: '/speckit.tasks',
                outputFile: 'specs/[feature]/tasks.md',
                icon: 'tasklist',
                needsInput: false
            },
            {
                id: 'implement',
                label: '5. Implementation',
                description: 'Execute tasks',
                command: '/speckit.implement',
                outputFile: 'Implementation files',
                icon: 'rocket',
                needsInput: false
            }
        ];

        const items = [];
        for (const step of steps) {
            const status = await this.checkStepStatus(step, workspaceFolder);
            const item = new WorkflowStepItem(step, status);
            items.push(item);
        }

        return items;
    }

    async checkStepStatus(step, workspaceFolder) {
        const fs = require('fs');
        const path = require('path');

        // Check if output file exists
        if (step.id === 'init') {
            const specifyPath = path.join(workspaceFolder.uri.fsPath, '.specify');
            return fs.existsSync(specifyPath) ? 'complete' : 'pending';
        } else if (step.id === 'constitution') {
            const filePath = path.join(workspaceFolder.uri.fsPath, step.outputFile);
            return fs.existsSync(filePath) ? 'complete' : 'pending';
        } else {
            // Check if any feature directory exists
            const specsPath = path.join(workspaceFolder.uri.fsPath, 'specs');
            if (!fs.existsSync(specsPath)) {
                return 'pending';
            }
            
            const features = fs.readdirSync(specsPath);
            for (const feature of features) {
                const fileName = step.outputFile.replace('[feature]', feature).split('/').pop();
                const filePath = path.join(specsPath, feature, fileName);
                if (fs.existsSync(filePath)) {
                    return 'complete';
                }
            }
            return 'pending';
        }
    }
}

class WorkflowStepItem extends vscode.TreeItem {
    constructor(step, status) {
        const label = status === 'complete' ? `✅ ${step.label}` : `⏳ ${step.label}`;
        super(label, vscode.TreeItemCollapsibleState.None);
        
        this.step = step;
        this.status = status;
        this.description = step.description;
        this.tooltip = `${step.label}\n${step.description}\nOutput: ${step.outputFile}`;
        this.contextValue = 'workflowStep';
        this.iconPath = new vscode.ThemeIcon(step.icon);
    }
}

async function runWorkflowStep(stepItem) {
    const step = stepItem.step;
    
    let userInput = '';
    if (step.needsInput && step.id !== 'init') {
        // Get user input for steps that need it
        let placeholder = '';
        let promptText = step.inputPrompt;
        
        if (step.id === 'constitution') {
            placeholder = 'Create principles focused on code quality, testing standards...';
        } else if (step.id === 'specify') {
            placeholder = 'Build an application that can help me organize my photos...';
        } else if (step.id === 'plan') {
            placeholder = 'The application uses Vite with minimal number of libraries...';
        } else if (step.id === 'tasks') {
            placeholder = 'specs/001-calculator';
        } else if (step.id === 'implement') {
            placeholder = 'specs/001-calculator';
        }
        
        userInput = await vscode.window.showInputBox({
            prompt: promptText,
            placeHolder: placeholder,
            value: (step.id === 'tasks' || step.id === 'implement') ? 'specs/001-calculator' : ''
        });
        
        if (userInput === undefined) {
            return; // User cancelled
        }
    }
    
    // Handle step execution
    if (step.id === 'init') {
        // Check if already initialized
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open. Please open a folder first.');
            return;
        }

        const specifyPath = path.join(workspaceFolder.uri.fsPath, '.specify');
        
        if (fs.existsSync(specifyPath)) {
            const choice = await vscode.window.showInformationMessage(
                'Spec-Kit already initialized! .specify/ folder exists.',
                'Open .specify/', 'Reinitialize', 'Cancel'
            );
            
            if (choice === 'Open .specify/') {
                await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(specifyPath));
                return;
            } else if (choice === 'Reinitialize') {
                // Continue to reinitialize
            } else {
                return;
            }
        }
        
        // Copy setup files from extension to workspace
        try {
            vscode.window.showInformationMessage('Initializing Spec-Kit...');
            
            // Get extension path - works in both development and production
            const extensionPath = __dirname;
            
            const copiedCount = await copySetupFiles(extensionPath, workspaceFolder.uri.fsPath);
            
            vscode.window.showInformationMessage(
                `✅ Spec-Kit initialized successfully!\n\n` +
                `Created:\n` +
                `  • .github/ (agents & prompts)\n` +
                `  • .specify/ (templates & scripts)\n` +
                `  • .vscode/settings.json (merged)\n\n` +
                `Next: Run Step 1 - Constitution`
            );
            
            // Open .specify folder to show user
            setTimeout(async () => {
                await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(specifyPath));
            }, 1000);
            
        } catch (err) {
            vscode.window.showErrorMessage(
                `Failed to initialize Spec-Kit: ${err.message}\n\n` +
                `Please check that the extension has the setup/ folder.`
            );
        }
        
        return;
    }
    
    // For other steps, prepare the command to copy
    let command = '';
    let fullPrompt = '';
    
    if (step.id === 'constitution') {
        command = '/speckit.constitution';
        fullPrompt = userInput ? `${command} ${userInput}` : command;
    } else if (step.id === 'specify') {
        command = '/speckit.specify';
        fullPrompt = userInput ? `${command} ${userInput}` : command;
    } else if (step.id === 'plan') {
        command = '/speckit.plan';
        fullPrompt = userInput ? `${command} ${userInput}` : command;
    } else if (step.id === 'tasks') {
        command = '/speckit.tasks';
        fullPrompt = command; // tasks doesn't need additional input in the command
    } else if (step.id === 'implement') {
        command = '/speckit.implement';
        fullPrompt = command; // implement doesn't need additional input in the command
    }
    
    // Copy to clipboard
    await vscode.env.clipboard.writeText(fullPrompt);
    
    // Show notification with button to open Copilot Chat
    const choice = await vscode.window.showInformationMessage(
        `📋 Copied to clipboard: ${fullPrompt}\n\nPaste this in GitHub Copilot Chat to run the workflow step.`,
        'Open Copilot Chat',
        'Done'
    );
    
    if (choice === 'Open Copilot Chat') {
        try {
            // Open Copilot Chat panel
            await vscode.commands.executeCommand('workbench.action.chat.open');
        } catch (err) {
            vscode.window.showErrorMessage('GitHub Copilot not available. Make sure GitHub Copilot Chat is installed.');
        }
    }
}

async function viewWorkflowOutput(stepItem) {
    const step = stepItem.step;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return;
    }

    const fs = require('fs');
    const path = require('path');
    
    // Find output file
    if (step.id === 'init') {
        const specifyPath = path.join(workspaceFolder.uri.fsPath, '.specify');
        if (fs.existsSync(specifyPath)) {
            await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(specifyPath));
            vscode.window.showInformationMessage('Spec-Kit initialized! Check .specify/ folder');
        } else {
            vscode.window.showWarningMessage('.specify/ directory not found. Run initialization first.');
        }
    } else if (step.id === 'constitution') {
        const filePath = path.join(workspaceFolder.uri.fsPath, step.outputFile);
        if (fs.existsSync(filePath)) {
            await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
        } else {
            vscode.window.showWarningMessage(`File not found: ${step.outputFile}\nRun this step first.`);
        }
    } else {
        // List available features
        const specsPath = path.join(workspaceFolder.uri.fsPath, 'specs');
        if (!fs.existsSync(specsPath)) {
            vscode.window.showWarningMessage('No specs/ directory found. Run Step 2 first.');
            return;
        }
        
        const features = fs.readdirSync(specsPath);
        if (features.length === 0) {
            vscode.window.showWarningMessage('No features found. Run Step 2 first.');
            return;
        }
        
        // Let user pick feature
        const feature = await vscode.window.showQuickPick(features, {
            placeHolder: 'Select feature to view'
        });
        
        if (!feature) {
            return;
        }
        
        const fileName = step.outputFile.replace('[feature]', feature).split('/').pop();
        const filePath = path.join(specsPath, feature, fileName);
        
        if (fs.existsSync(filePath)) {
            await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
        } else {
            vscode.window.showWarningMessage(`File not found: ${fileName}\nRun ${step.label} for this feature first.`);
        }
    }
}

class SpecTaskProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element) {
        return element;
    }

    async getChildren(element) {
        if (!element) {
            // Root level - find tasks.md files
            return this.findTasksFiles();
        } else if (element.type === 'phase') {
            // Return tasks for this phase
            return element.tasks || [];
        }
        return [];
    }

    async findTasksFiles() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return [];
        }

        const specsPath = path.join(workspaceFolder.uri.fsPath, 'specs');
        if (!fs.existsSync(specsPath)) {
            return [new TaskItem('No specs/ folder found', '', 'info', vscode.TreeItemCollapsibleState.None)];
        }

        // Find all tasks.md files
        const phases = [];
        const features = fs.readdirSync(specsPath);
        
        for (const feature of features) {
            const tasksPath = path.join(specsPath, feature, 'tasks.md');
            if (fs.existsSync(tasksPath)) {
                const phasesFromFile = await this.parseTasksFile(tasksPath);
                phases.push(...phasesFromFile);
            }
        }

        return phases.length > 0 ? phases : [new TaskItem('No tasks found', '', 'info', vscode.TreeItemCollapsibleState.None)];
    }

    async parseTasksFile(filePath) {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        const phases = [];
        let currentPhase = null;
        let currentTasks = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Detect phase headers: "## Phase X: Name"
            const phaseMatch = line.match(/^## (Phase \d+): (.+)/);
            if (phaseMatch) {
                // Save previous phase if exists
                if (currentPhase) {
                    currentPhase.tasks = currentTasks;
                    phases.push(currentPhase);
                }
                
                const phaseName = `${phaseMatch[1]}: ${phaseMatch[2]}`;
                currentPhase = new TaskItem(
                    phaseName,
                    filePath,
                    'phase',
                    vscode.TreeItemCollapsibleState.Collapsed
                );
                currentTasks = [];
                continue;
            }

            // Detect tasks: "- [ ] T001 Description" or "- [x] T001 Description"
            const taskMatch = line.match(/^- \[([ xX])\] (T\d+)(.+)/);
            if (taskMatch && currentPhase) {
                const isCompleted = taskMatch[1].toLowerCase() === 'x';
                const taskId = taskMatch[2];
                const description = taskMatch[3].trim();
                
                // Extract [P] and [Story] markers
                const hasParallel = description.includes('[P]');
                const storyMatch = description.match(/\[US\d+\]/);
                const story = storyMatch ? storyMatch[0] : '';
                
                // Clean description
                let cleanDesc = description
                    .replace(/\[P\]/g, '')
                    .replace(/\[US\d+\]/g, '')
                    .trim();
                
                // Truncate long descriptions
                if (cleanDesc.length > 80) {
                    cleanDesc = cleanDesc.substring(0, 77) + '...';
                }

                const label = `${taskId} ${story} ${cleanDesc}`.trim();
                const icon = isCompleted ? '✓' : (hasParallel ? '⚡' : '○');
                
                const taskItem = new TaskItem(
                    `${icon} ${label}`,
                    filePath,
                    'task',
                    vscode.TreeItemCollapsibleState.None,
                    {
                        taskId,
                        description: cleanDesc,
                        isCompleted,
                        hasParallel,
                        story,
                        lineNumber: i
                    }
                );
                
                currentTasks.push(taskItem);
            }
        }

        // Add last phase
        if (currentPhase) {
            currentPhase.tasks = currentTasks;
            phases.push(currentPhase);
        }

        return phases;
    }
}

class TaskItem extends vscode.TreeItem {
    constructor(label, filePath, type, collapsibleState, taskData = null) {
        super(label, collapsibleState);
        this.type = type;
        this.filePath = filePath;
        this.taskData = taskData;
        this.contextValue = type;

        if (type === 'task' && taskData) {
            this.tooltip = taskData.description;
            this.description = taskData.isCompleted ? '(completed)' : '';
            
            // Add command to open file at task line
            this.command = {
                command: 'vscode.open',
                title: 'Open Task',
                arguments: [
                    vscode.Uri.file(filePath),
                    { selection: new vscode.Range(taskData.lineNumber, 0, taskData.lineNumber, 0) }
                ]
            };
        } else if (type === 'phase') {
            this.iconPath = new vscode.ThemeIcon('folder');
        }
    }
}

async function implementTask(taskItem) {
    if (!taskItem.taskData) return;

    const action = await vscode.window.showQuickPick(
        [
            { label: '$(github-action) Ask GitHub Copilot', value: 'copilot' },
            { label: '$(file-code) Open in Editor', value: 'open' },
            { label: '$(terminal) Show in Terminal Context', value: 'terminal' }
        ],
        { placeHolder: `Implement ${taskItem.taskData.taskId}: ${taskItem.taskData.description}` }
    );

    if (!action) return;

    if (action.value === 'copilot') {
        // Use Copilot Chat API
        const prompt = `Implement this task from tasks.md:

Task ID: ${taskItem.taskData.taskId}
Description: ${taskItem.taskData.description}
Story: ${taskItem.taskData.story}
File: ${taskItem.filePath}

Please implement this task following the specification. Create or modify the necessary files.`;

        try {
            // Open Copilot Chat with the prompt
            await vscode.commands.executeCommand('workbench.action.chat.open', {
                query: prompt
            });
        } catch (err) {
            vscode.window.showErrorMessage('GitHub Copilot not available. Opening file instead.');
            await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(taskItem.filePath));
        }
    } else if (action.value === 'open') {
        await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(taskItem.filePath), {
            selection: new vscode.Range(taskItem.taskData.lineNumber, 0, taskItem.taskData.lineNumber, 0)
        });
    } else if (action.value === 'terminal') {
        const terminal = vscode.window.createTerminal('Spec Task');
        terminal.show();
        terminal.sendText(`# Task: ${taskItem.taskData.taskId}`);
        terminal.sendText(`# ${taskItem.taskData.description}`);
    }
}

async function verifyTask(taskItem) {
    if (!taskItem.taskData) return;

    const prompt = `Verify this task implementation from tasks.md:

Task ID: ${taskItem.taskData.taskId}
Description: ${taskItem.taskData.description}
Story: ${taskItem.taskData.story}

Please check:
1. Are the required files created/modified?
2. Does the implementation match the task description?
3. Are there any issues or improvements needed?
4. Should this task be marked as complete [x]?

Provide a verification report.`;

    try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
            query: prompt
        });
    } catch (err) {
        vscode.window.showInformationMessage(`Verify ${taskItem.taskData.taskId}: Check implementation manually`);
    }
}

async function implementPhase(phaseItem) {
    const tasks = phaseItem.tasks || [];
    const incompleteTasks = tasks.filter(t => t.taskData && !t.taskData.isCompleted);

    if (incompleteTasks.length === 0) {
        vscode.window.showInformationMessage('All tasks in this phase are completed!');
        return;
    }

    const confirm = await vscode.window.showWarningMessage(
        `Implement all ${incompleteTasks.length} tasks in ${phaseItem.label}?`,
        'Yes', 'No'
    );

    if (confirm !== 'Yes') return;

    const taskList = incompleteTasks.map(t => 
        `- ${t.taskData.taskId}: ${t.taskData.description}`
    ).join('\n');

    const prompt = `Implement all tasks in this phase:

${phaseItem.label}

Tasks to implement:
${taskList}

Please implement these tasks sequentially, following the specification and creating/modifying necessary files.`;

    try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
            query: prompt
        });
    } catch (err) {
        vscode.window.showErrorMessage('GitHub Copilot not available.');
    }
}

async function verifyPhase(phaseItem) {
    const tasks = phaseItem.tasks || [];
    const completedTasks = tasks.filter(t => t.taskData && t.taskData.isCompleted);
    const incompleteTasks = tasks.filter(t => t.taskData && !t.taskData.isCompleted);

    const taskList = tasks.map(t => {
        const status = t.taskData.isCompleted ? '✓' : '✗';
        return `${status} ${t.taskData.taskId}: ${t.taskData.description}`;
    }).join('\n');

    const prompt = `Verify implementation of this phase:

${phaseItem.label}

Tasks status:
${taskList}

Summary: ${completedTasks.length}/${tasks.length} tasks completed

Please verify:
1. Are all completed tasks properly implemented?
2. Do implementations match the task descriptions?
3. Are there any issues or improvements needed?
4. Should any incomplete tasks be marked as complete?
5. Can we proceed to the next phase?

Provide a detailed verification report.`;

    try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
            query: prompt
        });
    } catch (err) {
        vscode.window.showInformationMessage(
            `Verify ${phaseItem.label}\n\n` +
            `Completed: ${completedTasks.length}/${tasks.length}\n` +
            `Incomplete: ${incompleteTasks.length}`
        );
    }
}

async function runAllTasks() {
    const command = '/speckit.implement';
    
    // Copy to clipboard
    await vscode.env.clipboard.writeText(command);
    
    // Show notification with button to open Copilot Chat
    const choice = await vscode.window.showInformationMessage(
        `📋 Copied to clipboard: ${command}\n\nPaste this in GitHub Copilot Chat to implement all tasks.`,
        'Open Copilot Chat',
        'Done'
    );
    
    if (choice === 'Open Copilot Chat') {
        try {
            // Open Copilot Chat panel
            await vscode.commands.executeCommand('workbench.action.chat.open');
        } catch (err) {
            vscode.window.showErrorMessage('GitHub Copilot not available. Make sure GitHub Copilot Chat is installed.');
        }
    }
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
