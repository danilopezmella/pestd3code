import * as vscode from "vscode";
import * as fs from "fs";
import { parse } from "csv-parse/sync";
import * as path from "path";
import { exec } from "child_process";
import * as os from "os";
import { spawn } from "child_process";
import { parsePestchekOutput } from './pestchek/PestchekDiagnostics';
import { promisify } from "util";


// #region Type definitions

// Constantes globales
const SESSION_MAX_SUPPRESSIBLE_SUGGESTIONS = 1;

type DescriptionData = {
    controlid: string;
    itemid: string;
    Parent: string;
    Variable: string;
    Type: string;
    Values: string;
    Description: string;
    Line: string;
    Position: string;
    Mandatory: string;
};

interface FileWarningState {
    suppressWarnings: boolean;
    warningCount: number;
}

let disposables: vscode.Disposable[] = [];

let descriptions: DescriptionData[] = [];

type VariableWithAllowedValues = {
    name: string;
    type: string;
    required: boolean;
    allowedValues: string[]; // Solo las variables con valores permitidos
};

type VariableWithoutAllowedValues = {
    name: string;
    type: string;
    required: boolean;
};

type Variable = VariableWithAllowedValues | VariableWithoutAllowedValues;

// We only expect "integer" or "float" on line 3. 
// (If you need "string", add it.)
// Expand the union
type VarTypeLine3 = "string" | "integer" | "float";

// An interface specific to line 3 variables:
export interface VariableLine3Def {
    name: string;
    required: boolean;
    type: VarTypeLine3; // must be either "integer" or "float"
    minValue?: number;  // optional minimum value constraint
    description?: string; // optional description
}

// #endregion Type definitions

// #region Load descriptions from CSV file
async function loadDescriptions(
    context: vscode.ExtensionContext
): Promise<void> {
    const resourcePath = vscode.Uri.joinPath(
        context.extensionUri,
        "resources",
        "descriptions.csv"
    );
    const csvContent = await fs.promises.readFile(resourcePath.fsPath, "utf-8");
    const records = parse(csvContent, {
        columns: true, // Usa la primera fila como encabezados
        skip_empty_lines: true, // Ignorar líneas vacías
        trim: true, // Elimina espacios al inicio y al final
        relax_column_count: true, // Relaja el conteo de columnas por fila
    });
    descriptions = records as DescriptionData[];
}

// #endregion Load descriptions from CSV file

// #region Define the structure of the PEST control file
const controlDataStructure: Variable[][] = [
    [
        { name: "NPAR", type: "integer", required: true },
        { name: "NOBS", type: "integer", required: true },
        { name: "NPARGP", type: "integer", required: true },
        { name: "NPRIOR", type: "integer", required: true },
        { name: "NOBSGP", type: "integer", required: true },
        { name: "MAXCOMPDIM", type: "integer", required: false },
        { name: "DERZEROLIM", type: "float", required: false },
    ],
    [
        { name: "NTPLFLE", type: "integer", required: true },
        { name: "NINSFLE", type: "integer", required: true },
        { name: "NUMCOM", type: "integer", required: false, },
        { name: "JACFILE", type: "integer", required: false },
        { name: "MESSFILE", type: "integer", required: false },
    ],
    [
        { name: "RLAMBDA1", type: "float", required: true },
        { name: "RLAMFAC", type: "float", required: true },
        { name: "PHIRATSUF", type: "float", required: true },
        { name: "PHIREDLAM", type: "float", required: true },
        { name: "NUMLAM", type: "float", required: true },
        { name: "JACUPDATE", type: "integer", required: false },
        
    ],
    [
        { name: "RELPARMAX", type: "float", required: true },
        { name: "FACPARMAX", type: "float", required: true },
        { name: "FACORIG", type: "float", required: true },
        { name: "IBOUNDSTICK", type: "integer", required: false },
        { name: "UPVECBEND", type: "integer", required: false, allowedValues: ["0", "1"] },

    ],
    [
        { name: "PHIREDSWH", type: "float", required: true },
        { name: "NOPTSWITCH", type: "integer", required: false },
        { name: "SPLITSWH", type: "float", required: false },
        {
            name: "DOAUI",
            type: "string",
            required: false,
            allowedValues: ["aui", "noaui"],
        },
    ],
    [
        { name: "NOPTMAX", type: "float", required: true },
        { name: "PHIREDSTP", type: "float", required: true },
        { name: "NPHISTP", type: "integer", required: true },
        { name: "NPHINORED", type: "integer", required: true },
        { name: "RELPARSTP", type: "float", required: true },
        { name: "NRELPAR", type: "integer", required: true },
        { name: "PHISTOPTHRESH", type: "float", required: false },
        { name: "LASTRUN", type: "integer", required: false },
        { name: "PHIABANDON", type: "float", required: false }
    ],

    [
        { name: "ICOV", type: "integer", required: true },
        { name: "ICOR", type: "integer", required: true },
        { name: "IEIG", type: "integer", required: true },
        { name: "IRES", type: "integer", required: true },
        {
            name: "JCOSAVE",
            type: "string",
            required: false,
            allowedValues: ["jcosave", "nojcosave"],
        },
        {
            name: "VERBOSEREC",
            type: "string",
            required: false,
            allowedValues: ["verboserec", "noverboserec"],
        },
        {
            name: "JCOSAVEITN",
            type: "string",
            required: false,
            allowedValues: ["jcosaveitn", "nojcosaveitn"],
        },

        {
            name: "PARSAVEITN",
            type: "string",
            required: false,
            allowedValues: ["parsaveitn", "noparsaveitn"],
        },
        {
            name: "PARSAVERUN",
            type: "string",
            required: false,
            allowedValues: ["parsaverun", "noparsaverun"],
        },
    ],
];

// lineStructure for line 3
// GOOD: 'type' is "integer" for numeric fields
// GOOD: 'type' is "integer" for numeric fields

export const controlDataLine2Structure = [
    { name: "RSTFLE", required: true, type: "string", allowedValues: ["restart", "norestart"] },
    { name: "PESTMODE", required: true, type: "string", allowedValues: ["estimation", "prediction", "regularization", "regularisation", "pareto"] }
];

const controlDataLine3Structure = [
    { name: "NPAR",       required: true, type: "integer" },
    { name: "NOBS",       required: true, type: "integer" },
    { name: "NPARGP",     required: true, type: "integer" },
    { name: "NPRIOR",     required: true, type: "integer" },
    { name: "NOBSGP",     required: true, type: "integer" },
    { name: "MAXCOMPDIM", required: false, type: "integer" },
    { name: "DERZEROLIM", required: false, type: "float" }
];

const svdDataStructure = [
    [{ name: "SVDMODE", type: "integer", required: true }],
    [
        {
            name: "MAXSING",
            type: "integer",
            required: true,
        },
        {
            name: "EIGTHRESH",
            type: "float",
            required: true,
        },
    ],
    [{ name: "EIGWRITE", type: "integer", required: true }],
];

const regularizationDataStructure = [
    [
        { name: "PHIMLIM", type: "float", required: true },
        { name: "PHIMACCEPT", type: "float", required: true },
        { name: "FRACPHIM", type: "float", required: false },
    ],
    [
        { name: "WFINIT", type: "float", required: true },
        { name: "WFMIN", type: "float", required: true },
        { name: "WFMAX", type: "float", required: true },
    ],
    [
        { name: "WFFAC", type: "float", required: true },
        { name: "WFTOL", type: "float", required: true },
        { name: "IREGADJ", type: "integer", required: false },
    ],
];

// #endregion Define the structure of the PEST control file

// #region Document Symbol Provider
class PestDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    public provideDocumentSymbols(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.SymbolInformation[]> {
        const symbols: vscode.SymbolInformation[] = [];
        const regex = /^\*\s*(.+)|^\+\+\s*/; // Detecta líneas que comienzan con '* ' o '++'
        const emojiMap: Record<string, string> = {
            "Control data": "🔧",
            "Singular value decomposition": "🧮",
            "Parameter groups": "📂🪨",
            "Parameter data": "🪨",
            "Observation groups": "📂🔍",
            "Observation data": "🔍",
            "Model command line": "💻",
            "Model input/output": "🧩",
            "Prior information": "🗂️",
            Regularization: "⚖️",
            Regularisation: "⚖️",
            "PEST++ section": "🌐",
        };

        // Agregar símbolo especial para abrir el manual
        symbols.push(
            new vscode.SymbolInformation(
                "📖 Open Manual",
                vscode.SymbolKind.Field,
                "",
                new vscode.Location(document.uri, new vscode.Range(0, 0, 0, 0))
            )
        );

        let inPestPlusSection = false; // Bandera para bloques Pest++
        let currentSymbol: vscode.SymbolInformation | null = null;

        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i).text;
            const match = line.match(regex);

            // Si encontramos un encabezado estándar ('* ')
            if (match && match[1]) {
                // Cierra la sección anterior
                if (currentSymbol) {
                    const end = new vscode.Position(
                        i - 1,
                        document.lineAt(i - 1).text.length
                    );
                    currentSymbol.location.range = new vscode.Range(
                        currentSymbol.location.range.start,
                        end
                    );
                }

                inPestPlusSection = false; // Finaliza cualquier bloque Pest++
                const sectionName =
                    match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();

                const icon = emojiMap[sectionName] || "";

                currentSymbol = new vscode.SymbolInformation(
                    `${icon} ${sectionName}`,
                    vscode.SymbolKind.Field,
                    "",
                    new vscode.Location(
                        document.uri,
                        new vscode.Range(i, 0, i, line.length)
                    )
                );

                symbols.push(currentSymbol);
            }
            // Si encontramos el inicio de un bloque '++'
            else if (line.trim().startsWith("++")) {
                if (!inPestPlusSection) {
                    if (currentSymbol) {
                        const end = new vscode.Position(
                            i - 1,
                            document.lineAt(i - 1).text.length
                        );
                        currentSymbol.location.range = new vscode.Range(
                            currentSymbol.location.range.start,
                            end
                        );
                    }

                    inPestPlusSection = true;

                    currentSymbol = new vscode.SymbolInformation(
                        "🌐 PEST++ section",
                        vscode.SymbolKind.Field,
                        "",
                        new vscode.Location(
                            document.uri,
                            new vscode.Range(i, 0, i, line.length)
                        )
                    );

                    symbols.push(currentSymbol);
                }
            }
        }

        // Cierra la última sección
        if (currentSymbol) {
            const end = new vscode.Position(
                document.lineCount - 1,
                document.lineAt(document.lineCount - 1).text.length
            );
            currentSymbol.location.range = new vscode.Range(
                currentSymbol.location.range.start,
                end
            );
        }

        return symbols;
    }
}

//#endregion Document Symbol Provider

// #region Validate type of the variable
function validateType(
    value: string,
    type: "string" | "integer" | "float",
    allowedValues?: string[]
): boolean {
    console.log(`Validating Type: Value="${value}", Type=${type}`);
    
    if (type === "integer") {
        const isInteger = /^-?\d+$/.test(value);
        console.log(`Validation result: ${isInteger}`);
        return isInteger;
    } else if (type === "float") {
        const isFloat = /^-?\d*\.?\d+$/.test(value);
        console.log(`Validation result: ${isFloat}`);
        return isFloat;
    } else if (type === "string") {
        if (allowedValues && allowedValues.length > 0) {
            const isValid = allowedValues.includes(value.toLowerCase());
            console.log(`Validating string against allowed values: ${allowedValues.join(", ")}`);
            console.log(`Validation result: ${isValid}`);
            return isValid;
        }
        // Si no hay allowedValues, cualquier string es válido
        console.log(`Validation result: true (no allowed values specified)`);
        return true;
    }
    
    console.log(`Validation result: false (unknown type)`);
    return false;
}
// #endregion Validate type of the variable

// #region Find PESTCHECK executable

async function findPestCheck(): Promise<string | null> {
    console.log("Starting PestCheck search...");

    const platform = process.platform;
    const commonPaths = getCommonPaths(platform);

    // 1. Try finding PestCheck using platform-specific commands
    const pathFromCommand = await findPestCheckUsingCommand(platform);
    if (pathFromCommand) {
        vscode.window.showInformationMessage(`PestCheck found using command: ${pathFromCommand}`);
        console.log("Found via command:", pathFromCommand);
        return pathFromCommand;
    }

    // 2. Try searching common paths
    for (const commonPath of commonPaths) {
        try {
            const exists = await fs.promises.access(commonPath, fs.constants.F_OK)
                .then(() => true)
                .catch(() => false); // Async check if path exists
            if (exists) {
                console.log(`PestCheck found at: ${commonPath}`);
                const userChoice = await vscode.window.showInformationMessage(
                    `PestCheck executable found at: ${commonPath}. Do you want to use this path?`,
                    "Yes",
                    "No"
                );
                if (userChoice === "Yes") {
                    return commonPath;
                }
            }
        } catch (error) {
            console.error(`Error checking path ${commonPath}:`, error);
        }
    }

    // 3. Not found, offer configuration options
    const warningMessage = "PestCheck executable not found using any method. Please configure it manually.";
    const userChoice = await vscode.window.showWarningMessage(
        warningMessage,
        "Auto Set PestCheck Path",
        "Manual Configuration"
    );
    if (userChoice === "Auto Set PestCheck Path") {
        await autoSetPestCheckPath();
    } else if (userChoice === "Manual Configuration") {
        await browseForPestCheckPath();
    }
    console.log(warningMessage);
    return null;
}




