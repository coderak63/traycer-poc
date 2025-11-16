import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface WorkflowStep {
    id: string;
    label: string;
    description: string;
    command: string;
    outputFile: string;
    icon: string;
    needsInput: boolean;
    inputPrompt?: string;
}

interface TaskData {
    taskId: string;
    description: string;
    isCompleted: boolean;
    hasParallel: boolean;
    story: string;
    lineNumber: number;
}

/**
 * Copy setup files from extension to workspace
 */
async function copySetupFiles(extensionPath: string, workspacePath: string): Promise<number> {
    const setupSource = path.join(extensionPath, 'setup');
    
    if (!fs.existsSync(setupSource)) {
        throw new Error('Setup files not found in extension directory');
    }

    const directories = ['.github', '.specify', '.vscode'];
    let copiedFiles = 0;

    for (const dir of directories) {
        const sourcePath = path.join(setupSource, dir);
        const destPath = path.join(workspacePath, dir);

        if (!fs.existsSync(sourcePath)) {
            continue;
        }

        if (dir === '.vscode') {
            await copyVSCodeSettings(sourcePath, destPath);
            copiedFiles++;
        } else {
            await copyDirectoryRecursive(sourcePath, destPath);
            copiedFiles++;
        }
    }

    return copiedFiles;
}

/**
 * Copy directory recursively
 */
async function copyDirectoryRecursive(source: string, dest: string): Promise<void> {
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
 */
async function copyVSCodeSettings(sourcePath: string, destPath: string): Promise<void> {
    const settingsFile = 'settings.json';
    const sourceSettings = path.join(sourcePath, settingsFile);
    const destSettings = path.join(destPath, settingsFile);

    if (!fs.existsSync(sourceSettings)) {
        return;
    }

    if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
    }

    const sourceContent = fs.readFileSync(sourceSettings, 'utf8');
    
    let sourceJson: any;
    try {
        sourceJson = JSON.parse(sourceContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, ''));
    } catch (err) {
        fs.copyFileSync(sourceSettings, destSettings);
        return;
    }

    if (fs.existsSync(destSettings)) {
        try {
            const destContent = fs.readFileSync(destSettings, 'utf8');
            const destJson = JSON.parse(destContent);
            
            const merged = { ...destJson, ...sourceJson };
            
            fs.writeFileSync(destSettings, JSON.stringify(merged, null, 4));
        } catch (err) {
            vscode.window.showWarningMessage(
                'Could not merge .vscode/settings.json. Manual merge may be required.'
            );
        }
    } else {
        fs.copyFileSync(sourceSettings, destSettings);
    }
}

export function activate(context: vscode.ExtensionContext): void {
    console.log('Traycer PoC is now active');

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
        
        vscode.commands.registerCommand('specTaskViewer.implement', async (taskItem: TaskItem) => {
            await implementTask(taskItem);
        }),
        
        vscode.commands.registerCommand('specTaskViewer.verify', async (taskItem: TaskItem) => {
            await verifyTask(taskItem);
        }),
        
        vscode.commands.registerCommand('specTaskViewer.implementPhase', async (phaseItem: TaskItem) => {
            await implementPhase(phaseItem);
        }),
        
        vscode.commands.registerCommand('specTaskViewer.verifyPhase', async (phaseItem: TaskItem) => {
            await verifyPhase(phaseItem);
        }),
        
        vscode.commands.registerCommand('specWorkflow.runStep', async (stepItem: WorkflowStepItem) => {
            await runWorkflowStep(stepItem);
        }),
        
        vscode.commands.registerCommand('specWorkflow.viewOutput', async (stepItem: WorkflowStepItem) => {
            await viewWorkflowOutput(stepItem);
        })
    );
}

// ========== WORKFLOW PROVIDER ==========

class SpecWorkflowProvider implements vscode.TreeDataProvider<WorkflowStepItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<WorkflowStepItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: WorkflowStepItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: WorkflowStepItem): Promise<WorkflowStepItem[]> {
        if (!element) {
            return this.getWorkflowSteps();
        }
        return [];
    }

    private async getWorkflowSteps(): Promise<WorkflowStepItem[]> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return [];
        }

        const steps: WorkflowStep[] = [
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

        const items: WorkflowStepItem[] = [];
        for (const step of steps) {
            const status = await this.checkStepStatus(step, workspaceFolder);
            const item = new WorkflowStepItem(step, status);
            items.push(item);
        }

        return items;
    }

    private async checkStepStatus(step: WorkflowStep, workspaceFolder: vscode.WorkspaceFolder): Promise<string> {
        if (step.id === 'init') {
            const specifyPath = path.join(workspaceFolder.uri.fsPath, '.specify');
            return fs.existsSync(specifyPath) ? 'complete' : 'pending';
        } else if (step.id === 'constitution') {
            const filePath = path.join(workspaceFolder.uri.fsPath, step.outputFile);
            return fs.existsSync(filePath) ? 'complete' : 'pending';
        } else {
            const specsPath = path.join(workspaceFolder.uri.fsPath, 'specs');
            if (!fs.existsSync(specsPath)) {
                return 'pending';
            }
            
            const features = fs.readdirSync(specsPath);
            for (const feature of features) {
                const fileName = step.outputFile.replace('[feature]', feature).split('/').pop();
                if (fileName) {
                    const filePath = path.join(specsPath, feature, fileName);
                    if (fs.existsSync(filePath)) {
                        return 'complete';
                    }
                }
            }
            return 'pending';
        }
    }
}

