import { TaskDefinition, window, commands, Disposable, ExtensionContext, StatusBarAlignment, StatusBarItem, TextDocument, workspace, OutputChannel, ShellExecution, Task, TaskScope, Terminal, FileSystemWatcher, RelativePattern } from 'vscode';
import * as ChildProcess from 'child_process';
import * as Path from 'path';

class TypeScriptCompilerFileWatcher {
    private filename: string;
    private pattern: RelativePattern;
    private watcher: FileSystemWatcher;
    private eventType: string;

    private constructor() {
    }

    public watch(fn: Function) {
        var self = this;

        if (self.filename) self.watcher = workspace.createFileSystemWatcher(self.filename);
        else if (self.pattern) self.watcher = workspace.createFileSystemWatcher(self.pattern);

        self.watcher.onDidCreate(function (event) {
            self.eventType = 'created';
            if (fn) fn({ filename: event.fsPath, eventType: self.eventType });
        });
        self.watcher.onDidChange(function (event) {
            self.eventType = 'changed';
            if (fn) fn({ filename: event.fsPath, eventType: self.eventType });
        });
        self.watcher.onDidDelete(function (event) {
            self.eventType = 'deleted';
            if (fn) fn({ filename: event.fsPath, eventType: self.eventType });
        })
    }

    public dispose() {
        this.watcher.dispose();
    }

    public static fromFile(file: string): TypeScriptCompilerFileWatcher {
        var tfw = new TypeScriptCompilerFileWatcher();
        tfw.filename = Path.normalize(file);

        return tfw;
    }

    public static FromPattern(pattern: RelativePattern): TypeScriptCompilerFileWatcher {
        var tfw = new TypeScriptCompilerFileWatcher();
        tfw.pattern = pattern;

        return tfw;
    }
}

class TypeScriptCompilerStatusChannel {
    private statusItem: StatusBarItem;

    public constructor() {
        if (!this.statusItem) this.statusItem = window.createStatusBarItem(StatusBarAlignment.Right);
    }

    public updateStatus(shortText: string, longTooltip: string, color: string) {
        this.statusItem.tooltip = longTooltip;
        this.statusItem.text = shortText;
        this.statusItem.color = color;
        this.statusItem.show();
    }

    public dispose() {
        if (this.statusItem) this.statusItem.dispose();
    }
}

class TypeScriptCompiler {

    private watchers: { [id: string]: TypeScriptCompilerFileWatcher } = {};
    private statusChannel: TypeScriptCompilerStatusChannel;
    private output: OutputChannel;
    private tsconfig: string;

    public constructor() {
        var self = this;

        self.statusChannel = new TypeScriptCompilerStatusChannel();
        self.statusChannel.updateStatus('$(zap) TS [...]', 'TypeScript Auto Compiler - warming up...', 'white');

        if (!self.output) self.output = window.createOutputChannel("TypeScript Auto Compiler");

        workspace.findFiles('**/tsconfig.json').then((files) => {
            if (!files || files.length == 0) return;
            self.setTsConfigFile(files[0].fsPath);
        })

        {
            let pattern = new RelativePattern(workspace.workspaceFolders[0], '**/*.ts');
            let watcher = TypeScriptCompilerFileWatcher.FromPattern(pattern);
            watcher.watch(e => {
                if (e.filename) self.compile(e.filename)
            });
            self.watchers[pattern.pattern] = watcher;
        }

        {
            let pattern = new RelativePattern(workspace.workspaceFolders[0], '**/tsconfig.json');
            let watcher = TypeScriptCompilerFileWatcher.FromPattern(pattern);
            watcher.watch(e => {
                if (e.eventType == 'created') self.setTsConfigFile(e.filename);
                else if (e.eventType == 'deleted') self.setTsConfigFile(null);

                if (e.eventType == 'changed') self.compile(e.filename)
            });
            self.watchers[pattern.pattern] = watcher;
        }

        self.statusChannel.updateStatus('$(eye) TS [ON]',
            'TypeScript Auto Compiler is ON - Watching file changes.', 'white');
    }

    public dispose() {
        this.statusChannel.dispose();
        this.output.dispose();

        [].forEach.call(this.watchers, watch => {
            watch.dispose();
        });
    }

    private setTsConfigFile(filename?: string) {
        var msg: string;

        if (filename) {
            this.tsconfig = filename;
            msg = 'Found tsconfig.json file at \'' + this.tsconfig + '\'. File will be used for TypeScript Auto Compile routines.';
        } else {
            this.tsconfig = null;
            msg = 'Previous tsconfig.json file at \'' + this.tsconfig + '\' was removed. Building each \'.ts\' file.';
        }
        window.showInformationMessage(msg, 'Dismiss');
    }

    private compile(fspath: string) {
        var filename = Path.basename(fspath);
        var ext = Path.extname(filename).toLowerCase();
        var self = this;

        if (ext == '.ts' || filename == 'tsconfig.json') {
            self.statusChannel.updateStatus('$(beaker) TS [ON]',
                'TypeScript Auto Compiler is ON - Compiling changes...', 'cyan');

            var status = "Auto compiling file \'" + filename + "\'";
            window.setStatusBarMessage(status, 5000);
            self.output.appendLine(status);

            var command = "tsc " + fspath;

            if (self.tsconfig) {
                command = "tsc -p \"" + self.tsconfig + "\"";
                self.output.appendLine("Using tsconfig.json at \'" + self.tsconfig + "\'");
            }

            ChildProcess.exec(command, { cwd: workspace.rootPath }, (error, stdout, stderr) => {
                self.statusChannel.updateStatus('$(eye) TS [ON]',
                    'TypeScript Auto Compiler is ON - Watching file changes.', 'white');

                if (error) {
                    self.output.show();
                    self.output.appendLine(error.message);
                    self.output.appendLine(stdout.trim().toString());
                    self.output.appendLine('');

                    window.setStatusBarMessage(error.message, 5000);
                } else {
                    var successMsg = 'TypeScript Auto Compilation succedded.';

                    window.setStatusBarMessage(successMsg, 5000);
                    self.output.appendLine(successMsg);
                    self.output.appendLine('');
                }
            });
        }
    }
}

export { TypeScriptCompiler };