function getCommonPaths(platform: NodeJS.Platform): string[] {
    // Define base paths common to all platforms
    const basePaths = [
        path.join("C:", "Program Files", "Pest", "pestchek.exe"),
        path.join("C:", "Program Files (x86)", "Pest", "pestchek.exe"),
        path.join(os.homedir(), "Pest", "pestchek.exe"),
        path.join("/Applications", "Pest", "pestchek"),
        path.join("/usr/local/bin", "pestchek"),
        path.join("/opt", "Pest", "pestchek")
    ];

    // Add `/gwv` paths
    const gwvPaths = [5, 6, 7, 8, 9].map((num) =>
        platform === "win32"
            ? path.join("C:", `gwv${num}`, "pestchek.exe") // Windows-specific gwv paths
            : path.join(`/gwv${num}`, "pestchek") // Unix-based gwv paths
    );

    // Combine base and gwv paths
    const allPaths = [...basePaths, ...gwvPaths];

    // Filter and adjust paths based on the platform
    if (platform === "win32") {
        return allPaths
            .filter((p) => p.startsWith("C:")) // Only include Windows paths
            .map((p) => (p.endsWith(".exe") ? p : `${p}.exe`)); // Ensure `.exe` extension
    } else {
        return allPaths.filter((p) => !p.startsWith("C:")); // Exclude Windows-specific paths
    }
}

const execPromise = promisify(exec);

async function findPestCheckUsingCommand(platform: NodeJS.Platform): Promise<string | null> {
    const command = platform === "win32" ? "where pestchek" : "which pestchek";
    console.log(`Trying to find pestchek using ${command}...`);

    try {
        const { stdout } = await execPromise(command);
        const paths = stdout.trim().split("\n").map((p) => p.trim()); // Handle multiple results
        if (paths.length > 0) {
            console.log(`Found pestchek using ${command}:`, paths[0]); // Use the first result
            return paths[0];
        } else {
            console.log(`No paths found for pestchek using ${command}.`);
            return null;
        }
    } catch (error) {
        console.error(`Error executing ${command}:`, error);
        return null;
    }
}


async function isExecutable(filePath: string): Promise<boolean> {
    try {
        await fs.promises.access(filePath, fs.constants.X_OK); // Ensure the file is executable
        return true;
    } catch {
        return false;
    }
}

async function autoSetPestCheckPath(): Promise<void> {
    console.log("Attempting to auto-detect PestCheck path...");

    const path = await findPestCheck();
    if (path && await isExecutable(path)) {
        await vscode.workspace.getConfiguration("pestd3code").update("pestcheckPath", path, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`PestCheck path automatically set to: ${path}`);
    } else if (!path) {
        const userChoice = await vscode.window.showWarningMessage(
            "PestCheck executable not found. Would you like to set it manually?",
            "Browse",
            "Skip"
        );
        if (userChoice === "Browse") {
            await browseForPestCheckPath();
        }
    } else {
        vscode.window.showErrorMessage(`The detected path is not executable: ${path}`);
    }
}

async function browseForPestCheckPath() {
    console.log("Opening file dialog for manual PestCheck path selection...");

    const platform = process.platform;
    const filters =
        platform === "win32"
            ? { Executables: ["exe"] }
            : platform === "darwin"
                ? { Executables: ["sh", "bin", ""] } // Limit to common macOS executable formats
                : { Executables: ["sh", "bin", ""] }; // Linux: Common executables or no extension

    const selectedFile = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters,
        openLabel: "Select PestCheck Executable",
    });

    if (selectedFile && selectedFile[0]) {
        const pestcheckPath = selectedFile[0].fsPath;
        console.log("User selected PestCheck path:", pestcheckPath);

        // Cross-platform validation for file executability
        try {
            await fs.promises.access(pestcheckPath, fs.constants.X_OK); // Check execution permissions
        } catch {
            if (platform !== "win32") {
                const makeExecutable = await vscode.window.showWarningMessage(
                    "The selected file is not executable. Would you like to make it executable?",
                    "Yes",
                    "No"
                );

                if (makeExecutable === "Yes") {
                    try {
                        await new Promise((resolve, reject) => {
                            exec(`chmod +x "${pestcheckPath}"`, (error) => {
                                if (error) {
                                    reject(error);
                                } else {
                                    resolve(true);
                                }
                            });
                        });
                        console.log("Made file executable:", pestcheckPath);
                    } catch (error) {
                        console.error("Error making file executable:", error);
                        vscode.window.showErrorMessage(
                            "Failed to make file executable. Please set permissions manually."
                        );
                        return;
                    }
                } else {
                    console.warn("User declined to make the file executable.");
                    return;
                }
            } else {
                vscode.window.showErrorMessage(
                    "The selected file is not valid or inaccessible."
                );
                return;
            }
        }

        // Update the configuration
        await vscode.workspace
            .getConfiguration("pestd3code")
            .update("pestcheckPath", pestcheckPath, vscode.ConfigurationTarget.Global);

        vscode.window.showInformationMessage(`PestCheck path set to: ${pestcheckPath}`);
    } else {
        console.log("No file selected by user.");
        vscode.window.showWarningMessage("No file selected.");
    }
}
// #endregion Find PESTCHECK executable

// #region RUN PESTCHEK! The good stuff starts here