class WorkflowStepItem extends vscode.TreeItem {
    constructor(
        public readonly step: WorkflowStep,
        public readonly status: string
    ) {
        const label = status === 'complete' ? `✅ ${step.label}` : `⏳ ${step.label}`;
        super(label, vscode.TreeItemCollapsibleState.None);
        
        this.description = step.description;
        this.tooltip = `${step.label}\n${step.description}\nOutput: ${step.outputFile}`;
        this.contextValue = 'workflowStep';
        this.iconPath = new vscode.ThemeIcon(step.icon);
    }
}

async function runWorkflowStep(stepItem: WorkflowStepItem): Promise<void> {
    const step = stepItem.step;
    
    let userInput = '';
    if (step.needsInput && step.id !== 'init') {
        let placeholder = '';
        
        if (step.id === 'constitution') {
            placeholder = 'Create principles focused on code quality, testing standards...';
        } else if (step.id === 'specify') {
            placeholder = 'Build an application that can help me organize my photos...';
        } else if (step.id === 'plan') {
            placeholder = 'The application uses Vite with minimal number of libraries...';
        }
        
        const input = await vscode.window.showInputBox({
            prompt: step.inputPrompt,
            placeHolder: placeholder,
            value: ''
        });
        
        if (input === undefined) {
            return;
        }
        userInput = input;
    }
    
    if (step.id === 'init') {
        await handleInitStep();
        return;
    }
    
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
        fullPrompt = command;
    } else if (step.id === 'implement') {
        command = '/speckit.implement';
        fullPrompt = command;
    }
    
    await vscode.env.clipboard.writeText(fullPrompt);
    
    const choice = await vscode.window.showInformationMessage(
        `📋 Copied to clipboard: ${fullPrompt}\n\nPaste this in GitHub Copilot Chat to run the workflow step.`,
        'Open Copilot Chat',
        'Done'
    );
    
    if (choice === 'Open Copilot Chat') {
        try {
            await vscode.commands.executeCommand('workbench.action.chat.open');
        } catch (err) {
            vscode.window.showErrorMessage('GitHub Copilot not available. Make sure GitHub Copilot Chat is installed.');
        }
    }
}

async function handleInitStep(): Promise<void> {
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
        } else if (choice !== 'Reinitialize') {
            return;
        }
    }
    
    try {
        vscode.window.showInformationMessage('Initializing Spec-Kit...');
        
        const extensionPath = __dirname.replace(/[\\/]out$/, '');
        
        await copySetupFiles(extensionPath, workspaceFolder.uri.fsPath);
        
        vscode.window.showInformationMessage(
            `✅ Spec-Kit initialized successfully!\n\n` +
            `Created:\n` +
            `  • .github/ (agents & prompts)\n` +
            `  • .specify/ (templates & scripts)\n` +
            `  • .vscode/settings.json (merged)\n\n` +
            `Next: Run Step 1 - Constitution`
        );
        
        setTimeout(async () => {
            await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(specifyPath));
        }, 1000);
        
    } catch (err: any) {
        vscode.window.showErrorMessage(
            `Failed to initialize Spec-Kit: ${err.message}\n\n` +
            `Please check that the extension has the setup/ folder.`
        );
    }
}

async function viewWorkflowOutput(stepItem: WorkflowStepItem): Promise<void> {
    const step = stepItem.step;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return;
    }
    
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
        
        const feature = await vscode.window.showQuickPick(features, {
            placeHolder: 'Select feature to view'
        });
        
        if (!feature) {
            return;
        }
        
        const fileName = step.outputFile.replace('[feature]', feature).split('/').pop();
        if (fileName) {
            const filePath = path.join(specsPath, feature, fileName);
            
            if (fs.existsSync(filePath)) {
                await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
            } else {
                vscode.window.showWarningMessage(`File not found: ${fileName}\nRun ${step.label} for this feature first.`);
            }
        }
    }
}

// ========== TASK PROVIDER ==========

class SpecTaskProvider implements vscode.TreeDataProvider<TaskItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TaskItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TaskItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TaskItem): Promise<TaskItem[]> {
        if (!element) {
            return this.findTasksFiles();
        } else if (element.type === 'phase') {
            return element.tasks || [];
        }
        return [];
    }

    private async findTasksFiles(): Promise<TaskItem[]> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return [];
        }

        const specsPath = path.join(workspaceFolder.uri.fsPath, 'specs');
        if (!fs.existsSync(specsPath)) {
            return [new TaskItem('No specs/ folder found', '', 'info', vscode.TreeItemCollapsibleState.None)];
        }

        const phases: TaskItem[] = [];
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

    private async parseTasksFile(filePath: string): Promise<TaskItem[]> {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        const phases: TaskItem[] = [];
        let currentPhase: TaskItem | null = null;
        let currentTasks: TaskItem[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            const phaseMatch = line.match(/^## (Phase \d+): (.+)/);
            if (phaseMatch) {
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

            const taskMatch = line.match(/^- \[([ xX])\] (T\d+)(.+)/);
            if (taskMatch && currentPhase) {
                const isCompleted = taskMatch[1].toLowerCase() === 'x';
                const taskId = taskMatch[2];
                const description = taskMatch[3].trim();
                
                const hasParallel = description.includes('[P]');
                const storyMatch = description.match(/\[US\d+\]/);
                const story = storyMatch ? storyMatch[0] : '';
                
                let cleanDesc = description
                    .replace(/\[P\]/g, '')
                    .replace(/\[US\d+\]/g, '')
                    .trim();
                
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

        if (currentPhase) {
            currentPhase.tasks = currentTasks;
            phases.push(currentPhase);
        }

        return phases;
    }
}

class TaskItem extends vscode.TreeItem {
    public tasks?: TaskItem[];

    constructor(
        label: string,
        public readonly filePath: string,
        public readonly type: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly taskData: TaskData | null = null
    ) {
        super(label, collapsibleState);
        this.contextValue = type;

        if (type === 'task' && taskData) {
            this.tooltip = taskData.description;
            this.description = taskData.isCompleted ? '(completed)' : '';
            
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

async function implementTask(taskItem: TaskItem): Promise<void> {
    if (!taskItem.taskData) {return;}

    const action = await vscode.window.showQuickPick(
        [
            { label: '$(github-action) Ask GitHub Copilot', value: 'copilot' },
            { label: '$(file-code) Open in Editor', value: 'open' },
            { label: '$(terminal) Show in Terminal Context', value: 'terminal' }
        ],
        { placeHolder: `Implement ${taskItem.taskData.taskId}: ${taskItem.taskData.description}` }
    );

    if (!action) {return;}

    if (action.value === 'copilot') {
        const prompt = `Implement this task from tasks.md:

Task ID: ${taskItem.taskData.taskId}
Description: ${taskItem.taskData.description}
Story: ${taskItem.taskData.story}
File: ${taskItem.filePath}

Please implement this task following the specification. Create or modify the necessary files.`;

        try {
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

async function verifyTask(taskItem: TaskItem): Promise<void> {
    if (!taskItem.taskData) {return;}

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

async function implementPhase(phaseItem: TaskItem): Promise<void> {
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

    if (confirm !== 'Yes') {return;}

    const taskList = incompleteTasks.map(t => 
        `- ${t.taskData!.taskId}: ${t.taskData!.description}`
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

async function verifyPhase(phaseItem: TaskItem): Promise<void> {
    const tasks = phaseItem.tasks || [];
    const completedTasks = tasks.filter(t => t.taskData && t.taskData.isCompleted);
    const incompleteTasks = tasks.filter(t => t.taskData && !t.taskData.isCompleted);

    const taskList = tasks.map(t => {
        const status = t.taskData!.isCompleted ? '✓' : '✗';
        return `${status} ${t.taskData!.taskId}: ${t.taskData!.description}`;
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

async function runAllTasks(): Promise<void> {
    const command = '/speckit.implement';
    
    await vscode.env.clipboard.writeText(command);
    
    const choice = await vscode.window.showInformationMessage(
        `📋 Copied to clipboard: ${command}\n\nPaste this in GitHub Copilot Chat to implement all tasks.`,
        'Open Copilot Chat',
        'Done'
    );
    
    if (choice === 'Open Copilot Chat') {
        try {
            await vscode.commands.executeCommand('workbench.action.chat.open');
        } catch (err) {
            vscode.window.showErrorMessage('GitHub Copilot not available. Make sure GitHub Copilot Chat is installed.');
        }
    }
}

export function deactivate(): void {}