async function handleSkipWarningMessage(
    document: vscode.TextDocument,
    context: vscode.ExtensionContext,
    configuration: vscode.WorkspaceConfiguration
): Promise<boolean> {
    const documentPath = document.uri.fsPath;
    const suppressedFiles = context.workspaceState.get<string[]>('suppressedWarningFiles', []);
    const fileWarningStates = context.workspaceState.get<Record<string, FileWarningState>>('fileWarningStates', {});

    // Inicializar o obtener el estado del archivo actual
    if (!fileWarningStates[documentPath]) {
        fileWarningStates[documentPath] = {
            suppressWarnings: false,
            warningCount: 0
        };
    }

    const showSkipWarningMessage = !suppressedFiles.includes(documentPath) &&
        fileWarningStates[documentPath].warningCount < SESSION_MAX_SUPPRESSIBLE_SUGGESTIONS;

    if (showSkipWarningMessage) {
        const selection = await vscode.window.showWarningMessage(
            'Warning: PestCheck is running with /s flag which will stop warnings and template/instruction/cov matrix file checking. Continue?',
            {
                modal: false,
                detail: 'This affects template, instruction and coverage matrix file checking.'
            },
            'No, show all warnings',
            'Yes, keep skipping',
            "Don't show this message again"
        );

        // Incrementar el contador de advertencias para este archivo
        fileWarningStates[documentPath].warningCount++;
        await context.workspaceState.update('fileWarningStates', fileWarningStates);

        if (selection === 'No, show all warnings') {
            await configuration.update("skipWarnings", false, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage('Skip Warnings disabled. Re-running PestCheck...');
            return false;
        } else if (selection === "Don't show this message again") {
            suppressedFiles.push(documentPath);
            await context.workspaceState.update('suppressedWarningFiles', suppressedFiles);
            vscode.window.showInformationMessage(
                'To change skip warnings setting later, go to Settings (Ctrl+,) and search for "Pestd3code: Skip Warnings"'
            );
        }
    }
    return true;
}

let timeout: NodeJS.Timeout | undefined;
let diagnosticCollection: vscode.DiagnosticCollection | undefined;

// Limpiar el panel de salida
let outputChannel: vscode.OutputChannel;
outputChannel = vscode.window.createOutputChannel('PestCheck Results');
let rawOutputChannel: vscode.OutputChannel;
rawOutputChannel = vscode.window.createOutputChannel('PestCheck Raw Output');
outputChannel.clear();
rawOutputChannel.clear();
outputChannel.show(true);
let rawPanel: vscode.WebviewPanel | undefined;
// #endregion RUN PESTCHEK. The good stuff ends here

/*=======================================================
MAIN EXTENSION ACTIVATION FUNCTION
=======================================================*/

// #region MAIN EXTENSION ACTIVATION FUNCTION

export async function activate(

    context: vscode.ExtensionContext
): Promise<void> {

    // Reset counter when a .pst file is closed
    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(async (document) => {
            if (document.fileName.endsWith('.pst')) {
                await context.workspaceState.update('suppressibleSuggestionCount', 0);
                // Limpiar este archivo de la lista de archivos suprimidos y su estado
                const suppressedFiles = context.workspaceState.get<string[]>('suppressedWarningFiles', []);
                const fileWarningStates = context.workspaceState.get<Record<string, FileWarningState>>('fileWarningStates', {});

                const updatedFiles = suppressedFiles.filter(file => file !== document.uri.fsPath);
                delete fileWarningStates[document.uri.fsPath];

                await context.workspaceState.update('suppressedWarningFiles', updatedFiles);
                await context.workspaceState.update('fileWarningStates', fileWarningStates);
                console.log(`Reset warning states - .pst file closed: ${document.fileName}`);
            }
        })
    );


    // true = preservar foco
    // PESTCHECK FUNCTION with no copy of the file
    async function runPestCheck(document: vscode.TextDocument): Promise<void> {
        try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
            if (!workspaceRoot) {
                throw new Error('No workspace folder found');
            }

            // Get relative path without leading slash
            const relativePath = getRelativePath(document.fileName, workspaceRoot);
            console.log('Processing file:', relativePath);

            const filePath = document.uri.fsPath;
            const fileNameWithoutExt = path.parse(filePath).name;
            const fileDir = path.dirname(filePath);
            const tempFilePath = path.join(fileDir, `${fileNameWithoutExt}_temp.pst`);

            console.log(`Creating temporary file: ${tempFilePath}`);
            await fs.promises.writeFile(tempFilePath, document.getText());
            console.log(`Running PestCheck for: ${fileNameWithoutExt}_temp`);
            const configuration = vscode.workspace.getConfiguration("pestd3code");
            let pestCheckPath = configuration.get<string>("pestcheckPath", "");
            if (!pestCheckPath || !fs.existsSync(pestCheckPath)) {
                console.log("PestCheck path not configured or invalid, prompting user...");
                const choice = await vscode.window.showWarningMessage(
                    "PestCheck executable not found. Would you like to locate it?",
                    "Auto Detect",
                    "Browse",
                    "Cancel"
                );
                switch (choice) {
                    case "Auto Detect":
                        console.log("Attempting automatic detection...");
                        const foundPath = await findPestCheck();
                        if (foundPath) {
                            pestCheckPath = foundPath;
                            await configuration.update("pestcheckPath", foundPath, vscode.ConfigurationTarget.Global);
                            console.log("PestCheck found at:", pestCheckPath);
                        } else {
                            console.log("Automatic detection failed");
                            return;
                        }
                        break;

                    case "Browse":
                        await browseForPestCheckPath(context);
                        // Re-check configuration after browse
                        pestCheckPath = configuration.get<string>("pestcheckPath", "");
                        if (!pestCheckPath || !fs.existsSync(pestCheckPath)) {
                            console.log("No valid path selected during browse");
                            return;
                        }
                        break;

                    default:
                        console.log("User cancelled PestCheck configuration");
                        return;
                }
            }
            try {
                const skipWarnings = configuration.get<boolean>("skipWarnings", false);

                if (skipWarnings) {
                    const shouldContinue = await handleSkipWarningMessage(document, context, configuration);
                    if (!shouldContinue) {
                        return runPestCheck(document);
                    }
                }

                const pestProcess = spawn(
                    pestCheckPath,
                    [`${fileNameWithoutExt}_temp`, ...(skipWarnings ? ['/s'] : [])],
                    { cwd: fileDir }
                );
                let output = '';
                pestProcess.stdout.on('data', (data) => {
                    output += data.toString();
                });
                pestProcess.stderr.on('data', (data) => {
                    output += data.toString();
                });
                pestProcess.on('close', (code) => {
                    console.log('====== PestCheck Output Start ======');
                    console.log('Raw output:', output);
                    console.log(`PestCheck process exited with code: ${code}`);

                    const results = parsePestchekOutput(output);

                    // Group diagnostics by file
                    const diagnosticsByFile = new Map<string, vscode.Diagnostic[]>();

                    results.forEach(result => {
                        const filePath = result.file || document.uri.fsPath;
                        if (!diagnosticsByFile.has(filePath)) {
                            diagnosticsByFile.set(filePath, []);
                        }
                        diagnosticsByFile.get(filePath)?.push(result.diagnostic);
                    });

                    // Clear and set diagnostics for each file
                    if (!diagnosticCollection) {
                        diagnosticCollection = vscode.languages.createDiagnosticCollection("pestCheck");
                    }
                    diagnosticCollection.clear();

                    // Set diagnostics for each file
                    diagnosticsByFile.forEach((diagnostics, filePath) => {
                        const uri = vscode.Uri.file(filePath);
                        diagnosticCollection?.set(uri, diagnostics);
                        console.log(`Set ${diagnostics.length} diagnostics for file: ${filePath}`);
                    });

                    if (!rawPanel) {
                        rawPanel = vscode.window.createWebviewPanel(
                            'rawOutput',
                            'PestCheck Raw Output',
                            {
                                viewColumn: vscode.ViewColumn.Beside,
                                preserveFocus: true
                            },
                            {
                                retainContextWhenHidden: true,
                                enableFindWidget: true
                            }
                        );


                        rawPanel.onDidDispose(() => {
                            rawPanel = undefined;
                        });
                        rawPanel.onDidChangeViewState(() => {
                            if (rawPanel?.active) {
                                vscode.commands.executeCommand('setContext', 'rawOutputViewActive', true);
                            } else {
                                vscode.commands.executeCommand('setContext', 'rawOutputViewActive', false);
                            }
                        });

                    }
                    /* 
                                        // Actualizar el contenido del WebView
                                        rawPanel.webview.html = `
                                    <html>
                                        <body style="padding: 10px">
                                            <h3>Raw Pestcheck Output</h3>
                                            <pre style="background-color: var(--vscode-editor-background); padding: 10px">
                                                ${output}
                                            </pre>
                                        </body>
                                    </html>
                                `; */
                    // Asegurar que el contenido esté visible pero sin robar el foco
                    rawPanel.reveal(vscode.ViewColumn.Beside, false);

                    rawOutputChannel.appendLine('====== Raw PestCheck Output ======');
                    rawOutputChannel.appendLine(output);
                    rawOutputChannel.appendLine('====== End Raw Output ======');

                    //
                    // Definir el mapeo de severidades
                    const severityMap = {
                        0: { text: 'Error', icon: '⛔' }, // Cambiado de ❌ a ⛔
                        1: { text: 'Warning', icon: '⚠️' },
                        2: { text: 'Information', icon: 'ℹ️' },
                        3: { text: 'Hint', icon: '💡' }
                    };

                    // Definir los encabezados de sección
                    const severityHeaders = {
                        'ERROR': '⛔ ERRORS', // Cambiado de ❌ a ⛔
                        'WARNING': '⚠️ WARNINGS'
                    };

                    // Separadores decorativos
                    const decorativeSeparators = {
                        header: '═══════════════════════════════════════',
                        section: '───────────────────────────────────────',
                        item: '─'.repeat(40), // Cambiado de puntos a guiones largos
                        footer: '═══════════════════════════════════════'
                    };

                    // Generar el encabezado principal
                    outputChannel.appendLine(decorativeSeparators.header);
                    outputChannel.appendLine('🔍 PestCheck Results');
                    outputChannel.appendLine(decorativeSeparators.header);
                    outputChannel.appendLine('');

                    // Filtrar resultados
                    const errorResults = results.filter(r => r.type === 'ERROR');
                    const warningResults = results.filter(r => r.type === 'WARNING');

                    // Mostrar errores
                    if (errorResults.length > 0) {
                        outputChannel.appendLine(severityHeaders['ERROR']);
                        outputChannel.appendLine(decorativeSeparators.section);
                        errorResults.forEach(result => {
                            const severity = severityMap[result.diagnostic.severity as keyof typeof severityMap];
                            outputChannel.appendLine(`${severity.icon} Severity: ${severity.text}`);
                            outputChannel.appendLine(`🔵 Position: Line ${result.diagnostic.range.start.line + 1}`); // Cambiado de 📍 a 🔵
                            outputChannel.appendLine(`🗨️ Message: ${result.diagnostic.message}`); // Cambiado 💬 por 🗨️
                            outputChannel.appendLine(decorativeSeparators.item);
                        });
                        outputChannel.appendLine('');
                    }

                    // Mostrar advertencias
                    if (warningResults.length > 0) {
                        outputChannel.appendLine(severityHeaders['WARNING']);
                        outputChannel.appendLine(decorativeSeparators.section);
                        warningResults.forEach(result => {
                            const severity = severityMap[result.diagnostic.severity as keyof typeof severityMap];
                            outputChannel.appendLine(`${severity.icon} Severity: ${severity.text}`);
                            outputChannel.appendLine(`🔵 Position: Line ${result.diagnostic.range.start.line + 1}`); // Cambiado de 📍 a 🔵
                            outputChannel.appendLine(`🗨️ Message: ${result.diagnostic.message}`); // Cambiado 💬 por 🗨️
                            outputChannel.appendLine(decorativeSeparators.item);
                        });
                        outputChannel.appendLine('');
                    }

                    // Mostrar el resumen final
                    outputChannel.appendLine(decorativeSeparators.footer);
                    outputChannel.appendLine('🎯 PESTCHEK Version 18.25. Watermark Numerical Computing');
                    outputChannel.appendLine('┌──────────────────────────────────────┐');
                    outputChannel.appendLine(`│ 📋 Analysis Results                  │`);
                    outputChannel.appendLine(`│ ⛔ Errors found: ${errorResults.length.toString().padEnd(5)}              │`);
                    outputChannel.appendLine(`│ ⚠️ Warnings found: ${warningResults.length.toString().padEnd(5)}            │`);
                    outputChannel.appendLine('└──────────────────────────────────────┘');
                    outputChannel.appendLine(decorativeSeparators.footer);


                    // Determine the emoji and status message based on the results
                    const errors = errorResults.length;
                    const warnings = warningResults.length;

                    let emoji = "";
                    let statusMessage = "";

                    if (errors > 0) {
                        emoji = "😞";
                        statusMessage = "Errors detected! Please fix them.";
                    } else if (warnings > 0) {
                        emoji = "😐";
                        statusMessage = "Warnings detected. Review recommended.";
                    } else {
                        emoji = "😊";
                        statusMessage = "No issues detected. Everything looks great!";
                    }

                    // Update the WebView content
                    rawPanel.webview.html = `
                    <html>
                        <body style="padding: 10px; font-family: Arial, sans-serif;">
                            <!-- Status Section -->
                            <div style="text-align: center; margin-bottom: 20px;">
                                <div style="font-size: 3rem;">${emoji}</div>
                                <div style="font-size: 1.2rem; font-weight: bold; color: var(--vscode-editor-foreground);">
                                    ${statusMessage}
                                </div>
                            </div>

                            <!-- PESTCHEK Output -->
                            <h3>Raw PestCheck Output</h3>
                            <pre style="background-color: var(--vscode-editor-background); padding: 10px; border-radius: 4px;">
                                ${output}
                            </pre>
                        </body>
                    </html>
                    `;

                    // Check for messages that can be suppressed with /s flag
                    const SESSION_MAX_SUPPRESSIBLE_SUGGESTIONS = 1;
                    // Check for messages that can be suppressed with /s flag
                    const suppressibleChecks = [
                        "is not cited in a template file",
                        "not cited in an instruction file",
                        "covariance matrix",
                        "NOPTMAX provided as -2.",
                        "NOPTMAX provided as -1.",
                        "NOPTMAX provided as 0",
                        "MAXSING in the singular value decomposition section is greater than the"
                    ];

                    // Check if there are messages that could be suppressed
                    const hasSuppressibleWarnings = suppressibleChecks.some(phrase =>
                        output.toLowerCase().includes(phrase.toLowerCase())
                    );

                    // Get suggestion count from workspace state (por sesión)
                    const suggestionCount = context.workspaceState.get<number>('suppressibleSuggestionCount', 0);
                    console.log('Current suggestion count:', suggestionCount);
                    console.log('Has suppressible warnings:', hasSuppressibleWarnings);
                    console.log('Skip warnings enabled:', configuration.get<boolean>("skipWarnings", false));


                    // If suppressible warnings are found, /s is NOT enabled, and we haven't shown too many suggestions this session
                    if (hasSuppressibleWarnings &&
                        !configuration.get<boolean>("skipWarnings", false) &&
                        suggestionCount < SESSION_MAX_SUPPRESSIBLE_SUGGESTIONS) {

                        vscode.window.showInformationMessage(
                            'Would you like to try skipping checks using Pestcheck "/s" flag?',
                            'No, keep showing warnings',
                            'Yes, try skipping warnings',
                            "Don't show this suggestion again"
                        ).then(async selection => {
                            console.log('User selected:', selection);
                            if (selection === 'Yes, try skipping warnings') {
                                await configuration.update("skipWarnings", true, vscode.ConfigurationTarget.Global);
                                        vscode.window.showInformationMessage('Skip Warnings enabled. Re-running PestCheck...');
                                        runPestCheck(document);
                            } else if (selection === "Don't show this suggestion again") {
                                const suppressedFiles = context.workspaceState.get<string[]>('suppressedWarningFiles', []);
                                suppressedFiles.push(document.uri.fsPath);
                                await context.workspaceState.update('suppressedWarningFiles', suppressedFiles);
                                vscode.window.showInformationMessage(
                                    'To change skip warnings setting later, go to Settings (Ctrl+,) and search for "Pestd3code: Skip Warnings"'
                                );
                            }
                            // Increment suggestion count per session
                            const newCount = suggestionCount + 1;
                            console.log('Updating suggestion count to:', newCount);
                            await context.workspaceState.update('suppressibleSuggestionCount', newCount);
                        });
                    } else {
                        console.log('Conditions not met for showing warning:');
                        console.log('- hasSuppressibleWarnings:', hasSuppressibleWarnings);
                        console.log('- skipWarnings:', !configuration.get<boolean>("skipWarnings", false));
                    }

                    // Clean up temporary file after PestCheck finishes
                    fs.promises.unlink(tempFilePath)
                        .then(() => console.log('Temporary file cleaned up successfully'))
                        .catch((cleanupError) => console.error('Error cleaning up temporary file:', cleanupError));

                });
            } catch (error) {
                console.error("Error executing PestCheck:", error);
                vscode.window.showWarningMessage(`Error running PestCheck: ${error}`);

                try {
                    await fs.promises.unlink(tempFilePath);
                } catch (error) {
                    console.error('Error cleaning up temporary file:', error);
                }
            }
        }
        catch (error) {
            console.error("Error in runPestCheck:", error);
            vscode.window.showErrorMessage(`❌ Error running PestCheck: ${error}`);
        }
    }


    /*=======================================================
    Browse for PestCheck path
    =======================================================*/

    // #region Browse for PestCheck path

    async function browseForPestCheckPath(_context: vscode.ExtensionContext) {
        console.log("Opening file dialog for manual PestCheck path selection...");

        // Determine platform-specific filters
        const platform = process.platform;
        const filters =
            platform === "win32"
                ? { Executables: ["exe"] } // Windows-specific filter for .exe files
                : { Executables: ["", "sh", "bin"] }; // Unix-based filters (no extension, shell scripts, binaries)

        // Show file dialog
        const selectedFile = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters,
            openLabel: "Select PestCheck Executable",
        });

        if (selectedFile && selectedFile[0]) {
            const pestcheckPath = selectedFile[0].fsPath;
            console.log("User selected PestCheck path:", pestcheckPath);

            // Validate executability on Unix-based platforms
            if (platform !== "win32") {
                try {
                    await fs.promises.access(pestcheckPath, fs.constants.X_OK); // Check if the file is executable
                } catch {
                    const makeExecutable = await vscode.window.showWarningMessage(
                        "The selected file is not executable. Would you like to make it executable?",
                        "Yes",
                        "No"
                    );
                    if (makeExecutable === "Yes") {
                        try {
                            await new Promise((resolve, reject) => {
                                exec(`chmod +x "${pestcheckPath}"`, (error) => {
                                    if (error) {
                                        reject(error);
                                    } else {
                                        resolve(true);
                                    }
                                });
                            });
                            console.log("Made file executable:", pestcheckPath);
                        } catch (error) {
                            console.error("Error making file executable:", error);
                            vscode.window.showErrorMessage(
                                "Failed to make file executable. Please set permissions manually."
                            );
                            return;
                        }
                    } else {
                        vscode.window.showErrorMessage(
                            "The selected file is not executable and cannot be used."
                        );
                        return;
                    }
                }
            }

            // Update configuration
            await vscode.workspace
                .getConfiguration("pestd3code")
                .update("pestcheckPath", pestcheckPath, vscode.ConfigurationTarget.Global);

            vscode.window.showInformationMessage(
                `PestCheck path set to: ${pestcheckPath}`
            );
        } else {
            console.log("No file selected by user.");
            vscode.window.showWarningMessage("No file selected.");
        }
    }


    vscode.commands.registerCommand(
        "pestd3code.setPestcheckPath",
        browseForPestCheckPath
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "pestd3code.autoSetPestCheckPath",
            autoSetPestCheckPath
        ),
        vscode.commands.registerCommand("pestd3code.findPestCheck", async () => {
            const pestCheckPath = await findPestCheck();
            if (!pestCheckPath) {
                vscode.window
                    .showWarningMessage(
                        "PestCheck executable not found. Would you like to set it manually?",
                        "Browse"
                    )
                    .then((selection) => {
                        if (selection === "Browse") {
                            browseForPestCheckPath(context);
                        }
                    });
            }
        })
    );

    const configuration = vscode.workspace.getConfiguration("pestd3code");
    let pestcheckPath = configuration.get<string>("pestcheckPath", "");

    const alreadyNotified = context.globalState.get<boolean>(
        "pestCheckNotified",
        false
    );

    if (!pestcheckPath || !fs.existsSync(pestcheckPath)) {
        console.log("PestCheck path not configured or does not exist.");

        if (!alreadyNotified) {
            console.log("Notifying user about missing PestCheck configuration...");
            await notifyPestCheckNotFound(context);
            await context.globalState.update("pestCheckNotified", true); // Marcar como notificado
        } else {
            console.log("User has already been notified about missing PestCheck.");
        }
    } else {
        if (!alreadyNotified) {
            console.log("PestCheck is already configured at:", pestcheckPath);
            vscode.window.showInformationMessage(
                `PestCheck is already configured at: ${pestcheckPath}`
            );
            await context.globalState.update("pestCheckNotified", true); // Marcar como notificado
        }
    }

    context.subscriptions.push(
        vscode.commands.registerCommand("pestd3code.resetNotification", () =>
            resetPestCheckNotification(context)
        )
    );

    async function notifyPestCheckNotFound(context: vscode.ExtensionContext) {
        const selected = await vscode.window.showWarningMessage(
            "PestCheck executable not found. Configure it now?",
            "Browse",
            "Skip"
        );

        if (selected === "Browse") {
            await browseForPestCheckPath(context);
        } else {
            console.log("User chose to skip PestCheck configuration.");
        }
    }

    async function resetPestCheckNotification(context: vscode.ExtensionContext) {
        await context.globalState.update("pestCheckNotified", false);
        vscode.window.showInformationMessage(
            "PestCheck notification reset. You will be notified again if needed."
        );
    }
    // #endregion Browse for PestCheck path

    /*=======================================================
    Run PestCheck command
    =======================================================*/

    // #region Run PestCheck command

    vscode.commands.registerCommand("pestd3code.runPestCheck", () => {
        vscode.commands.executeCommand('workbench.action.output.toggleOutput');
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showWarningMessage("No active file to run PestCheck.");
            return;
        }

        runPestCheck(activeEditor.document);
    });


    await loadDescriptions(context);

    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(
            { scheme: "file", pattern: "**/*.{pst}" }, // Cambia 'plaintext' al lenguaje que definiste para tus archivos .pst
            new PestDocumentSymbolProvider()
        )
    );

    // #endregion Run PestCheck command

    /*=======================================================
    Clear diagnostics
    =======================================================*/
    // #region Clear diagnostics
    vscode.commands.registerCommand("pestd3code.clearDiagnostics", () => {
        // Clear diagnostics
        diagnosticCollection?.clear();

        // Clear PestCheck Results output channel
        outputChannel?.clear();

        // Clear Raw Output channel
        rawOutputChannel?.clear();

        // Close and dispose WebView panel
        if (rawPanel) {
            rawPanel.dispose();
            rawPanel = undefined;
        }

        console.log('All PestCheck outputs cleared');
    });
    // #endregion Clear diagnostics

    /*=======================================================
    Detect changes to .pst files and offer to reload
    =======================================================*/

    // #region Detect changes to .pst files and offer to reload
    // Active watchers management
    const activeWatchers: Map<string, vscode.FileSystemWatcher> = new Map();
    const fileModificationTimes: Map<string, number> = new Map();

    // Create watcher for active editor
    vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (!editor?.document.uri.fsPath.endsWith('.pst')) {
            console.log('Not a PST file, skipping watcher creation');
            return;
        }

        const filePath = editor.document.uri.fsPath;
        console.log(`Processing PST file: ${filePath}`);

        // Avoid duplicate watchers
        if (activeWatchers.has(filePath)) {
            console.log(`Watcher already exists for: ${filePath}`);
            return;
        }

        console.log(`Creating new watcher for: ${filePath}`);

        // Create specific watcher for this file
        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(
                path.dirname(filePath),
                path.basename(filePath)
            )
        );

        // Handle file changes
        watcher.onDidChange(async (uri) => {
            console.log(`Change detected in: ${uri.fsPath}`);

            // Skip temporary files
            if (path.basename(uri.fsPath).endsWith("_temp.pst")) {
                console.log('Skipping temporary file modification');
                return;
            }

            try {
                const stats = await fs.promises.stat(uri.fsPath);
                const lastModified = stats.mtimeMs;
                const lastKnownModified = fileModificationTimes.get(uri.fsPath);

                if (!lastKnownModified || lastKnownModified !== lastModified) {
                    console.log('File reloaded due to external modification');

                    // Update the modification time
                    fileModificationTimes.set(uri.fsPath, lastModified);

                    // Notify the user
                    vscode.window.showWarningMessage(
                        `File "${path.basename(uri.fsPath)}" has been reloaded due to external modification.`
                    );
                }
            } catch (error) {
                console.error('Error processing file change:', error);
            }
        });

        // Store watcher reference
        activeWatchers.set(filePath, watcher);
    });

    // Cleanup watchers on file close
    vscode.workspace.onDidCloseTextDocument((document) => {
        const filePath = document.uri.fsPath;
        if (filePath.endsWith('.pst')) {
            console.log(`Cleaning up watcher for: ${filePath}`);
            const watcher = activeWatchers.get(filePath);
            if (watcher) {
                watcher.dispose();
                activeWatchers.delete(filePath);
                fileModificationTimes.delete(filePath);
            }
        }
    });

    // Update modification time on save
    vscode.workspace.onDidSaveTextDocument((document) => {
        const filePath = document.uri.fsPath;
        if (filePath.endsWith('.pst')) {
            try {
                const stats = fs.statSync(filePath);
                fileModificationTimes.set(filePath, stats.mtimeMs);
                console.log(`Updated modification time for: ${filePath}`);
            } catch (error) {
                console.error('Error updating modification time:', error);
            }
        }
    });

    // Ensure cleanup on extension deactivation
    context.subscriptions.push({
        dispose: () => {
            console.log('Cleaning up all watchers');
            for (const watcher of activeWatchers.values()) {
                watcher.dispose();
            }
            activeWatchers.clear();
            fileModificationTimes.clear();
        }
    });


    // #endregion Detect changes to .pst files and offer to reload

    /*========================================================
    CodeLens provider for manual
    ========================================================*/

    // #region CodeLens provider for manual
    const manualCodeLensProvider = vscode.languages.registerCodeLensProvider(
        { scheme: "file", pattern: "**/*.{pst}" },
        {
            provideCodeLenses() {
                const codeLenses: vscode.CodeLens[] = [];
                const topOfDocument = new vscode.Range(0, 0, 0, 0);
                const command: vscode.Command = {
                    title: "📖 →  Open Manual",
                    command: "extension.openManual",
                };
                codeLenses.push(new vscode.CodeLens(topOfDocument, command));
                return codeLenses;
            },
        }
    );

    const openManualCommand = vscode.commands.registerCommand(
        "extension.openManual",
        async () => {
            const manualPath = vscode.Uri.file(
                path.join(context.extensionPath, "resources", "pestpp_users_manual.md")
            );
            //await vscode.window.showTextDocument(document,vscode.ViewColumn.Beside);
            await vscode.commands.executeCommand(
                "markdown.showPreviewToSide",
                manualPath
            );
        }
    );

    context.subscriptions.push(openManualCommand);

    //#endregion CodeLens provider for manual

    /*========================================================
    Folding provider for PEST control file
    ========================================================*/

    // #region Folding provider for PEST control file
    const foldingProvider = vscode.languages.registerFoldingRangeProvider(
        { scheme: "file", pattern: "**/*.{pst}" }, // Archivos con extensiones .pst 
        {
            provideFoldingRanges(document, _context, token) {
                const ranges: vscode.FoldingRange[] = [];
                const lines = document.getText().split("\n");

                let start: number | null = null; // Marca el inicio de una sección

                for (let i = 0; i < lines.length; i++) {
                    if (token.isCancellationRequested) {
                        console.log("Folding operation cancelled.");
                        return ranges; // Salir si el usuario cancela la operación
                    }

                    const line = lines[i].trim();

                    // Detectar el inicio de una nueva sección
                    if (line.startsWith("*")) {
                        if (start !== null) {
                            // Si ya hay una sección abierta, cerrarla antes de iniciar otra
                            ranges.push(new vscode.FoldingRange(start, i - 1));
                        }
                        start = i; // Marca la línea actual como inicio de una nueva sección
                    }
                }

                // Finalizar la última sección abierta
                if (start !== null && start < lines.length - 1) {
                    ranges.push(new vscode.FoldingRange(start, lines.length - 1));
                }

                return ranges;
            },
        }
    );

    // #endregion Folding provider for PEST control file

    /*========================================================
    Hover provider for control data and SVD sections
    ========================================================*/

    // #region Hover provider for control data and SVD sections

    const hoverProvider = vscode.languages.registerHoverProvider(
        { scheme: "file" },
        {
            provideHover(document, position) {
                const lines = document.getText().split("\n");
                const sections = detectSections(lines);
                const currentSection = findCurrentSection(sections, position.line);

                if (!isRecognizedSection(currentSection)) {
                    return null;
                }

                const structure = getStructureForSection(currentSection);
                if (!structure || !currentSection) {
                    return null;
                }

                // Ajustamos el índice para que coincida con la estructura de control data
                const relativeLine = position.line - currentSection.start - 1;
                console.log(`Position Line: ${position.line}`);
                console.log(`Section Start: ${currentSection.start}`);
                console.log(`Relative Line (adjusted): ${relativeLine}`);

                // Si el índice es negativo o no hay estructura para esa línea, retornamos null
                if (relativeLine < 0) {
                    console.log('Índice negativo detectado, ignorando línea de encabezado');
                    return null;
                }

                // Seleccionar la estructura correcta según la línea
                let lineStructure;
                if (relativeLine === 0) {
                    lineStructure = [
                        { name: "RSTFLE", required: true, type: "string", order: 1, allowedValues: ["restart", "norestart"] },
                        { name: "PESTMODE", required: true, type: "string", order: 2, allowedValues: ["estimation", "prediction", "regularization", "regularisation", "pareto"] }
                    ];
                } else if (relativeLine === 1) {
                    lineStructure = [
                        { name: "NPAR", required: true, type: "integer", order: 1 },
                        { name: "NOBS", required: true, type: "integer", order: 2 },
                        { name: "NPARGP", required: true, type: "integer", order: 3 },
                        { name: "NPRIOR", required: true, type: "integer", order: 4 },
                        { name: "NOBSGP", required: true, type: "integer", order: 5 },
                        { name: "MAXCOMPDIM", required: false, type: "integer" },
                        { name: "DERZEROLIM", required: false, type: "float" }
                    ];
                } else if (relativeLine === 2) {
                    // Line 4: NTPLFLE  NINSFLE  PRECIS  DPOINT [NUMCOM JACFILE MESSFILE] [OBSREREF]
                    lineStructure = [
                        // Required variables
                        { name: "NTPLFLE", required: true, type: "integer", order: 1 },
                        { name: "NINSFLE", required: true, type: "integer", order: 2 },
                        { name: "PRECIS", required: true, type: "string", order: 3, allowedValues: ["single", "double"] },
                        { name: "DPOINT", required: true, type: "string", order: 4, allowedValues: ["point", "nopoint"] },
                        // Optional variables - numeric
                        { name: "NUMCOM", required: false, type: "integer" },
                        { name: "JACFILE", required: false, type: "integer", allowedValues: ["0", "1", "-1"] },
                        { name: "MESSFILE", required: false, type: "integer", allowedValues: ["0", "1"] },
                        // Optional variables - string
                        { name: "OBSREREF", required: false, type: "string", allowedValues: ["obsreref", "obsreref_N", "noobsreref"] }
                    ];
                } else if (relativeLine === 3) {
                    // Line 5: RLAMBDA1  RLAMFAC  PHIRATSUF  PHIREDLAM  NUMLAM [JACUPDATE] [LAMFORGIVE] [DERFORGIVE]
                    lineStructure = [
                        // Required variables
                        { name: "RLAMBDA1", required: true, type: "float", order: 1 },
                        { name: "RLAMFAC", required: true, type: "float", order: 2 },
                        { name: "PHIRATSUF", required: true, type: "float", order: 3 },
                        { name: "PHIREDLAM", required: true, type: "float", order: 4 },
                        { name: "NUMLAM", required: true, type: "integer", order: 5 },
                        // Optional variables - numeric
                        { name: "JACUPDATE", required: false, type: "integer" },
                        // Optional variables - string
                        { name: "LAMFORGIVE", required: false, type: "string", allowedValues: ["lamforgive", "nolamforgive"] },
                        { name: "DERFORGIVE", required: false, type: "string", allowedValues: ["derforgive", "noderforgive"] }
                    ];
                } else if (relativeLine === 4) {
                    // Line 6: RELPARMAX  FACPARMAX  FACORIG [IBOUNDSTICK UPVECBEND] [ABSPARMAX]
                    lineStructure = [
                        // Required variables
                        { name: "RELPARMAX", required: true, type: "float", order: 1 },
                        { name: "FACPARMAX", required: true, type: "float", order: 2 },
                        { name: "FACORIG", required: true, type: "float", order: 3 },
                        // Optional variables - all numeric
                        { name: "IBOUNDSTICK", required: false, type: "integer" },
                        { name: "UPVECBEND", required: false, type: "integer", allowedValues: ["0", "1"] },
                        { name: "ABSPARMAX", required: false, type: "float" }
                    ];
                } else if (relativeLine === 5) {
                    // Line 7: PHIREDSWH [NOPTSWITCH] [SPLITSWH] [DOAUI] [DOSENREUSE] [BOUNDSCALE]
                    lineStructure = [
                        // Required variable first - PHIREDSWH (float)
                        { name: "PHIREDSWH", required: true, type: "float", order: 1 },
                        // Process optional variables
                        { name: "NOPTSWITCH", required: false, type: "integer", order: 2 },
                        { name: "SPLITSWH", required: false, type: "float", order: 3 },
                        { name: "DOAUI", required: false, type: "string", order: 4, allowedValues: ["aui", "auid", "noaui"] },
                        { name: "DOSENREUSE", required: false, type: "string", order: 5, allowedValues: ["senreuse", "nosenreuse"] },
                        { name: "BOUNDSCALE", required: false, type: "string", order: 6, allowedValues: ["boundscale", "noboundscale"] }
                    ];
                } else if (relativeLine === 6) {
                    // Line 8: NOPTMAX PHIREDSTP NPHISTP NPHINORED RELPARSTP NRELPAR [PHISTOPTHRESH] [LASTRUN] [PHIABANDON]
                    lineStructure = [
                        // Required variables
                        { name: "NOPTMAX", required: true, type: "integer", order: 1 },
                        { name: "PHIREDSTP", required: true, type: "float", order: 2 },
                        { name: "NPHISTP", required: true, type: "integer", order: 3 },
                        { name: "NPHINORED", required: true, type: "integer", order: 4 },
                        { name: "RELPARSTP", required: true, type: "float", order: 5 },
                        { name: "NRELPAR", required: true, type: "integer", order: 6 },
                        // Optional variables
                        { name: "PHISTOPTHRESH", required: false, type: "float" },
                        { name: "LASTRUN", required: false, type: "integer", allowedValues: ["0", "1"] },
                        { name: "PHIABANDON", required: false, type: "float" }
                    ];
                } else if (relativeLine === 7) {
                    // Line 9: ICOV ICOR IEIG [IRES] [JCOSAVE] [VERBOSEREC] [JCOSAVEITN] [REISAVEITN] [PARSAVEITN] [PARSAVERUN]
                    lineStructure = [
                        // Required variables
                        { name: "ICOV", required: true, type: "integer", order: 1, allowedValues: ["0", "1"] },
                        { name: "ICOR", required: true, type: "integer", order: 2, allowedValues: ["0", "1"] },
                        { name: "IEIG", required: true, type: "integer", order: 3, allowedValues: ["0", "1"] },
                        // Optional variables
                        { name: "IRES", required: false, type: "integer", allowedValues: ["0", "1"] },
                        { name: "JCOSAVE", required: false, type: "string", allowedValues: ["jcosave", "nojcosave"] },
                        { name: "VERBOSEREC", required: false, type: "string", allowedValues: ["verboserec", "noverboserec"] },
                        { name: "JCOSAVEITN", required: false, type: "string", allowedValues: ["jcosaveitn", "nojcosaveitn"] },
                        { name: "REISAVEITN", required: false, type: "string", allowedValues: ["reisaveitn", "noreisaveitn"] },
                        { name: "PARSAVEITN", required: false, type: "string", allowedValues: ["parsaveitn", "noparsaveitn"] },
                        { name: "PARSAVERUN", required: false, type: "string", allowedValues: ["parsaverun", "noparsaverun"] }
                    ];
                }

                const indexline = relativeLine;

                if (!lineStructure) {
                    console.log('No se encontró estructura para la línea');
                    return null;
                }

                const line = document.lineAt(position.line).text.trim();
                const values = line.split(/\s+/);

                console.log(`Línea ${indexline}: ${line}`);
                console.log(`Valores detectados: ${values.join(", ")}`);

                // Usar el nuevo parser según el tipo de línea
                const parsedVariables = parseLineByIndex(indexline, line, values, lineStructure);
                if (!parsedVariables) {
                    return null;
                }

                // Obtener la palabra bajo el cursor
                const wordRange = document.getWordRangeAtPosition(position, /[^\s]+/);
                if (!wordRange) {
                    return null;
                }

                const hoveredWord = document.getText(wordRange);
                const lineUpToCursor = document.getText(
                    new vscode.Range(position.line, 0, position.line, position.character)
                );
                const wordsBeforeCursor = lineUpToCursor.trimStart().split(/\s+/);
                const occurrence = wordsBeforeCursor.filter(w => w === hoveredWord).length;

                // Encontrar la variable correspondiente
                const matchedVariable = findMatchingVariable(parsedVariables, hoveredWord, occurrence);
                if (!matchedVariable) {
                    return createUndefinedVariableHover();
                }

                // Generar el hover para la variable
                return createVariableHover(matchedVariable, lineStructure);
            }
        }
    );

    // Funciones auxiliares
    function detectSections(lines: string[]): Section[] {
        const sections: Section[] = [];
        lines.forEach((line, index) => {
            const trimmed = line.trim().toLowerCase();
            if (trimmed.startsWith("*")) {
                sections.push({
                    parent: trimmed.substring(1).trim(),
                    start: index,
                    end: lines.findIndex((l, i) => i > index && l.trim().startsWith("*")) || lines.length
                });
            }
        });
        return sections;
    }

    function findCurrentSection(sections: Section[], line: number): Section | null {
        return sections.find(section => line > section.start && line < section.end) || null;
    }

    function isRecognizedSection(section: Section | null): boolean {
        return section?.parent === "control data" || section?.parent === "singular value decomposition";
    }

    function getStructureForSection(section: Section | null): any[] | null {
        if (!section) {
                        return null;
                    }
        return section.parent === "control data" ? controlDataStructure : svdDataStructure;
    }

    function parseLineByIndex(
        indexline: number,
        line: string,
        values: string[],
        structure: any[]
    ): ParsedVariable[] | null {
        console.log('\n=== Control Data Line Parsing ===');
        console.log(`Line Index: ${indexline}`);
        console.log(`Raw Line: "${line}"`);
        console.log(`Tokens: [${values.join(', ')}]`);

        const mapped: ParsedVariable[] = [];
        
        // Line 2: RSTFLE PESTMODE
        if (indexline === 0) {
            if (values.length >= 2) {
                // RSTFLE
                const rstfle = values[0];
                const validRstfle = validateType(rstfle, "string", ["restart", "norestart"]);
                mapped.push({
                    name: "RSTFLE",
                    value: rstfle,
                    valid: validRstfle,
                    id: 1
                });

                // PESTMODE
                const pestmode = values[1];
                const validPestmode = validateType(pestmode, "string", ["estimation", "prediction", "regularization", "regularisation", "pareto"]);
                mapped.push({
                    name: "PESTMODE",
                    value: pestmode,
                    valid: validPestmode,
                    id: 1
                });
            }
        }
        // Line 3: NPAR NOBS NPARGP NPRIOR NOBSGP [MAXCOMPDIM] [DERZEROLIM]
        else if (indexline === 1) {
            // Required variables (all integers)
            const requiredNames = ["NPAR", "NOBS", "NPARGP", "NPRIOR", "NOBSGP"];
            for (let i = 0; i < requiredNames.length && i < values.length; i++) {
                const valid = validateType(values[i], "integer");
                mapped.push({
                    name: requiredNames[i],
                    value: values[i],
                    valid: valid,
                    id: 1
                });
            }

            // Optional variables
            if (values.length > 5) {
                // MAXCOMPDIM (integer)
                if (validateType(values[5], "integer")) {
                    mapped.push({
                        name: "MAXCOMPDIM",
                        value: values[5],
                                valid: true,
                        id: 1
                    });
                }
                
                // DERZEROLIM (float)
                if (values.length > 6 && validateType(values[6], "float")) {
                    mapped.push({
                        name: "DERZEROLIM",
                        value: values[6],
                        valid: true,
                        id: 1
                    });
                }
            }

            // Mark missing optional variables
            if (!mapped.some(v => v.name === "MAXCOMPDIM")) {
                mapped.push({
                    name: "MAXCOMPDIM",
                    value: "MISSING",
                    valid: true,
                    id: 1
                });
            }
            if (!mapped.some(v => v.name === "DERZEROLIM")) {
                mapped.push({
                    name: "DERZEROLIM",
                    value: "MISSING",
                    valid: true,
                    id: 1
                });
            }
        }
        // Line 4: NTPLFLE NINSFLE PRECIS DPOINT [NUMCOM JACFILE MESSFILE] [OBSREREF]
        else if (indexline === 2) {
            console.log("Processing line 4 (NTPLFLE NINSFLE PRECIS DPOINT)");
            
            // Required variables first
            if (values.length >= 4) {
                // NTPLFLE (integer)
                mapped.push({
                    name: "NTPLFLE",
                    value: values[0],
                    valid: validateType(values[0], "integer"),
                    id: 1
                });

                // NINSFLE (integer)
                mapped.push({
                    name: "NINSFLE",
                    value: values[1],
                    valid: validateType(values[1], "integer"),
                    id: 1
                });

                // PRECIS (string)
                mapped.push({
                    name: "PRECIS",
                    value: values[2],
                    valid: validateType(values[2], "string", ["single", "double"]),
                    id: 1
                });

                // DPOINT (string)
                mapped.push({
                    name: "DPOINT",
                    value: values[3],
                    valid: validateType(values[3], "string", ["point", "nopoint"]),
                    id: 1
                });

                // Process optional variables
                let remainingValues = values.slice(4);
                let numericOptionalsAssigned = 0;
                
                remainingValues.forEach(value => {
                    if (validateType(value, "integer")) {
                        // Assign to numeric optionals in order: NUMCOM, JACFILE, MESSFILE
                        if (numericOptionalsAssigned === 0) {
                            mapped.push({
                                name: "NUMCOM",
                                value: value,
                                valid: true,
                                id: 1
                            });
                            numericOptionalsAssigned++;
                        } else if (numericOptionalsAssigned === 1 && validateType(value, "integer", ["0", "1", "-1"])) {
                            mapped.push({
                                name: "JACFILE",
                                value: value,
                                valid: true,
                                id: 1
                            });
                            numericOptionalsAssigned++;
                        } else if (numericOptionalsAssigned === 2 && validateType(value, "integer", ["0", "1"])) {
                            mapped.push({
                                name: "MESSFILE",
                                value: value,
                                valid: true,
                                id: 1
                            });
                            numericOptionalsAssigned++;
                        }
                    } else if (validateType(value, "string", ["obsreref", "obsreref_N", "noobsreref"]) && 
                             !mapped.some(v => v.name === "OBSREREF")) {
                        mapped.push({
                            name: "OBSREREF",
                            value: value,
                            valid: true,
                            id: 1
                        });
                    }
                });
            }

            // Mark missing optional variables
            const optionalVars = ["NUMCOM", "JACFILE", "MESSFILE", "OBSREREF"];
            optionalVars.forEach(name => {
                if (!mapped.some(v => v.name === name)) {
                    mapped.push({
                        name: name,
                        value: "MISSING",
                        valid: true,
                        id: 1
                    });
                }
            });
        }
        // Line 5: RLAMBDA1 RLAMFAC PHIRATSUF PHIREDLAM NUMLAM [JACUPDATE] [LAMFORGIVE] [DERFORGIVE]
        else if (indexline === 3) {
            console.log("Processing line 5 (indexline 3)");
            
            // Required variables first
            if (values.length >= 5) {
                // RLAMBDA1 (float)
                mapped.push({
                    name: "RLAMBDA1",
                    value: values[0],
                    valid: validateType(values[0], "float"),
                    id: 1
                });

                // RLAMFAC (float)
                mapped.push({
                    name: "RLAMFAC",
                    value: values[1],
                    valid: validateType(values[1], "float"),
                    id: 1
                });

                // PHIRATSUF (float)
                mapped.push({
                    name: "PHIRATSUF",
                    value: values[2],
                    valid: validateType(values[2], "float"),
                    id: 1
                });

                // PHIREDLAM (float)
                mapped.push({
                    name: "PHIREDLAM",
                    value: values[3],
                    valid: validateType(values[3], "float"),
                    id: 1
                });

                // NUMLAM (integer)
                mapped.push({
                    name: "NUMLAM",
                    value: values[4],
                    valid: validateType(values[4], "integer"),
                    id: 1
                });

                // Optional variables
                let remainingValues = values.slice(5);
                remainingValues.forEach(value => {
                    // JACUPDATE (integer)
                    if (validateType(value, "integer") && !mapped.some(v => v.name === "JACUPDATE")) {
                        mapped.push({
                            name: "JACUPDATE",
                            value: value,
                            valid: true,
                            id: 1
                        });
                    }
                    // LAMFORGIVE (string)
                    else if (value.toLowerCase() === "lamforgive" && !mapped.some(v => v.name === "LAMFORGIVE")) {
                        mapped.push({
                            name: "LAMFORGIVE",
                            value: value,
                            valid: true,
                            id: 1
                        });
                    }
                    // DERFORGIVE (string)
                    else if (value.toLowerCase() === "derforgive" && !mapped.some(v => v.name === "DERFORGIVE")) {
                        mapped.push({
                            name: "DERFORGIVE",
                            value: value,
                            valid: true,
                            id: 1
                        });
                    }
                });
            }

            // Mark missing optional variables
            ["JACUPDATE", "LAMFORGIVE", "DERFORGIVE"].forEach(name => {
                if (!mapped.some(v => v.name === name)) {
                    mapped.push({
                        name: name,
                        value: "MISSING",
                        valid: true,
                        id: 1
                    });
                }
            });
        }
        // Line 6: RELPARMAX FACPARMAX FACORIG [IBOUNDSTICK UPVECBEND] [ABSPARMAX]
        else if (indexline === 4) {
            console.log("Processing line 6 (indexline 4)");
            
            // Required variables first
            if (values.length >= 3) {
                // RELPARMAX (float)
                mapped.push({
                    name: "RELPARMAX",
                    value: values[0],
                    valid: validateType(values[0], "float"),
                    id: 1
                });

                // FACPARMAX (float)
                mapped.push({
                    name: "FACPARMAX",
                    value: values[1],
                    valid: validateType(values[1], "float"),
                    id: 1
                });

                // FACORIG (float)
                mapped.push({
                    name: "FACORIG",
                    value: values[2],
                    valid: validateType(values[2], "float"),
                    id: 1
                });

                // Optional variables
                let remainingValues = values.slice(3);
                remainingValues.forEach(value => {
                    // IBOUNDSTICK (integer)
                    if (validateType(value, "integer") && !mapped.some(v => v.name === "IBOUNDSTICK")) {
                        mapped.push({
                            name: "IBOUNDSTICK",
                            value: value,
                            valid: true,
                            id: 1
                        });
                    }
                    // UPVECBEND (integer, 0 or 1)
                    else if (validateType(value, "integer", ["0", "1"]) && !mapped.some(v => v.name === "UPVECBEND")) {
                        mapped.push({
                            name: "UPVECBEND",
                            value: value,
                            valid: true,
                            id: 1
                        });
                    }
                    // ABSPARMAX (float)
                    else if (validateType(value, "float") && !mapped.some(v => v.name === "ABSPARMAX")) {
                        mapped.push({
                            name: "ABSPARMAX",
                            value: value,
                            valid: true,
                            id: 1
                        });
                    }
                });
            }

            // Mark missing optional variables
            ["IBOUNDSTICK", "UPVECBEND", "ABSPARMAX"].forEach(name => {
                if (!mapped.some(v => v.name === name)) {
                    mapped.push({
                        name: name,
                        value: "MISSING",
                        valid: true,
                        id: 1
                    });
                }
            });
        }
        // Line 7: PHIREDSWH [NOPTSWITCH] [SPLITSWH] [DOAUI] [DOSENREUSE] [BOUNDSCALE]
        else if (indexline === 5) {
            console.log("Processing line 7 (PHIREDSWH and optional variables)");
            
            // Required variable first - PHIREDSWH (float)
            if (values.length >= 1) {
                mapped.push({
                    name: "PHIREDSWH",
                    value: values[0],
                    valid: validateType(values[0], "float"),
                    id: 1
                });

                // Process optional variables
                let remainingValues = values.slice(1);
                remainingValues.forEach(value => {
                    // NOPTSWITCH (integer)
                    if (validateType(value, "integer") && !mapped.some(v => v.name === "NOPTSWITCH")) {
                        mapped.push({
                            name: "NOPTSWITCH",
                            value: value,
                            valid: true,
                            id: 1
                        });
                    }
                    // SPLITSWH (float)
                    else if (validateType(value, "float") && !mapped.some(v => v.name === "SPLITSWH")) {
                        mapped.push({
                            name: "SPLITSWH",
                            value: value,
                            valid: true,
                            id: 1
                        });
                    }
                    // DOAUI (string)
                    else if (validateType(value, "string", ["aui", "auid", "noaui"]) && !mapped.some(v => v.name === "DOAUI")) {
                        mapped.push({
                            name: "DOAUI",
                            value: value,
                            valid: true,
                            id: 1
                        });
                    }
                    // DOSENREUSE (string)
                    else if (validateType(value, "string", ["senreuse", "nosenreuse"]) && !mapped.some(v => v.name === "DOSENREUSE")) {
                        mapped.push({
                            name: "DOSENREUSE",
                            value: value,
                            valid: true,
                            id: 1
                        });
                    }
                    // BOUNDSCALE (string)
                    else if (validateType(value, "string", ["boundscale", "noboundscale"]) && !mapped.some(v => v.name === "BOUNDSCALE")) {
                        mapped.push({
                            name: "BOUNDSCALE",
                            value: value,
                            valid: true,
                            id: 1
                        });
                    }
                });
            }

            // Mark missing optional variables
            const optionalVars = ["NOPTSWITCH", "SPLITSWH", "DOAUI", "DOSENREUSE", "BOUNDSCALE"];
            optionalVars.forEach(name => {
                if (!mapped.some(v => v.name === name)) {
                    mapped.push({
                        name: name,
                        value: "MISSING",
                        valid: true,
                        id: 1
                    });
                }
            });
        }
        // Line 8: NOPTMAX PHIREDSTP NPHISTP NPHINORED RELPARSTP NRELPAR [PHISTOPTHRESH] [LASTRUN] [PHIABANDON]
        else if (indexline === 6) {
            console.log("Processing line 8 (NOPTMAX and optimization parameters)");
            
            // Required variables first
            if (values.length >= 6) {
                // NOPTMAX (integer)
                mapped.push({
                    name: "NOPTMAX",
                    value: values[0],
                    valid: validateType(values[0], "integer"),
                    id: 1
                });

                // PHIREDSTP (float)
                mapped.push({
                    name: "PHIREDSTP",
                    value: values[1],
                    valid: validateType(values[1], "float"),
                    id: 1
                });

                // NPHISTP (integer)
                mapped.push({
                    name: "NPHISTP",
                    value: values[2],
                    valid: validateType(values[2], "integer"),
                    id: 1
                });

                // NPHINORED (integer)
                mapped.push({
                    name: "NPHINORED",
                    value: values[3],
                    valid: validateType(values[3], "integer"),
                    id: 1
                });

                // RELPARSTP (float)
                mapped.push({
                    name: "RELPARSTP",
                    value: values[4],
                    valid: validateType(values[4], "float"),
                    id: 1
                });

                // NRELPAR (integer)
                mapped.push({
                    name: "NRELPAR",
                    value: values[5],
                    valid: validateType(values[5], "integer"),
                    id: 1
                });

                // Process optional variables
                let remainingValues = values.slice(6);
                remainingValues.forEach(value => {
                    // PHISTOPTHRESH (float)
                    if (validateType(value, "float") && !mapped.some(v => v.name === "PHISTOPTHRESH")) {
                        mapped.push({
                            name: "PHISTOPTHRESH",
                            value: value,
                            valid: true,
                            id: 1
                        });
                    }
                    // LASTRUN (integer, 0 or 1)
                    else if (validateType(value, "integer", ["0", "1"]) && !mapped.some(v => v.name === "LASTRUN")) {
                        mapped.push({
                            name: "LASTRUN",
                            value: value,
                            valid: true,
                            id: 1
                        });
                    }
                    // PHIABANDON (float or filename)
                    else if (!mapped.some(v => v.name === "PHIABANDON")) {
                        mapped.push({
                            name: "PHIABANDON",
                            value: value,
                            valid: true,
                            id: 1
                        });
                    }
                });
            }

            // Mark missing optional variables
            const optionalVars = ["PHISTOPTHRESH", "LASTRUN", "PHIABANDON"];
            optionalVars.forEach(name => {
                if (!mapped.some(v => v.name === name)) {
                    mapped.push({
                        name: name,
                        value: "MISSING",
                        valid: true,
                        id: 1
                    });
                }
            });
        }
        // Line 9: ICOV ICOR IEIG [IRES] [JCOSAVE] [VERBOSEREC] [JCOSAVEITN] [REISAVEITN] [PARSAVEITN] [PARSAVERUN]
        else if (indexline === 7) {
            console.log("Processing line 9 (ICOV and matrix file options)");
            
            // Required variables first
            if (values.length >= 3) {
                // ICOV (integer)
                mapped.push({
                    name: "ICOV",
                    value: values[0],
                    valid: validateType(values[0], "integer", ["0", "1"]),
                    id: 1
                });

                // ICOR (integer)
                mapped.push({
                    name: "ICOR",
                    value: values[1],
                    valid: validateType(values[1], "integer", ["0", "1"]),
                    id: 1
                });

                // IEIG (integer)
                mapped.push({
                    name: "IEIG",
                    value: values[2],
                    valid: validateType(values[2], "integer", ["0", "1"]),
                    id: 1
                });

                // Process optional variables
                let remainingValues = values.slice(3);
                remainingValues.forEach(value => {
                    // IRES (integer)
                    if (validateType(value, "integer", ["0", "1"]) && !mapped.some(v => v.name === "IRES")) {
                        mapped.push({
                            name: "IRES",
                            value: value,
                            valid: true,
                            id: 1
                        });
                    }
                    // JCOSAVE (string)
                    else if (validateType(value, "string", ["jcosave", "nojcosave"]) && !mapped.some(v => v.name === "JCOSAVE")) {
                        mapped.push({
                            name: "JCOSAVE",
                            value: value,
                            valid: true,
                            id: 1
                        });
                    }
                    // VERBOSEREC (string)
                    else if (validateType(value, "string", ["verboserec", "noverboserec"]) && !mapped.some(v => v.name === "VERBOSEREC")) {
                        mapped.push({
                            name: "VERBOSEREC",
                            value: value,
                            valid: true,
                            id: 1
                        });
                    }
                    // JCOSAVEITN (string)
                    else if (validateType(value, "string", ["jcosaveitn", "nojcosaveitn"]) && !mapped.some(v => v.name === "JCOSAVEITN")) {
                        mapped.push({
                            name: "JCOSAVEITN",
                            value: value,
                            valid: true,
                            id: 1
                        });
                    }
                    // REISAVEITN (string)
                    else if (validateType(value, "string", ["reisaveitn", "noreisaveitn"]) && !mapped.some(v => v.name === "REISAVEITN")) {
                        mapped.push({
                            name: "REISAVEITN",
                            value: value,
                            valid: true,
                            id: 1
                        });
                    }
                    // PARSAVEITN (string)
                    else if (validateType(value, "string", ["parsaveitn", "noparsaveitn"]) && !mapped.some(v => v.name === "PARSAVEITN")) {
                        mapped.push({
                            name: "PARSAVEITN",
                            value: value,
                            valid: true,
                            id: 1
                        });
                    }
                    // PARSAVERUN (string)
                    else if (validateType(value, "string", ["parsaverun", "noparsaverun"]) && !mapped.some(v => v.name === "PARSAVERUN")) {
                        mapped.push({
                            name: "PARSAVERUN",
                            value: value,
                            valid: true,
                            id: 1
                        });
                    }
                });
            }

            // Mark missing optional variables
            const optionalVars = ["IRES", "JCOSAVE", "VERBOSEREC", "JCOSAVEITN", "REISAVEITN", "PARSAVEITN", "PARSAVERUN"];
            optionalVars.forEach(name => {
                if (!mapped.some(v => v.name === name)) {
                    mapped.push({
                        name: name,
                        value: "MISSING",
                        valid: true,
                        id: 1
                        });
                    }
                });
        }
        // Add more specific line handlers here...

        console.log('\nFinal Parsed Variables:');
        mapped.forEach(v => {
            console.log(`  ${v.name}: Value="${v.value}", Valid=${v.valid}, ID=${v.id}`);
        });

        return mapped;
    }

    function findMatchingVariable(
        variables: ParsedVariable[],
        word: string,
        occurrence: number
    ): ParsedVariable | null {
        console.log('\n=== Finding Matching Variable ===');
        console.log(`Looking for: Word="${word}", Occurrence=${occurrence}`);
        
        let count = 0;
        const found = variables.find(v => {
            console.log(`  Checking ${v.name}: Value="${v.value}", Current count=${count}`);
            if (v.value === word) {
                console.log(`    Match found! Is it the right occurrence? ${count === occurrence}`);
                const isMatch = count === occurrence;
                if (!isMatch) count++;
                return isMatch;
            }
            return false;
        });

        console.log(`Result: ${found ? `Found ${found.name} at occurrence ${occurrence}` : 'No match found'}`);
        return found || null;
    }

    function createUndefinedVariableHover(): vscode.Hover {
                        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;
                        markdown.appendMarkdown(`### ⚠️ Undefined Variable\n\n`);
                        markdown.appendMarkdown(`🔍 Recommend running PestCheck to validate the file\n\n`);
                        markdown.appendMarkdown(`[Run PestCheck](command:pestd3code.runPestCheck)`);
                        return new vscode.Hover(markdown);
                    }

    function createVariableHover(variable: ParsedVariable, structure: any[]): vscode.Hover | null {
        console.log('\n=== Creating Hover Content ===');
        console.log(`Variable: ${variable.name}, Value="${variable.value}", Valid=${variable.valid}`);

        const varStructure = structure.find((v: { name: string; type: string; description?: string; required: boolean; allowedValues?: string[] }) => v.name === variable.name);
        if (!varStructure) {
            console.log('No structure found for variable');
            return null;
        }

        console.log('Structure found:');
        console.log(`  Type: ${varStructure.type}`);
        console.log(`  Required: ${varStructure.required}`);
        console.log(`  Has Description: ${!!varStructure.description}`);
        console.log(`  Has Allowed Values: ${!!varStructure.allowedValues}`);

        // Verificar si el valor es válido para variables opcionales con allowedValues
        let isValidValue = true;
        if (variable.value !== "MISSING" && varStructure.allowedValues) {
            isValidValue = varStructure.allowedValues.includes(variable.value);
            console.log(`Checking optional value validity: ${isValidValue}`);
        }

        const markdown = new vscode.MarkdownString();
        markdown.appendMarkdown(
            `### 🏷️ Variable: **${varStructure.name}**\n\n` +
            `📖 **Description:** ${varStructure.description || "No description available"}\n\n` +
            `📐 **Type:** \`${varStructure.type}\`\n\n` +
            (varStructure.allowedValues
                ? `🔢 **Allowed Values:** ${varStructure.allowedValues.map((v: any) => `\`${v}\``).join(", ")}\n\n`
                : "") +
            `❓ **Required:** ${varStructure.required ? "Yes" : "No"}`
        );

        // Mostrar warning para variables inválidas (requeridas u opcionales)
        if (!variable.valid || !isValidValue) {
            console.log('Adding invalid value warning');
            markdown.appendMarkdown(
                `\n\n⚠️ **Invalid Value:** \`${variable.value}\` does not satisfy the requirements.`
            );
        }

        return new vscode.Hover(markdown);
    }

    function validateType(value: string, type: string, allowedValues?: string[]): boolean {
        console.log(`Validating Type: Value="${value}", Type=${type}`);
        if (allowedValues) {
            console.log(`  Allowed Values: [${allowedValues.join(", ")}]`);
        }
        
        if (type === "integer") {
            const isInteger = /^-?\d+$/.test(value);
            console.log(`  Integer validation result: ${isInteger}`);
            return isInteger;
        } else if (type === "float") {
            const isFloat = /^-?\d*\.?\d+$/.test(value);
            console.log(`  Float validation result: ${isFloat}`);
            return isFloat;
        } else if (type === "string") {
            if (allowedValues && allowedValues.length > 0) {
                const isValid = allowedValues.includes(value.toLowerCase());
                console.log(`  String validation against allowed values: ${isValid}`);
                return isValid;
            }
            console.log(`  String validation: true (no allowed values specified)`);
            return true;
        }
        
        console.log(`  Validation result: false (unknown type)`);
        return false;
    }

    interface Section {
        parent: string;
        start: number;
        end: number;
    }

    interface ParsedVariable {
        name: string;
        value: string;
        valid: boolean;
        id: number;
    }

    function isNumeric(value: string): boolean {
        return !isNaN(Number(value));
    }

    // #endregion Hover provider for control data and SVD sections

    /*========================================================
    CodeLens and Hover for Parameter Groups, Parameter Data, Observation Groups, Observation Data and Prior Information
    ========================================================*/

    // #region Parameter Groups CodeLens and Hover
    function parseParameterGroups(document: vscode.TextDocument) {
        const headers = [
            "PARGPNME",
            "INCTYP",
            "DERINC",
            "DERINCLB",
            "FORCEN",
            "DERINCMUL",
            "DERMTHD",
            "SPLITTHRESH",
            "SPLITRELDIFF",
            "SPLITACTION",
        ];

        const lines = document.getText().split("\n");
        const allRanges: { range: vscode.Range; header: string }[] = [];
        let inParameterGroups = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // Detectar la sección "* parameter groups"
            if (trimmedLine.startsWith("* parameter groups")) {
                inParameterGroups = true;
                continue;
            }

            // Procesar todas las líneas de datos dentro de "* parameter groups"
            if (inParameterGroups) {
                // Terminar la sección si encontramos * o ++
                if (trimmedLine.startsWith("*") || trimmedLine.startsWith("++")) {
                    inParameterGroups = false;
                    continue;
                }

                // Encuentra las posiciones de todas las palabras en la línea
                const columnPositions = Array.from(line.matchAll(/\S+/g));
                const words = trimmedLine.split(/\s+/);

                words.forEach((word, index) => {
                    // Mapea la palabra al índice correcto
                    if (headers[index] && columnPositions[index]) {
                        const startIndex = columnPositions[index].index!;
                        const endIndex = startIndex + word.length;

                        const wordRange = new vscode.Range(
                            new vscode.Position(i, startIndex),
                            new vscode.Position(i, endIndex)
                        );

                        allRanges.push({ range: wordRange, header: headers[index] });
                    }
                });
            }
        }

        return allRanges;
    }

    const parameterGroupsHoverProvider = vscode.languages.registerHoverProvider(
        { scheme: "file", pattern: "**/*.{pst}" },
        {
            provideHover(document, position): vscode.ProviderResult<vscode.Hover> {
                const ranges = parseParameterGroups(document);

                for (const { range, header } of ranges) {
                    if (range.contains(position)) {
                        return new vscode.Hover(new vscode.MarkdownString(`${header}`));
                    }
                }

                return null; // Asegura que se devuelve un valor en todos los caminos
            },
        }
    );

    // Nueva función para obtener solo los rangos de la primera línea
    function getFirstRowRangesGroups(document: vscode.TextDocument) {
        const allRanges = parseParameterGroups(document);
        const firstLineRanges = allRanges.filter(
            ({ range }) => range.start.line === allRanges[0]?.range.start.line
        );
        return firstLineRanges;
    }

    const parameterGroupsCodeLensProvider =
        vscode.languages.registerCodeLensProvider(
            { scheme: "file", pattern: "**/*.{pst}" },
            {
                provideCodeLenses(document) {
                    const codeLenses: vscode.CodeLens[] = [];
                    const firstRowRanges = getFirstRowRangesGroups(document);

                    if (firstRowRanges.length > 0) {
                        firstRowRanges.forEach(({ range, header }) => {
                            const description =
                                descriptions.find((desc) => desc.Variable === header)
                                    ?.Description || "No description available";
                            codeLenses.push(
                                new vscode.CodeLens(range, {
                                    title: header,
                                    command: "", // Si no necesitas que haga nada al clic, deja el comando vacío.
                                    tooltip: `${header} : ${description}`, // Tooltip para cada header.
                                })
                            );
                        });
                    }

                    return codeLenses;
                },
            }
        );

    // #endregion Parameter Groups CodeLens and Hover

    // #region Observation Groups CodeLens and Hover
    function parseObsGroups(document: vscode.TextDocument) {
        const headers = ["OBGNME", "GTARG", "COVFILE"];

        const lines = document.getText().split("\n");
        const allRanges: { range: vscode.Range; header: string }[] = [];
        let inObservationGroups = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // Detectar la sección "* observation groups"
            if (trimmedLine.startsWith("* observation groups")) {
                inObservationGroups = true;
                continue;
            }

            // Procesar todas las líneas de datos dentro de "* observation groups"
            if (inObservationGroups) {
                if (trimmedLine.startsWith("*") || trimmedLine.startsWith("++")) {
                    inObservationGroups = false;
                    continue;
                }

                // Encuentra las posiciones de todas las palabras en la línea
                const columnPositions = Array.from(line.matchAll(/\S+/g));
                const words = trimmedLine.split(/\s+/);

                words.forEach((word, index) => {
                    // Mapea la palabra al índice correcto
                    if (headers[index] && columnPositions[index]) {
                        const startIndex = columnPositions[index].index!;
                        const endIndex = startIndex + word.length;

                        const wordRange = new vscode.Range(
                            new vscode.Position(i, startIndex),
                            new vscode.Position(i, endIndex)
                        );

                        allRanges.push({ range: wordRange, header: headers[index] });
                    }
                });
            }
        }

        return allRanges; // Retornar todos los rangos y headers asociados
    }

    const obsGroupsHoverProvider = vscode.languages.registerHoverProvider(
        { scheme: "file", pattern: "**/*.{pst}" },
        {
            provideHover(document, position): vscode.ProviderResult<vscode.Hover> {
                const ranges = parseObsGroups(document);

                for (const { range, header } of ranges) {
                    if (range.contains(position)) {
                        return new vscode.Hover(new vscode.MarkdownString(`${header}`));
                    }
                }

                return null; // Asegura que se devuelve un valor en todos los caminos
            },
        }
    );

    // Nueva función para obtener solo los rangos de la primera línea
    function getFirstRowRangesObsGroups(document: vscode.TextDocument) {
        const allRanges = parseObsGroups(document);
        const firstLineRanges = allRanges.filter(
            ({ range }) => range.start.line === allRanges[0]?.range.start.line
        );
        return firstLineRanges;
    }

    const obsGroupsCodeLensProvider = vscode.languages.registerCodeLensProvider(
        { scheme: "file", pattern: "**/*.{pst}" },
        {
            provideCodeLenses(document) {
                const codeLenses: vscode.CodeLens[] = [];
                const firstRowRanges = getFirstRowRangesObsGroups(document);

                if (firstRowRanges.length > 0) {
                    firstRowRanges.forEach(({ range, header }) => {
                        const description =
                            descriptions.find((desc) => desc.Variable === header)
                                ?.Description || "No description available";
                        codeLenses.push(
                            new vscode.CodeLens(range, {
                                title: header,
                                command: "", // Si no necesitas que haga nada al clic, deja el comando vacío.
                                tooltip: `${header} : ${description}`, // Tooltip para cada header.
                            })
                        );
                    });
                }

                return codeLenses;
            },
        }
    );

    // #endregion Parameter Groups CodeLens and Hover

    // #region Parameter Data CodeLens and Hover
    function parseParameterData(document: vscode.TextDocument) {
        const headers = [
            "PARNME",
            "PARTRANS",
            "PARCHGLIM",
            "PARVAL1",
            "PARLBND",
            "PARUBND",
            "PARGP",
            "SCALE",
            "OFFSET",
            "DERCOM",
            "PARTIED",
        ];

        const lines = document.getText().split("\n");
        const allRanges: { range: vscode.Range; header: string }[] = [];
        let inParameterData = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = lines[i].trim();

            // Detectar la sección "* parameter data"
            if (trimmedLine.startsWith("* parameter data")) {
                inParameterData = true;
                continue;
            }

            // Procesar todas las líneas de datos dentro de "* parameter data"
            if (inParameterData) {
                if (trimmedLine.startsWith("*") || trimmedLine.startsWith("++")) {
                    inParameterData = false;
                    continue;
                }

                // Divide la línea por columnas basadas en espacios múltiples
                const columnPositions = Array.from(line.matchAll(/\S+/g)); // Encuentra posiciones de todas las palabras
                const words = trimmedLine.split(/\s+/); // Palabras visibles

                words.forEach((word, index) => {
                    // Mapea la palabra al índice correcto
                    if (headers[index] && columnPositions[index]) {
                        const startIndex = columnPositions[index].index!;
                        const endIndex = startIndex + word.length;

                        const wordRange = new vscode.Range(
                            new vscode.Position(i, startIndex),
                            new vscode.Position(i, endIndex)
                        );

                        allRanges.push({ range: wordRange, header: headers[index] });
                    }
                });
            }
        }

        return allRanges; // Retornar todos los rangos y headers asociados
    }

    const parameterDataHoverProvider = vscode.languages.registerHoverProvider(
        { scheme: "file", pattern: "**/*.{pst}" },
        {
            provideHover(document, position): vscode.ProviderResult<vscode.Hover> {
                const ranges = parseParameterData(document);

                for (const { range, header } of ranges) {
                    if (range.contains(position)) {
                        return new vscode.Hover(new vscode.MarkdownString(`${header}`));
                    }
                }

                return null; // Asegura que se devuelve un valor en todos los caminos
            },
        }
    );

    // Nueva función para obtener solo los rangos de la primera línea
    function getFirstRowRangesData(document: vscode.TextDocument) {
        const allRanges = parseParameterData(document);
        const firstLineRanges = allRanges.filter(
            ({ range }) => range.start.line === allRanges[0]?.range.start.line
        );
        return firstLineRanges;
    }

    const parameterDataCodeLensProvider =
        vscode.languages.registerCodeLensProvider(
            { scheme: "file", pattern: "**/*.{pst}" },
            {
                provideCodeLenses(document) {
                    const codeLenses: vscode.CodeLens[] = [];
                    const firstRowRanges = getFirstRowRangesData(document);

                    if (firstRowRanges.length > 0) {
                        firstRowRanges.forEach(({ range, header }) => {
                            const description =
                                descriptions.find((desc) => desc.Variable === header)
                                    ?.Description || "No description available";
                            codeLenses.push(
                                new vscode.CodeLens(range, {
                                    title: header,
                                    command: "", // Si no necesitas que haga nada al clic, deja el comando vacío.
                                    tooltip: `${header} : ${description}`, // Tooltip para cada header.
                                })
                            );
                        });
                    }

                    return codeLenses;
                },
            }
        );

    // #endregion Parameter Groups CodeLens and Hover

    // #region Observation Data CodeLens and Hover
    function parseObsData(document: vscode.TextDocument) {
        const headers = ["OBSNME", "OBSVAL", "WEIGHT", "OBGNME"];

        const lines = document.getText().split("\n");
        const allRanges: { range: vscode.Range; header: string }[] = [];
        let inObservationData = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // Detectar la sección "* observation data"
            if (trimmedLine.startsWith("* observation data")) {
                inObservationData = true;
                continue;
            }

            // Procesar todas las líneas de datos dentro de "* observation data"
            if (inObservationData) {
                if (trimmedLine.startsWith("*") || trimmedLine.startsWith("++")) {
                    inObservationData = false;
                    continue;
                }

                // Encuentra las posiciones de todas las palabras en la línea
                const columnPositions = Array.from(line.matchAll(/\S+/g)); // Encuentra palabras y sus posiciones
                const words = trimmedLine.split(/\s+/); // Palabras visibles

                words.forEach((word, index) => {
                    // Mapea la palabra al índice correcto
                    if (headers[index] && columnPositions[index]) {
                        const startIndex = columnPositions[index].index!;
                        const endIndex = startIndex + word.length;

                        const wordRange = new vscode.Range(
                            new vscode.Position(i, startIndex),
                            new vscode.Position(i, endIndex)
                        );

                        allRanges.push({ range: wordRange, header: headers[index] });
                    }
                });
            }
        }

        return allRanges; // Retornar todos los rangos y headers asociados
    }

    const obsDataHoverProvider = vscode.languages.registerHoverProvider(
        { scheme: "file", pattern: "**/*.{pst}" },
        {
            provideHover(document, position): vscode.ProviderResult<vscode.Hover> {
                const ranges = parseObsData(document);

                for (const { range, header } of ranges) {
                    if (range.contains(position)) {
                        return new vscode.Hover(new vscode.MarkdownString(`${header}`));
                    }
                }

                return null; // Asegura que se devuelve un valor en todos los caminos
            },
        }
    );

    // Nueva función para obtener solo los rangos de la primera línea
    function getFirstRowRangesObsData(document: vscode.TextDocument) {
        const allRanges = parseObsData(document);
        const firstLineRanges = allRanges.filter(
            ({ range }) => range.start.line === allRanges[0]?.range.start.line
        );
        return firstLineRanges;
    }

    const obsDataCodeLensProvider = vscode.languages.registerCodeLensProvider(
        { scheme: "file", pattern: "**/*.{pst}" },
        {
            provideCodeLenses(document) {
                const codeLenses: vscode.CodeLens[] = [];
                const firstRowRanges = getFirstRowRangesObsData(document);

                if (firstRowRanges.length > 0) {
                    firstRowRanges.forEach(({ range, header }) => {
                        const description =
                            descriptions.find((desc) => desc.Variable === header)
                                ?.Description || "No description available";
                        codeLenses.push(
                            new vscode.CodeLens(range, {
                                title: header,
                                command: "", // Si no necesitas que haga nada al clic, deja el comando vacío.
                                tooltip: `${header} : ${description}`, // Tooltip para cada header.
                            })
                        );
                    });
                }

                return codeLenses;
            },
        }
    );

    // #endregion Parameter Groups CodeLens and Hover

    // #region Prior Information CodeLens and Hover
    function parsePriorInformation(document: vscode.TextDocument) {
        const headers = ["PILBL", "PIFAC", "PARNME", "PIVAL", "WEIGHT", "OBGNME"];
        const lines = document.getText().split("\n");
        const allRanges: { range: vscode.Range; header: string }[] = [];
        let inPriorInformation = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // Detectar la sección "* prior information"
            if (trimmedLine.startsWith("* prior information")) {
                inPriorInformation = true;
                continue;
            }

            // Procesar todas las líneas de datos dentro de "* prior information"
            if (inPriorInformation) {
                // Terminar la sección si encontramos * o ++
                if (trimmedLine.startsWith("*") || trimmedLine.startsWith("++")) {
                    inPriorInformation = false;
                    continue;
                }

                // Resto del código igual...
                const columnMatches = Array.from(
                    line.matchAll(/[a-zA-Z0-9_.]+/g)
                ).filter((match) => !["*", "log"].includes(match[0]));

                let headerIndex = 0;
                columnMatches.forEach((match) => {
                    const word = match[0];
                    const startIndex = match.index!;
                    const endIndex = startIndex + word.length;

                    if (headers[headerIndex]) {
                        const wordRange = new vscode.Range(
                            new vscode.Position(i, startIndex),
                            new vscode.Position(i, endIndex)
                        );

                        allRanges.push({ range: wordRange, header: headers[headerIndex] });
                        headerIndex++;
                    }
                });
            }
        }

        return allRanges;
    }

    const PriorInformationHoverProvider = vscode.languages.registerHoverProvider(
        { scheme: "file", pattern: "**/*.{pst}" },
        {
            provideHover(document, position): vscode.ProviderResult<vscode.Hover> {
                const ranges = parsePriorInformation(document);

                for (const { range, header } of ranges) {
                    if (range.contains(position)) {
                        return new vscode.Hover(new vscode.MarkdownString(`${header}`));
                    }
                }

                return null; // Asegura que se devuelve un valor en todos los caminos
            },
        }
    );

    // Nueva función para obtener solo los rangos de la primera línea
    function getFirstRowRangesPriorInformation(document: vscode.TextDocument) {
        const allRanges = parsePriorInformation(document);
        const firstLineRanges = allRanges.filter(
            ({ range }) => range.start.line === allRanges[0]?.range.start.line
        );
        return firstLineRanges;
    }

    const PriorInformationCodeLensProvider =
        vscode.languages.registerCodeLensProvider(
            { scheme: "file", pattern: "**/*.{pst}" },
            {
                provideCodeLenses(document) {
                    const codeLenses: vscode.CodeLens[] = [];
                    const firstRowRanges = getFirstRowRangesPriorInformation(document);

                    if (firstRowRanges.length > 0) {
                        firstRowRanges.forEach(({ range, header }) => {
                            const description =
                                descriptions.find((desc) => desc.Variable === header)
                                    ?.Description || "No description available";
                            codeLenses.push(
                                new vscode.CodeLens(range, {
                                    title: header,
                                    command: "", // Si no necesitas que haga nada al clic, deja el comando vacío.
                                    tooltip: `${header} : ${description}`, // Tooltip para cada header.
                                })
                            );
                        });
                    }

                    return codeLenses;
                },
            }
        );

    // #endregion Parameter Groups CodeLens and Hover

    /*========================================================
    CodeLens provider for command line and input/output sections
    ========================================================*/

    // #region CodeLens provider for command line and input/output sections

    const codeLensProvider = vscode.languages.registerCodeLensProvider(
        { scheme: "file", pattern: "**/*.{pst}" },
        {
            provideCodeLenses(document) {
                const codeLenses: vscode.CodeLens[] = [];
                const lines = document.getText().split("\n");
                let inRelevantSection = false;
                let currentSection = ""; // Track the current section name

                lines.forEach((line, i) => {
                    const trimmedLine = line.trim();

                    // Detect the start of relevant sections
                    if (
                        trimmedLine.startsWith("* model input/output") ||
                        trimmedLine.startsWith("* model command line")
                    ) {
                        inRelevantSection = true;
                        currentSection = trimmedLine; // Store the section name
                        return;
                    }

                    // Exit relevant section
                    if (inRelevantSection && trimmedLine.startsWith("*")) {
                        inRelevantSection = false;
                        currentSection = ""; // Reset the section name
                        return;
                    }

                    // Process lines inside relevant sections
                    if (inRelevantSection) {
                        if (trimmedLine.startsWith("++")) {
                            // Skip lines starting with ++
                            return;
                        }

                        const matches = trimmedLine.match(/[^ ]+/g); // Extract words or paths
                        if (matches) {
                            const range = new vscode.Range(i, 0, i, trimmedLine.length);

                            // Special handling for "* model command line"
                            if (currentSection.startsWith("* model command line")) {
                                const filePath = matches[matches.length - 1]; // Only the last word
                                codeLenses.push(
                                    new vscode.CodeLens(range, {
                                        title: `📂 Open ${filePath}`,
                                        command: "extension.openFileFromDecoration",
                                        arguments: [filePath],
                                    })
                                );
                            } else {
                                // For other sections, create a lens for each path
                                matches.forEach((filePath) => {
                                    codeLenses.push(
                                        new vscode.CodeLens(range, {
                                            title: `📂 Open ${filePath}`,
                                            command: "extension.openFileFromDecoration",
                                            arguments: [filePath],
                                        })
                                    );
                                });
                            }
                        }
                    }
                });

                return codeLenses;
            },
        }
    );


    const handleClick = vscode.commands.registerCommand(
        "extension.openFileFromDecoration",
        async (filePath: string) => {
            const activeEditor = vscode.window.activeTextEditor;

            // Asegúrate de que hay un archivo activo
            if (!activeEditor) {
                vscode.window.showWarningMessage("No active editor.");
                return;
            }

            // Obtén el directorio del archivo activo
            const currentDir = path.dirname(activeEditor.document.uri.fsPath);

            // Calcula la ruta completa
            const resolvedPath = path.isAbsolute(filePath)
                ? filePath
                : path.join(currentDir, filePath);

            try {
                const doc = await vscode.workspace.openTextDocument(resolvedPath);
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
            } catch {
                vscode.window.showWarningMessage(`File not found: ${resolvedPath}`);
            }
        }
    );

    /*========================================================
      CodeLens provider for bat files
    ========================================================*/
    //TODO: ADD SUPPORT FOR SH AND BASH FILES FOR MAC USERS
    const pathCodeLensProvider = vscode.languages.registerCodeLensProvider(
        { scheme: "file", pattern: "**/*.{bat,sh}" }, // Supports .bat and .sh files
        {
            provideCodeLenses(document) {
                const codeLenses: vscode.ProviderResult<vscode.CodeLens[]> = [];
                const lines = document.getText().split("\n");
                let currentDir = path.dirname(document.uri.fsPath); // Start with the script's directory

                lines.forEach((line, i) => {
                    const trimmedLine = line.trim();

                    // Handle `%~dp0` in .bat files
                    const resolvedLine = trimmedLine.replace(/%~dp0/gi, path.dirname(document.uri.fsPath) + path.sep);

                    // Detect `cd` commands in .bat and .sh files
                    const cdMatch = resolvedLine.match(/^cd\s+(.+)/i);
                    if (cdMatch) {
                        const pathCommand = cdMatch[1].trim(); // Extract the path after `cd`
                        const resolvedFolderPath = path.isAbsolute(pathCommand)
                            ? pathCommand // Absolute path
                            : path.resolve(currentDir, pathCommand); // Relative path

                        const range = new vscode.Range(i, 0, i, trimmedLine.length);

                        // Add CodeLens for `cd` commands
                        codeLenses.push(
                            new vscode.CodeLens(range, {
                                title: `📂 Open Folder: ${resolvedFolderPath}`,
                                command: "extension.openPath",
                                arguments: [resolvedFolderPath],
                            })
                        );
                    }

                    // Detect file references in .bat and .sh files
                    const filePathMatch = resolvedLine.match(/path\.join\((.*?)['"]([^'"]+\.\w+)['"]\)/);
                    if (filePathMatch) {
                        const fileName = filePathMatch[2]; // Extract the file name
                        const resolvedFilePath = path.resolve(currentDir, fileName); // Resolve full path

                        const range = new vscode.Range(
                            i,
                            filePathMatch.index || 0,
                            i,
                            (filePathMatch.index || 0) + fileName.length
                        );

                        // Add CodeLens for file references
                        codeLenses.push(
                            new vscode.CodeLens(range, {
                                title: `📄 Open File: ${resolvedFilePath}`,
                                command: "extension.openFile",
                                arguments: [resolvedFilePath],
                            })
                        );
                    }
                });

                return codeLenses;
            },
        }
    );






    // Command to open resolved paths (folders)
    const openPathCommand = vscode.commands.registerCommand(
        "extension.openPath",
        async (resolvedPath: string) => {
            try {
                await vscode.env.openExternal(vscode.Uri.file(resolvedPath));
            } catch {
                vscode.window.showWarningMessage(`Folder not found: ${resolvedPath}`);
            }
        }
    );

    // Command to open resolved files
    const openFileCommand = vscode.commands.registerCommand(
        "extension.openFile",
        async (filePath: string) => {
            try {
                // Open the file in a new editor tab beside the current one
                const doc = await vscode.workspace.openTextDocument(filePath);
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
            } catch {
                vscode.window.showWarningMessage(`File not found: ${filePath}`);
            }
        }
    );

    context.subscriptions.push(
        pathCodeLensProvider,
        openPathCommand,
        openFileCommand
    );

    // #endregion CodeLens provider for command line and input/output sections

    /*========================================================
    CodeLens provider for PEST++
    ========================================================*/

    // #region Hover provider for pest++ section

    const hoverProviderPlus = vscode.languages.registerHoverProvider(
        { scheme: "file" },
        {
            async provideHover(document, position) {
                // Get all symbols from the document
                const symbolProvider = new PestDocumentSymbolProvider();
                const symbols = await symbolProvider.provideDocumentSymbols(document, new vscode.CancellationTokenSource().token);

                if (!symbols) {
                    return null;
                }

                // Find which symbol's range contains our position
                const currentSymbol = symbols.find(symbol =>
                    symbol.location.range.contains(position) &&
                    symbol.name.includes("PEST++")  // Verifica que sea una sección PEST++
                );

                // Only proceed if we're in a PEST++ section
                if (!currentSymbol) {
                    return null;
                }

                // Get the word under cursor
                const wordRange = document.getWordRangeAtPosition(position);
                if (!wordRange) {
                    return null;
                }

                const word = document.getText(wordRange);
                const description = descriptions.find((desc) => desc.Variable === word);

                if (!description) {
                    return null;
                }

                return new vscode.Hover(
                    new vscode.MarkdownString(
                        `### 🏷️ Variable: **${description.Variable}**\n\n` +
                        `📖 **Description:** *${description.Description}*\n\n` +
                        `📐 **Type:** \`${description.Type}\`\n\n` +
                        (description.Values
                            ? `🔢 **Allowed Values:** ${description.Values.split(", ")
                                .map((val) => `\`${val}\``)
                                .join(", ")}\n\n`
                            : "")
                    )
                );
            },
        }
    );


    context.subscriptions.push(hoverProviderPlus);
    // Escucha cambios en el editor activo
    vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
            //  applyDecorations(editor);
        }
    });

    // #endregion Hover provider for pest++ section

    /*========================================================
    PUTTING IT ALL TOGETHER
    ========================================================*/

    // #region Putting it all together

    const disposable = vscode.commands.registerCommand(
        "pestd3code.activate",
        () => {
            vscode.window.showInformationMessage("PestD3code activated!");
        }
    );

    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(document => {
            if (document) {
                // Limpiar los diagnósticos
                if (diagnosticCollection) {
                    diagnosticCollection.delete(document.uri);
                }
                /*                 // Limpiar los paneles de output
                                if (outputChannel) {
                                    outputChannel.clear();
                                    outputChannel.hide();
                                }
                                if (rawOutputChannel) {
                                    rawOutputChannel.clear();
                                    rawOutputChannel.hide();
                                }
                                // Si existe un webview, también lo cerramos
                                if (typeof rawPanel !== 'undefined') {
                                    rawPanel.dispose();
                                } */
            }
        })
    );

    context.subscriptions.push(manualCodeLensProvider);
    context.subscriptions.push(disposable);
    context.subscriptions.push(hoverProvider);
    disposables.push(foldingProvider);
    context.subscriptions.push(handleClick);
    context.subscriptions.push(codeLensProvider);
    context.subscriptions.push(parameterGroupsCodeLensProvider);
    context.subscriptions.push(parameterDataCodeLensProvider);
    context.subscriptions.push(parameterGroupsHoverProvider);
    context.subscriptions.push(parameterDataHoverProvider);
    context.subscriptions.push(obsGroupsCodeLensProvider);
    context.subscriptions.push(obsGroupsHoverProvider);
    context.subscriptions.push(obsDataCodeLensProvider);
    context.subscriptions.push(obsDataHoverProvider);
    context.subscriptions.push(PriorInformationCodeLensProvider);
    context.subscriptions.push(PriorInformationHoverProvider);

    // #endregion Putting it all together
}
// #endregion MAIN EXTENSION ACTIVATION FUNCTION

// This method is called when your extension is deactivated

export function deactivate() {
}

function getRelativePath(filePath: string, workspaceRoot: string): string {
    // Remove any leading slash and normalize path
    const normalizedPath = filePath.replace(/^[\/\\]+/, '');
    return path.relative(workspaceRoot, normalizedPath);
}
