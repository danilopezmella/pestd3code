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


const SCIENTIFIC_NUMBER_REGEX = /[+-]?\d*\.?\d+(?:[Ee][+-]?\d+)?|[+-]?\d+[Ee][+-]?\d+|[a-zA-Z]+/;

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
    { name: "NPAR", required: true, type: "integer" },
    { name: "NOBS", required: true, type: "integer" },
    { name: "NPARGP", required: true, type: "integer" },
    { name: "NPRIOR", required: true, type: "integer" },
    { name: "NOBSGP", required: true, type: "integer" },
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
function isValidFloat(value: string): boolean {
    // Regex para validar números flotantes y notación científica
    const floatRegex = /^[+-]?\d*\.?\d+(?:[eE][+-]?\d+)?$/;
    return floatRegex.test(value);
}

function isValidFilename(value: string): boolean {
    // Más estricto que solo una letra
    // Debe tener al menos un carácter y una extensión
    return /^[\w][\w\s.-]*\.\w+$/.test(value);
}

function validateType(value: string, type: string, allowedValues?: string[], minValue?: number, maxValue?: number): boolean {
    console.log(`Validating Type: Value="${value}", Type=${type}`);

    if (allowedValues && allowedValues.length > 0) {
        return allowedValues.includes(value);
    }

    switch (type.toLowerCase()) {
        case 'integer':
            const intValue = parseInt(value);
            const isInt = !isNaN(intValue) && Number.isInteger(Number(value));
            console.log(`  Integer validation result: ${isInt}`);
            if (!isInt) { return false; }
            if (minValue !== undefined && intValue < minValue) { return false; }
            if (maxValue !== undefined && intValue > maxValue) { return false; }
            return true;

        case 'float':
            const floatValue = parseFloat(value);
            const isFloat = !isNaN(floatValue) && Number.isFinite(Number(value));
            console.log(`  Float validation result: ${isFloat}`);
            if (!isFloat) { return false; }
            if (minValue !== undefined && floatValue < minValue) { return false; }
            if (maxValue !== undefined && floatValue > maxValue) { return false; }
            return true;

        case 'string':
            // For strings, we mainly care about allowedValues
            break;

        default:
            console.log(`Unknown type: ${type}`);
            return false;
    }

    // Finally check allowedValues if they exist
    if (allowedValues && allowedValues.length > 0) {
        return allowedValues.includes(value);
    }

    return true;
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
        vscode.window.showInformationMessage(`✅ PestCheck found using command: ${pathFromCommand}`);
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
                    `PestCheck found at: ${commonPath}. Do you want to use this path?`,
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
    const warningMessage = "PestCheck not found using any method. Please configure it manually.";
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
            "PestCheck not found. Would you like to set it manually?",
            "Browse",
            "Skip"
        );
        if (userChoice === "Browse") {
            await browseForPestCheckPath();
        }
    } else {
        vscode.window.showErrorMessage(`The detected file needs execution permissions: ${path}`);
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
        openLabel: "Select PestCheck",
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
                    "The selected file needs execution permissions. Would you like to grant them?",
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
                        console.log("Granted execution permissions to:", pestcheckPath);
                    } catch (error) {
                        console.error("Error granting execution permissions:", error);
                        vscode.window.showErrorMessage(
                            "Failed to grant execution permissions. Please set permissions manually."
                        );
                        return;
                    }
                } else {
                    console.warn("User declined to grant execution permissions.");
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

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    // Check for extension updates
    const extensionVersion = vscode.extensions.getExtension("DanielLopezMella.pestd3code")?.packageJSON.version;
    const lastVersion = context.globalState.get<string>("lastVersion");

    // 1. Notificación de nueva versión
    if (extensionVersion !== lastVersion) {
        const message = new vscode.MarkdownString(
            `🎉 PestD3Code has been updated to version ${extensionVersion}! ` +
            `[View Changelog](https://github.com/danilopezmella/pestd3code/blob/main/CHANGELOG.md)`
        );

        vscode.window.showInformationMessage(message.value, "View Changelog").then(selection => {
            if (selection === "View Changelog") {
                vscode.env.openExternal(vscode.Uri.parse("https://github.com/danilopezmella/pestd3code/blob/main/CHANGELOG.md"));
            }
        });

        await context.globalState.update("lastVersion", extensionVersion);
    }

    // 2. Verificación independiente de auto-update
    const extensionAutoUpdate = vscode.workspace.getConfiguration('extensions').get('autoUpdate');
    const hasAutoUpdateBeenSuggested = context.globalState.get<boolean>("hasAutoUpdateBeenSuggested", false);

    if (!extensionAutoUpdate && !hasAutoUpdateBeenSuggested) {
        vscode.window.showInformationMessage(
            "💡 Enable auto-updates to always get the latest features and improvements in PestD3Code",
            "Enable Auto-Updates",
            "Maybe Later"
        ).then(selection => {
            if (selection === "Enable Auto-Updates") {
                vscode.commands.executeCommand('workbench.action.openSettings', 'extensions.autoUpdate');
            }
        });

        await context.globalState.update("hasAutoUpdateBeenSuggested", true);
    }

    // Add new command registration
    context.subscriptions.push(
        vscode.commands.registerCommand("pestd3code.simulateFirstInstall", async () => {
            console.log("Simulating first install - resetting PestCheck configuration...");

            // Reset the global notification state
            await context.globalState.update("pestCheckNotified", false);

            // Reset the PestCheck path in configuration
            const configuration = vscode.workspace.getConfiguration("pestd3code");
            await configuration.update("pestcheckPath", "", vscode.ConfigurationTarget.Global);

            vscode.window.showInformationMessage("PestD3Code has been reset to first install state");
            console.log("PestD3Code reset completed");
        })
    );

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
                    "PestCheck not found. Would you like to locate it?",
                    "Try to Auto Detect",
                    "Browse",
                    "Cancel"
                );
                switch (choice) {
                    case "Try to Auto Detect":
                        console.log("Attempting automatic detection...");
                        const foundPath = await findPestCheck();
                        if (foundPath) {
                            pestCheckPath = foundPath;
                            await configuration.update("pestcheckPath", foundPath, vscode.ConfigurationTarget.Global);
                            console.log("PestCheck found at:", foundPath);
                        } else {
                            vscode.window.showInformationMessage("PestCheck path is still not configured. You can try again using the 'Set Pestcheck Path Manually' or 'Try to autoset Pestcheck' commands.");
                            return;
                        }
                        break;

                    case "Browse":
                        await browseForPestCheckPath(context);
                        // Re-check configuration after browse
                        pestCheckPath = configuration.get<string>("pestcheckPath", "");
                        if (!pestCheckPath || !fs.existsSync(pestCheckPath)) {
                            vscode.window.showInformationMessage("PestCheck path is still not configured. You can try again using the 'Set Pestcheck Path Manually' or 'Try to autoset Pestcheck' commands.");
                            return;
                        }
                        break;

                    default:
                        vscode.window.showInformationMessage("User cancelled PestCheck configuration. You can try again using the 'Set Pestcheck Path Manually' or 'Try to autoset Pestcheck' commands.");
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
            openLabel: "Select PestCheck File",
        });

        if (selectedFile && selectedFile[0]) {
            const pestcheckPath = selectedFile[0].fsPath;
            console.log("User selected PestCheck path:", pestcheckPath);

            // Validate executability on Unix-based platforms
            // Validate executability on Unix-based platforms
            if (platform !== "win32") {
                try {
                    await fs.promises.access(pestcheckPath, fs.constants.X_OK); // Check if the file is executable
                } catch {
                    const makeExecutable = await vscode.window.showWarningMessage(
                        "The selected file needs execution permissions. Would you like to grant them?",
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
                            console.log("Granted execution permissions to:", pestcheckPath);
                        } catch (error) {
                            console.error("Error granting execution permissions:", error);
                            vscode.window.showErrorMessage(
                                "Failed to grant execution permissions. Please set permissions manually."
                            );
                            return;
                        }
                    } else {
                        vscode.window.showErrorMessage(
                            "The selected file cannot be used without execution permissions."
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
                        "PestCheck not found. Would you like to set it manually?",
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
            "PestCheck not found. Would you like to locate it?",
            "Try to Auto Detect",
            "Browse",
            "Cancel"
        );

        switch (selected) {
            case "Try to Auto Detect":
                console.log("Attempting automatic detection...");
                const foundPath = await findPestCheck();
                if (foundPath) {
                    const configuration = vscode.workspace.getConfiguration("pestd3code");
                    await configuration.update("pestcheckPath", foundPath, vscode.ConfigurationTarget.Global);
                    console.log("PestCheck found at:", foundPath);
                }
                break;

            case "Browse":
                await browseForPestCheckPath(context);
                if (!pestcheckPath) {
                    vscode.window.showInformationMessage("PestCheck path is still not configured. You can try again using the 'Set Pestcheck Path Manually' or 'Try to autoset Pestcheck' commands.");
                }
                break;

            default:
                vscode.window.showInformationMessage("User cancelled PestCheck configuration. You can try again using the 'Set Pestcheck Path Manually' or 'Try to autoset Pestcheck' commands.");
                break;
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


    // #region Regularisation Section Hover Provider

    function createRegulDataHover(variable: ParsedVariable, structure: any[]): vscode.Hover | null {
        console.log('\n=== Creating Regularisation Hover Content ===');
        console.log(`Variable: ${variable.name}, Value="${variable.value}", Valid=${variable.valid}`);
        // Si la variable es UNDEFINED, usar el hover genérico para variables indefinidas
        if (variable.name === "UNDEFINED") {
            return createUndefinedVariableHover();
        }

        const varStructure = structure.find((v: { name: string; type: string; description?: string; required: boolean; allowedValues?: string[], minValue?: number, maxValue?: number, values?: string }) => v.name === variable.name);
        if (!varStructure) {
            console.log('No structure found for variable');
            return null;
        }

        console.log('Structure found:');
        console.log(`  Type: ${varStructure.type}`);
        console.log(`  Required: ${varStructure.required}`);
        console.log(`  Min Value: ${varStructure.minValue !== undefined ? varStructure.minValue : 'not set'}`);
        console.log(`  Max Value: ${varStructure.maxValue !== undefined ? varStructure.maxValue : 'not set'}`);

        const isValid = validateType(variable.value, varStructure.type, varStructure.allowedValues, varStructure.minValue, varStructure.maxValue);

        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;
        markdown.appendMarkdown(
            `### ⚖️ Regularisation Variable: **${varStructure.name}**\n\n` +
            `📝 **Description:** ${varStructure.description || "No description available"}\n\n` +
            `📋 **Type:** \`${varStructure.type}\`\n\n` +
            (varStructure.allowedValues && varStructure.allowedValues.length > 0
                ? `🎯 **Allowed Values:** ${varStructure.allowedValues.map((v: any) => `\`${v}\``).join(", ")}\n\n`
                : (varStructure.values
                    ? `🎯 **Allowed Values:** ${varStructure.values.split(", ").map((v: any) => `\`${v}\``).join(", ")}\n\n`
                    : "")
            ) +
            `❗ **Required:** ${varStructure.required ? "Yes" : "No"}\n\n` +
            (varStructure.minValue !== undefined
                ? `⬇️ **Minimum Value:** ${varStructure.minValue}\n\n`
                : "") +
            (varStructure.maxValue !== undefined
                ? `⬆️ **Maximum Value:** ${varStructure.maxValue}\n\n`
                : "")
        );

        if (!variable.valid || !isValid) {
            console.log('Adding invalid value warning');
            markdown.appendMarkdown(
                `\n\n⚠️ **Invalid Value:** \`${variable.value}\` does not satisfy the requirements.\n\n` +
                `🔍 Recommend running PestCheck to validate the file\n\n` +
                `[Run PestCheck](command:pestd3code.runPestCheck)`
            );
        } else {
            markdown.appendMarkdown(
                `\n\n✅ **Valid Value:** \`${variable.value}\` satisfies the requirements.\n\n`
            );
        }

        return new vscode.Hover(markdown);
    }


    const regularisationLine1Structure = [
        { name: "PHIMLIM", type: "float", required: true, minValue: 0 },
        { name: "PHIMACCEPT", type: "float", required: true, minValue: 0 },
        { name: "FRACPHIM", type: "float", required: false, minValue: 0 },
        { name: "MEMSAVE", type: "string", required: false, allowedValues: ["memsave", "nomemsave"] }
    ];

    const regularisationLine2Structure = [
        { name: "WFINIT", type: "float", required: true, minValue: 0 },
        { name: "WFMIN", type: "float", required: true, minValue: 0 },
        { name: "WFMAX", type: "float", required: true, minValue: 0 },
        { name: "LINREG", type: "string", required: false, allowedValues: ["linreg", "nonlinreg"] },
        { name: "REGCONTINUE", type: "string", required: false, allowedValues: ["continue", "nocontinue"] }
    ];

    const regularisationLine3Structure = [
        { name: "WFFAC", type: "float", required: true, minValue: 0 },
        { name: "WFTOL", type: "float", required: true, minValue: 0 },
        { name: "IREGADJ", type: "integer", required: true },
        { name: "NOPTREGADJ", type: "integer", required: false },
        { name: "REGWEIGHTRAT", type: "float", required: false },
        { name: "REGSINGTHRESH", type: "float", required: false }
    ];

    function parseRegularisationLine(_lineIndex: number, values: string[], structure: any[]): ParsedVariable[] {
        const mapped: ParsedVariable[] = [];

        // Procesar variables requeridas primero
        const requiredVars = structure.filter(v => v.required);
        for (let i = 0; i < requiredVars.length && i < values.length; i++) {
            mapped.push({
                name: requiredVars[i].name,
                value: values[i],
                valid: validateType(values[i], requiredVars[i].type, requiredVars[i].allowedValues, requiredVars[i].minValue),
                id: i + 1
            });
        }

        // Procesar variables opcionales
        const optionalVars = structure.filter(v => !v.required);
        for (let i = requiredVars.length; i < values.length; i++) {
            const value = values[i];
            let matched = false;

            for (const optVar of optionalVars) {
                if (!mapped.some(v => v.name === optVar.name) &&
                    validateType(value, optVar.type, optVar.allowedValues, optVar.minValue)) {
                    mapped.push({
                        name: optVar.name,
                        value: value,
                        valid: true,
                        id: i + 1
                    });
                    matched = true;
                    break;
                }
            }

            if (!matched) {
                mapped.push({
                    name: "UNDEFINED",
                    value: value,
                    valid: false,
                    id: i + 1
                });
            }
        }

        return mapped;
    }

    function findCurrentSectionRegul(sections: Section[], line: number): Section | null {
        for (const section of sections) {
            if (line >= section.start && line <= section.end) {
                return section;
            }
        }
        return null;
    }

    function detectSectionsRegul(lines: string[]): Section[] {
        const sections: Section[] = [];
        let currentSection: Section | null = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim().toLowerCase();
            if (line === "* control data" || line.includes("regularisation") || line.includes("regularization") || line === "* singular value decomposition") {
                // Si hay una sección previa, su fin es la línea actual
                if (currentSection) {
                    currentSection.end = i - 1;
                }
                // Crear nueva sección
                currentSection = {
                    parent: lines[i].trim(),
                    start: i,
                    end: lines.length - 1  // Por defecto, asumimos que termina al final del archivo
                };
                sections.push(currentSection);
            }
        }

        // Ajustar los finales de sección
        for (let i = 0; i < sections.length - 1; i++) {
            sections[i].end = sections[i + 1].start - 1;
        }

        return sections;
    }


    const regulHoverProvider = vscode.languages.registerHoverProvider(
        { scheme: 'file', pattern: '**/*.{pst}' },
        {
            provideHover(document, position) {
                // Find current section
                const sections = detectSectionsRegul(document.getText().split('\n'));
                const currentSection = findCurrentSectionRegul(sections, position.line);

                console.log('Found sections:', sections);
                console.log('Current section:', currentSection ? currentSection.parent : 'None');
                console.log('Current line:', position.line);

                if (!currentSection || 
                    (currentSection.parent.toLowerCase() !== "* regularisation" && 
                     currentSection.parent.toLowerCase() !== "* regularization")) {
                    console.log("Not in regularisation or regularization section");
                    return null;
                }

                // Calcular línea relativa dentro de la sección
                const relativeLine = position.line - currentSection.start - 1;
                console.log(`Position Line: ${position.line}`);
                console.log(`Section Start: ${currentSection.start}`);
                console.log(`Relative Line (adjusted): ${relativeLine}`);

                // Ignorar la línea de encabezado
                if (relativeLine < 0) {
                    console.log('Índice negativo detectado, ignorando línea de encabezado');
                    return null;
                }

                // Seleccionar la estructura correcta según la línea
                // Seleccionar la estructura correcta según la línea
let lineStructure;
if (relativeLine === 0) {
    // Primera línea: PHIMLIM PHIMACCEPT [FRACPHIM] [MEMSAVE]
    lineStructure = [
        { 
            name: "PHIMLIM", 
            type: "float", 
            required: true, 
            minValue: 0, 
            values: descriptions.find(desc => desc.Variable === "PHIMLIM")?.Values || "No description available",
            description: descriptions.find(desc => desc.Variable === "PHIMLIM")?.Description || "No description available"
        },
        { 
            name: "PHIMACCEPT", 
            type: "float", 
            required: true, 
            minValue: 0, 
            values: descriptions.find(desc => desc.Variable === "PHIMACCEPT")?.Values || "No description available",
            description: descriptions.find(desc => desc.Variable === "PHIMACCEPT")?.Description || "No description available"
        },
        { 
            name: "FRACPHIM", 
            type: "float", 
            required: false, 
            minValue: 0, 
            values: descriptions.find(desc => desc.Variable === "FRACPHIM")?.Values || "No description available",
            description: descriptions.find(desc => desc.Variable === "FRACPHIM")?.Description || "No description available"
        },
        { 
            name: "MEMSAVE", 
            type: "string", 
            required: false, 
            allowedValues: ["memsave", "nomemsave"],
            values: descriptions.find(desc => desc.Variable === "MEMSAVE")?.Values || "No description available",
            description: descriptions.find(desc => desc.Variable === "MEMSAVE")?.Description || "No description available"
        }
    ];
} else if (relativeLine === 1) {
    // Segunda línea: WFINIT WFMIN WFMAX [LINREG] [REGCONTINUE]
    lineStructure = [
        { 
            name: "WFINIT", 
            type: "float", 
            required: true, 
            minValue: 0, 
            values: descriptions.find(desc => desc.Variable === "WFINIT")?.Values || "No description available",
            description: descriptions.find(desc => desc.Variable === "WFINIT")?.Description || "No description available"
        },
        { 
            name: "WFMIN", 
            type: "float", 
            required: true, 
            minValue: 0, 
            values: descriptions.find(desc => desc.Variable === "WFMIN")?.Values || "No description available",
            description: descriptions.find(desc => desc.Variable === "WFMIN")?.Description || "No description available"
        },
        { 
            name: "WFMAX", 
            type: "float", 
            required: true, 
            minValue: 0, 
            values: descriptions.find(desc => desc.Variable === "WFMAX")?.Values || "No description available",
            description: descriptions.find(desc => desc.Variable === "WFMAX")?.Description || "No description available"
        },
        { 
            name: "LINREG", 
            type: "string", 
            required: false, 
            allowedValues: ["linreg", "nonlinreg"],
            values: descriptions.find(desc => desc.Variable === "LINREG")?.Values || "No description available",
            description: descriptions.find(desc => desc.Variable === "LINREG")?.Description || "No description available"
        },
        { 
            name: "REGCONTINUE", 
            type: "string", 
            required: false, 
            allowedValues: ["continue", "nocontinue"],
            values: descriptions.find(desc => desc.Variable === "REGCONTINUE")?.Values || "No description available",
            description: descriptions.find(desc => desc.Variable === "REGCONTINUE")?.Description || "No description available"
        }
    ];
} else if (relativeLine === 2) {
    // Tercera línea: WFFAC WFTOL IREGADJ [NOPTREGADJ REGWEIGHTRAT [REGSINGTHRESH]]
    lineStructure = [
        { 
            name: "WFFAC", 
            type: "float", 
            required: true, 
            minValue: 0, 
            values: descriptions.find(desc => desc.Variable === "WFFAC")?.Values || "No description available",
            description: descriptions.find(desc => desc.Variable === "WFFAC")?.Description || "No description available"
        },
        { 
            name: "WFTOL", 
            type: "float", 
            required: true, 
            minValue: 0, 
            values: descriptions.find(desc => desc.Variable === "WFTOL")?.Values || "No description available",
            description: descriptions.find(desc => desc.Variable === "WFTOL")?.Description || "No description available"
        },
        { 
            name: "IREGADJ", 
            type: "integer", 
            required: true,
            values: descriptions.find(desc => desc.Variable === "IREGADJ")?.Values || "No description available",
            description: descriptions.find(desc => desc.Variable === "IREGADJ")?.Description || "No description available"
        },
        { 
            name: "NOPTREGADJ", 
            type: "integer", 
            required: false,
            values: descriptions.find(desc => desc.Variable === "NOPTREGADJ")?.Values || "No description available",
            description: descriptions.find(desc => desc.Variable === "NOPTREGADJ")?.Description || "No description available"
        },
        { 
            name: "REGWEIGHTRAT", 
            type: "float", 
            required: false,
            values: descriptions.find(desc => desc.Variable === "REGWEIGHTRAT")?.Values || "No description available",
            description: descriptions.find(desc => desc.Variable === "REGWEIGHTRAT")?.Description || "No description available"
        },
        { 
            name: "REGSINGTHRESH", 
            type: "float", 
            required: false,
            values: descriptions.find(desc => desc.Variable === "REGSINGTHRESH")?.Values || "No description available",
            description: descriptions.find(desc => desc.Variable === "REGSINGTHRESH")?.Description || "No description available"
        }
    ];
}
// 
                if (!lineStructure) {
                    console.log('No structure found for line:', relativeLine);
                    return null;
                }

                const line = document.lineAt(position.line);
                const values = line.text.trim().split(/\s+/);
                console.log('Parsed values:', values);

                // Usar parseLineByIndexRegul para procesar las variables
                const mapped = parseLineByIndexRegul(relativeLine, values, lineStructure);
                console.log('Mapped variables:', mapped);

                // Find the variable that matches the hovered word
                const wordRange = document.getWordRangeAtPosition(position, SCIENTIFIC_NUMBER_REGEX);
                const word = wordRange ? document.getText(wordRange) : '';

                // Calculate which value position we're hovering over
                let currentPos = 0;
                let valueIndex = -1;
                const lineText = line.text;

                console.log("\n=== Hover Position Debug ===");
                console.log(`Cursor position: ${position.character}`);
                console.log(`Line text: "${lineText}"`);

                for (let i = 0; i < values.length; i++) {
                    // Find where this value starts in the line
                    const valuePos = lineText.indexOf(values[i], currentPos);
                    if (valuePos === -1) { continue; }

                    console.log(`Value "${values[i]}" starts at position ${valuePos} and ends at ${valuePos + values[i].length - 1}`);

                    // If our cursor is within this value's range
                    if (position.character >= valuePos && position.character < valuePos + values[i].length) {
                        valueIndex = i;
                        console.log(`Cursor is within value "${values[i]}" at index ${i}`);
                        break;
                    }
                    currentPos = valuePos + values[i].length;
                }

                // Si no encontramos un valor exacto, no mostrar hover
                if (valueIndex === -1) {
                    console.log("Cursor is not over any value, skipping hover");
                    return null;
                }

                console.log(`Cursor at position ${position.character}, found value at index ${valueIndex}`);
                const variable = findMatchingVariableRegul(mapped, word, valueIndex);
                if (!variable) {
                    console.log('No matching variable found for the hovered word');
                    return createUndefinedVariableHover();  // <-- Así es como debería ser
                }


                console.log('Matched variable:', variable);

                // Create hover content based on the variable
                return createRegulDataHover(variable, lineStructure);
            }
        }
    );

    const controlDataHoverProvider = vscode.languages.registerHoverProvider(
        { scheme: "file" },
        {
            provideHover(document, position) {
                const lines = document.getText().split("\n");
                const sections = detectSections(lines);
                const currentSection = findCurrentSection(sections, position.line);

                if (!currentSection || currentSection.parent !== "control data") {
                    console.log("Not in Control Data section, skipping general hover");
                    return null;
                }

                if (!currentSection || currentSection.parent !== "control data") {
                    console.log("Not in Control Data section, skipping general hover");
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
                        {
                            name: "RSTFLE",
                            required: true,
                            type: "string",
                            order: 1,
                            allowedValues: ["restart", "norestart"],
                            description: descriptions.find(desc => desc.Variable === "RSTFLE")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "RSTFLE")?.Values || "No description available"
                        },
                        {
                            name: "PESTMODE",
                            required: true,
                            type: "string",
                            order: 2,
                            allowedValues: ["estimation", "prediction", "regularization", "regularisation", "pareto"],
                            description: descriptions.find(desc => desc.Variable === "PESTMODE")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "PESTMODE")?.Values || "No description available"
                        }
                    ];
                } else if (relativeLine === 1) {
                    lineStructure = [
                        {
                            name: "NPAR",
                            required: true,
                            type: "integer",
                            order: 1,
                            min: 1, // greater than zero
                            description: descriptions.find(desc => desc.Variable === "NPAR")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "NPAR")?.Values || "No description available"
                        },
                        {
                            name: "NOBS",
                            required: true,
                            type: "integer",
                            order: 2,
                            min: 1, // greater than zero
                            description: descriptions.find(desc => desc.Variable === "NOBS")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "NOBS")?.Values || "No description available"
                        },
                        {
                            name: "NPARGP",
                            required: true,
                            type: "integer",
                            order: 3,
                            min: 1, // greater than zero
                            description: descriptions.find(desc => desc.Variable === "NPARGP")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "NPARGP")?.Values || "No description available"
                        },
                        {
                            name: "NPRIOR",
                            required: true,
                            type: "integer",
                            order: 4,
                            description: descriptions.find(desc => desc.Variable === "NPRIOR")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "NPRIOR")?.Values || "No description available"
                        },
                        {
                            name: "NOBSGP",
                            required: true,
                            type: "integer",
                            order: 5,
                            min: 1, // greater than zero
                            description: descriptions.find(desc => desc.Variable === "NOBSGP")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "NOBSGP")?.Values || "No description available"
                        },
                        {
                            name: "MAXCOMPDIM",
                            required: false,
                            type: "integer",
                            min: 0, // zero or greater
                            description: descriptions.find(desc => desc.Variable === "MAXCOMPDIM")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "MAXCOMPDIM")?.Values || "No description available"
                        },
                        {
                            name: "DERZEROLIM",
                            required: false,
                            type: "float",
                            description: descriptions.find(desc => desc.Variable === "DERZEROLIM")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "DERZEROLIM")?.Values || "No description available"
                        }
                    ];
                } else if (relativeLine === 2) {
                    // Line 4: NTPLFLE  NINSFLE  PRECIS  DPOINT [NUMCOM JACFILE MESSFILE] [OBSREREF]
                    lineStructure = [
                        // Required variables
                        {
                            name: "NTPLFLE",
                            required: true,
                            type: "integer",
                            order: 1,
                            min: 1, // greater than zero
                            description: descriptions.find(desc => desc.Variable === "NTPLFLE")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "NTPLFLE")?.Values || "No description available"
                        },
                        {
                            name: "NINSFLE",
                            required: true,
                            type: "integer",
                            order: 2,
                            min: 1, // greater than zero
                            description: descriptions.find(desc => desc.Variable === "NINSFLE")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "NINSFLE")?.Values || "No description available"
                        },
                        {
                            name: "PRECIS",
                            required: true,
                            type: "string",
                            order: 3,
                            allowedValues: ["single", "double"],
                            description: descriptions.find(desc => desc.Variable === "PRECIS")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "PRECIS")?.Values || "No description available"
                        },
                        {
                            name: "DPOINT",
                            required: true,
                            type: "string",
                            order: 4,
                            allowedValues: ["point", "nopoint"],
                            description: descriptions.find(desc => desc.Variable === "DPOINT")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "DPOINT")?.Values || "No description available"
                        },
                        {
                            name: "NUMCOM",
                            required: false,
                            type: "integer",
                            min: 1, // greater than zero
                            description: descriptions.find(desc => desc.Variable === "NUMCOM")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "NUMCOM")?.Values || "No description available"
                        },
                        {
                            name: "JACFILE",
                            required: false,
                            type: "integer",
                            min: -1,
                            max: 1,
                            allowedValues: ["-1", "0", "1"], // 0, 1 or -1
                            description: descriptions.find(desc => desc.Variable === "JACFILE")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "JACFILE")?.Values || "No description available"
                        },
                        {
                            name: "MESSFILE",
                            required: false,
                            type: "integer",
                            min: 0,
                            max: 1,
                            allowedValues: ["0", "1"], // zero or one
                            description: descriptions.find(desc => desc.Variable === "MESSFILE")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "MESSFILE")?.Values || "No description available"
                        },
                        // Optional variables - string
                        {
                            name: "OBSREREF",
                            required: false,
                            type: "string",
                            allowedValues: ["obsreref", "obsreref_N", "noobsreref"],
                            description: descriptions.find(desc => desc.Variable === "OBSREREF")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "OBSREREF")?.Values || "No description available"
                        }
                    ];
                } else if (relativeLine === 3) {
                    // Line 5: RLAMBDA1  RLAMFAC  PHIRATSUF  PHIREDLAM  NUMLAM [JACUPDATE] [LAMFORGIVE] [DERFORGIVE]
                    lineStructure = [
                        // Required variables
                        {
                            name: "RLAMBDA1",
                            required: true,
                            type: "float",
                            order: 1,
                            min: 0, // zero or greater
                            description: descriptions.find(desc => desc.Variable === "RLAMBDA1")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "RLAMBDA1")?.Values || "No description available"
                        },
                        {
                            name: "RLAMFAC",
                            required: true,
                            type: "float",
                            order: 2,
                            description: descriptions.find(desc => desc.Variable === "RLAMFAC")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "RLAMFAC")?.Values || "No description available"
                        },
                        {
                            name: "PHIRATSUF",
                            required: true,
                            type: "float",
                            order: 3,
                            min: 0,
                            max: 1, // between zero and one
                            description: descriptions.find(desc => desc.Variable === "PHIRATSUF")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "PHIRATSUF")?.Values || "No description available"
                        },
                        {
                            name: "PHIREDLAM",
                            required: true,
                            type: "float",
                            order: 4,
                            min: 0,
                            max: 1, // between zero and one
                            description: descriptions.find(desc => desc.Variable === "PHIREDLAM")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "PHIREDLAM")?.Values || "No description available"
                        },
                        {
                            name: "NUMLAM",
                            required: true,
                            type: "integer",
                            order: 5,
                            min: 1, // one or greater
                            description: descriptions.find(desc => desc.Variable === "NUMLAM")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "NUMLAM")?.Values || "No description available"
                        },
                        {
                            name: "JACUPDATE",
                            required: false,
                            type: "integer",
                            min: 0, // zero or greater
                            description: descriptions.find(desc => desc.Variable === "JACUPDATE")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "JACUPDATE")?.Values || "No description available"
                        },
                        {
                            name: "LAMFORGIVE",
                            required: false,
                            type: "string",
                            allowedValues: ["lamforgive", "nolamforgive"],
                            description: descriptions.find(desc => desc.Variable === "LAMFORGIVE")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "LAMFORGIVE")?.Values || "No description available"
                        },
                        {
                            name: "DERFORGIVE",
                            required: false,
                            type: "string",
                            allowedValues: ["derforgive", "noderforgive"],
                            description: descriptions.find(desc => desc.Variable === "DERFORGIVE")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "DERFORGIVE")?.Values || "No description available"
                        }
                    ];
                } else if (relativeLine === 4) {
                    // Line 6: RELPARMAX  FACPARMAX  FACORIG [IBOUNDSTICK UPVECBEND] [ABSPARMAX]
                    lineStructure = [
                        // Required variables
                        {
                            name: "RELPARMAX",
                            required: true,
                            type: "float",
                            order: 1,
                            min: 0, // greater than zero
                            description: descriptions.find(desc => desc.Variable === "RELPARMAX")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "RELPARMAX")?.Values || "No description available"
                        },
                        {
                            name: "FACPARMAX",
                            required: true,
                            type: "float",
                            order: 2,
                            min: 1, // greater than one
                            description: descriptions.find(desc => desc.Variable === "FACPARMAX")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "FACPARMAX")?.Values || "No description available"
                        },
                        {
                            name: "FACORIG",
                            required: true,
                            type: "float",
                            order: 3,
                            min: 0,
                            max: 1, // between zero and one
                            description: descriptions.find(desc => desc.Variable === "FACORIG")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "FACORIG")?.Values || "No description available"
                        },
                        {
                            name: "IBOUNDSTICK",
                            required: false,
                            type: "integer",
                            min: 0, // zero or greater
                            description: descriptions.find(desc => desc.Variable === "IBOUNDSTICK")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "IBOUNDSTICK")?.Values || "No description available"
                        },
                        {
                            name: "UPVECBEND",
                            required: false,
                            type: "integer",
                            min: 0,
                            max: 1, // zero or one
                            allowedValues: ["0", "1"],
                            description: descriptions.find(desc => desc.Variable === "UPVECBEND")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "UPVECBEND")?.Values || "No description available"
                        },
                        {
                            name: "ABSPARMAX",
                            required: false,
                            type: "float",
                            description: descriptions.find(desc => desc.Variable === "ABSPARMAX")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "ABSPARMAX")?.Values || "No description available"
                        }
                    ];
                } else if (relativeLine === 5) {
                    // Line 7: PHIREDSWH [NOPTSWITCH] [SPLITSWH] [DOAUI] [DOSENREUSE] [BOUNDSCALE]
                    lineStructure = [
                        // Required variable first - PHIREDSWH (float)
                        {
                            name: "PHIREDSWH",
                            required: true,
                            type: "float",
                            order: 1,
                            min: 0,
                            max: 1, // between zero and one
                            description: descriptions.find(desc => desc.Variable === "PHIREDSWH")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "PHIREDSWH")?.Values || "No description available"
                        },
                        // Process optional variables
                        {
                            name: "NOPTSWITCH",
                            required: false,
                            type: "integer",
                            min: 1, // one or greater
                            description: descriptions.find(desc => desc.Variable === "NOPTSWITCH")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "NOPTSWITCH")?.Values || "No description available"
                        },
                        {
                            name: "SPLITSWH",
                            required: false,
                            type: "float",
                            min: 0, // zero or greater
                            description: descriptions.find(desc => desc.Variable === "SPLITSWH")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "SPLITSWH")?.Values || "No description available"
                        },
                        {
                            name: "DOAUI",
                            required: false,
                            type: "string",
                            allowedValues: ["aui", "auid", "noaui"],
                            description: descriptions.find(desc => desc.Variable === "DOAUI")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "DOAUI")?.Values || "No description available"
                        },
                        {
                            name: "DOSENREUSE",
                            required: false,
                            type: "string",
                            allowedValues: ["senreuse", "nosenreuse"],
                            description: descriptions.find(desc => desc.Variable === "DOSENREUSE")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "DOSENREUSE")?.Values || "No description available"
                        },
                        {
                            name: "BOUNDSCALE",
                            required: false,
                            type: "string",
                            allowedValues: ["boundscale", "noboundscale"],
                            description: descriptions.find(desc => desc.Variable === "BOUNDSCALE")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "BOUNDSCALE")?.Values || "No description available"
                        }
                    ];
                } else if (relativeLine === 6) {
                    // Line 8: NOPTMAX PHIREDSTP NPHISTP NPHINORED RELPARSTP NRELPAR [PHISTOPTHRESH] [LASTRUN] [PHIABANDON]
                    lineStructure = [
                        // Required variables
                        {
                            name: "NOPTMAX",
                            required: true,
                            values: descriptions.find(desc => desc.Variable === "NOPTMAX")?.Values || "No description available",
                            type: "integer",
                            order: 1,
                            min: -2, // -2 or greater
                            description: descriptions.find(desc => desc.Variable === "NOPTMAX")?.Description || "No description available",
                        },
                        {
                            name: "PHIREDSTP",
                            required: true,
                            type: "float",
                            order: 2,
                            min: 0, // greater than zero
                            description: descriptions.find(desc => desc.Variable === "PHIREDSTP")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "PHIREDSTP")?.Values || "No description available"
                        },
                        {
                            name: "NPHISTP",
                            required: true,
                            type: "integer",
                            order: 3,
                            min: 1, // greater than zero
                            description: descriptions.find(desc => desc.Variable === "NPHISTP")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "NPHISTP")?.Values || "No description available"
                        },
                        {
                            name: "NPHINORED",
                            required: true,
                            type: "integer",
                            order: 4,
                            min: 1, // greater than zero
                            description: descriptions.find(desc => desc.Variable === "NPHINORED")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "NPHINORED")?.Values || "No description available"
                        },
                        {
                            name: "RELPARSTP",
                            required: true,
                            type: "float",
                            order: 5,
                            min: 0, // greater than zero
                            description: descriptions.find(desc => desc.Variable === "RELPARSTP")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "RELPARSTP")?.Values || "No description available"
                        },
                        {
                            name: "NRELPAR",
                            required: true,
                            type: "integer",
                            order: 6,
                            min: 1, // greater than zero
                            description: descriptions.find(desc => desc.Variable === "NRELPAR")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "NRELPAR")?.Values || "No description available"
                        },
                        {
                            name: "PHISTOPTHRESH",
                            required: false,
                            type: "float",
                            min: 0, // zero or greater
                            description: descriptions.find(desc => desc.Variable === "PHISTOPTHRESH")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "PHISTOPTHRESH")?.Values || "No description available"
                        },
                        {
                            name: "LASTRUN",
                            required: false,
                            type: "integer",
                            min: 0,
                            max: 1, // zero or one
                            allowedValues: ["0", "1"],
                            description: descriptions.find(desc => desc.Variable === "LASTRUN")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "LASTRUN")?.Values || "No description available"
                        },
                        {
                            name: "PHIABANDON",
                            required: false,
                            type: "float",
                            min: 0, // a positive number
                            description: descriptions.find(desc => desc.Variable === "PHIABANDON")?.Description || "No description available",
                            values: descriptions.find(desc => desc.Variable === "PHIABANDON")?.Values || "No description available"
                        }
                    ];
                } else if (relativeLine === 7) {
                    // Line 9: ICOV ICOR IEIG [IRES] [JCOSAVE] [VERBOSEREC] [JCOSAVEITN] [REISAVEITN] [PARSAVEITN] [PARSAVERUN]
                    lineStructure = [
                        {
                            name: "ICOV",
                            required: true,
                            type: "integer",
                            order: 1,
                            min: 0,
                            max: 1,
                            allowedValues: ["0", "1"],
                            description: descriptions.find(desc => desc.Variable === "ICOV")?.Description || "Record covariance matrix in matrix file",
                            values: descriptions.find(desc => desc.Variable === "ICOV")?.Values || "No description available"
                        },
                        {
                            name: "ICOR",
                            required: true,
                            type: "integer",
                            order: 2,
                            min: 0,
                            max: 1,
                            allowedValues: ["0", "1"],
                            description: descriptions.find(desc => desc.Variable === "ICOR")?.Description || "Record correlation coefficient matrix in matrix file",
                            values: descriptions.find(desc => desc.Variable === "ICOR")?.Values || "No description available"
                        },
                        {
                            name: "IEIG",
                            required: true,
                            type: "integer",
                            order: 3,
                            min: 0,
                            max: 1,
                            allowedValues: ["0", "1"],
                            description: descriptions.find(desc => desc.Variable === "IEIG")?.Description || "Record eigenvectors in matrix file",
                            values: descriptions.find(desc => desc.Variable === "IEIG")?.Values || "No description available"
                        },
                        {
                            name: "IRES",
                            required: false,
                            type: "integer",
                            min: 0,
                            max: 1,
                            allowedValues: ["0", "1"],
                            description: descriptions.find(desc => desc.Variable === "IRES")?.Description || "Record resolution data",
                            values: descriptions.find(desc => desc.Variable === "IRES")?.Values || "No description available"
                        },
                        {
                            name: "JCOSAVE",
                            required: false,
                            type: "string",
                            allowedValues: ["jcosave", "nojcosave"],
                            description: descriptions.find(desc => desc.Variable === "JCOSAVE")?.Description || "Save best Jacobian file",
                            values: descriptions.find(desc => desc.Variable === "JCOSAVE")?.Values || "No description available"
                        },
                        {
                            name: "VERBOSEREC",
                            required: false,
                            type: "string",
                            allowedValues: ["verboserec", "noverboserec"],
                            description: descriptions.find(desc => desc.Variable === "VERBOSEREC")?.Description || "Verbose record settings",
                            values: descriptions.find(desc => desc.Variable === "VERBOSEREC")?.Values || "No description available"
                        },
                        {
                            name: "JCOSAVEITN",
                            required: false,
                            type: "string",
                            allowedValues: ["jcosaveitn", "nojcosaveitn"],
                            description: descriptions.find(desc => desc.Variable === "JCOSAVEITN")?.Description || "Save iteration-specific Jacobian files",
                            values: descriptions.find(desc => desc.Variable === "JCOSAVEITN")?.Values || "No description available"
                        },
                        {
                            name: "REISAVEITN",
                            required: false,
                            type: "string",
                            allowedValues: ["reisaveitn", "noreisaveitn"],
                            description: descriptions.find(desc => desc.Variable === "REISAVEITN")?.Description || "Save iteration-specific residual files",
                            values: descriptions.find(desc => desc.Variable === "REISAVEITN")?.Values || "No description available"
                        },
                        {
                            name: "PARSAVEITN",
                            required: false,
                            type: "string",
                            allowedValues: ["parsaveitn", "noparsaveitn"],
                            description: descriptions.find(desc => desc.Variable === "PARSAVEITN")?.Description || "Save iteration-specific parameter files",
                            values: descriptions.find(desc => desc.Variable === "PARSAVEITN")?.Values || "No description available"
                        },
                        {
                            name: "PARSAVERUN",
                            required: false,
                            type: "string",
                            allowedValues: ["parsaverun", "noparsaverun"],
                            description: descriptions.find(desc => desc.Variable === "PARSAVERUN")?.Description || "Save run-specific parameter files",
                            values: descriptions.find(desc => desc.Variable === "PARSAVERUN")?.Values || "No description available"
                        }
                    ];
                }

                const indexline = relativeLine;

                if (!lineStructure) {
                    console.log('No se encontró estructura para la línea');
                    return null;
                }

                const line_x = document.lineAt(position.line).text.trim();
                const values = line_x.split(/\s+/);

                console.log(`Línea ${indexline}: ${line_x}`);
                console.log(`Valores detectados: ${values.join(", ")}`);

                // Usar el nuevo parser según el tipo de línea
                const parsedVariables = parseLineByIndex(indexline, line_x, values, lineStructure);
                if (!parsedVariables) {
                    return null;
                }

                // Obtener la palabra bajo el cursor
                const wordRange = document.getWordRangeAtPosition(position, SCIENTIFIC_NUMBER_REGEX);
                // ... código previo ...

                // Obtener la palabra bajo el cursor con un regex que maneja:
                // [+-]?        -> signo opcional
                // \d*\.?\d+    -> números enteros y decimales
                // (?:[eE][+-]?\d+)? -> notación científica opcional
                // |\S+         -> o cualquier secuencia de caracteres no-espacio       
                if (!wordRange) {
                    return null;
                }



                const hoveredWord = document.getText(wordRange);
                if (!hoveredWord || hoveredWord.trim() === '') {
                    console.log("No valid word found at position");
                    return null;
                }

                // Get complete line text
                const line = document.lineAt(position.line);
                const words = line.text.trimStart().match(/[+-]?\d*\.?\d+(?:[eE][+-]?\d+)?|\S+/g) || [];


                // Find word index based on range position
                const wordIndex = words.findIndex((word, _index) => {
                    const startPos = line.text.indexOf(word);
                    const endPos = startPos + word.length;
                    return wordRange.start.character >= startPos && wordRange.end.character <= endPos;
                });

                const lineUpToCursor = document.getText(
                    new vscode.Range(position.line, 0, position.line, position.character)
                );
                console.log(`Position Line: ${position.line}, Position Character: ${position.character}`);

                // Use regex that preserves scientific notation
                const wordsBeforeCursor = lineUpToCursor.trimStart().match(/[+-]?\d*\.?\d+(?:[eE][+-]?\d+)?|\S+/g) || [];
                const occurrence = wordsBeforeCursor.filter(w => w === hoveredWord).length;

                // Find matching variable
                const matchedVariable = findMatchingVariable(parsedVariables, hoveredWord, occurrence);
                if (!matchedVariable) {
                    return createUndefinedVariableHover();
                }

                // Generate hover for the variable
                return createControlDataHover(matchedVariable, lineStructure);
            }
        }
    );

    const svdHoverProvider = vscode.languages.registerHoverProvider(
        { scheme: "file", pattern: "**/*.{pst}" },
        {
            provideHover(document, position) {
                console.log("=== SVD Hover Provider Started ===");
                const lines = document.getText().split("\n");
                const sections = detectSections(lines);
                const currentSection = findCurrentSection(sections, position.line);

                // Verificar si estamos en la sección SVD
                if (!currentSection || (currentSection.parent.toLowerCase() !== "singular value decomposition" && currentSection.parent.toLowerCase() !== "svd")) {
                    console.log("Not in SVD section");
                    return null;
                }

                // Calcular línea relativa dentro de la sección SVD
                const relativeLine = position.line - currentSection.start - 1;
                console.log(`Position Line: ${position.line}`);
                console.log(`Section Start: ${currentSection.start}`);
                console.log(`Relative Line (adjusted): ${relativeLine}`);

                // Ignorar la línea de encabezado
                if (relativeLine < 0) {
                    console.log('Índice negativo detectado, ignorando línea de encabezado');
                    return null;
                }

                // Definir la estructura según la línea
                let lineStructure;
                if (relativeLine === 0) {
                    // Primera línea: SVDMODE
                    lineStructure = [
                        {
                            name: "SVDMODE",
                            required: true,
                            type: "string",
                            order: 1,
                            allowedValues: ["0", "1"],
                            description: descriptions.find(desc => desc.Variable === "SVDMODE")?.Description || "Determines the type of SVD analysis to be performed",
                            values: descriptions.find(desc => desc.Variable === "SVDMODE")?.Values || "No description available"
                        }
                    ];
                } else if (relativeLine === 1) {
                    // Segunda línea: MAXSING EIGTHRESH
                    lineStructure = [
                        {
                            name: "MAXSING",
                            required: true,
                            type: "integer",
                            order: 1,
                            description: descriptions.find(desc => desc.Variable === "MAXSING")?.Description || "Maximum number of singular values to include in solution",
                            minValue: 1,
                            values: descriptions.find(desc => desc.Variable === "MAXSING")?.Values || "No description available"
                        },
                        {
                            name: "EIGTHRESH",
                            required: true,
                            type: "float",
                            order: 2,
                            description: descriptions.find(desc => desc.Variable === "EIGTHRESH")?.Description || "Eigenvalue ratio threshold for truncation",
                            minValue: 0,
                            maxValue: 1,
                            values: descriptions.find(desc => desc.Variable === "EIGTHRESH")?.Values || "No description available"
                        }
                    ];
                } else if (relativeLine === 2) {
                    // Tercera línea: EIGWRITE
                    lineStructure = [
                        {
                            name: "EIGWRITE",
                            required: true,
                            type: "integer",
                            order: 1,
                            allowedValues: ["0", "1", "2"],
                            description: descriptions.find(desc => desc.Variable === "EIGWRITE")?.Description || "Level of eigenanalysis reporting:\n0: Limited reporting\n1: Standard reporting\n2: Detailed reporting",
                            values: descriptions.find(desc => desc.Variable === "EIGWRITE")?.Values || "No description available"
                        }
                    ];
                }
                if (!lineStructure) {
                    console.log('No se encontró estructura para la línea');
                    return null;
                }

                // Obtener la palabra bajo el cursor
                const wordRange = document.getWordRangeAtPosition(position, SCIENTIFIC_NUMBER_REGEX);
                if (!wordRange) {
                    console.log("No word range found at cursor position");
                    return null;
                }



                const hoveredWord = document.getText(wordRange);
                if (!hoveredWord || hoveredWord.trim() === '') {
                    console.log("No valid word found at position");
                    return null;
                }

                // Use complete line and word range position instead of cursor position
                const line = document.lineAt(position.line);
                const words = line.text.trimStart().match(/[+-]?\d*\.?\d+(?:[eE][+-]?\d+)?|\S+/g) || [];
                if (words.length === 0) {
                    console.log("No valid words in line");
                    return null;
                }

                // Find index based on word range position, not cursor position
                const wordIndex = words.findIndex((word, _index) => {
                    const startPos = line.text.indexOf(word);
                    const endPos = startPos + word.length;
                    return wordRange.start.character >= startPos && wordRange.end.character <= endPos;
                });

                const lineUpToCursor = document.getText(
                    new vscode.Range(position.line, 0, position.line, position.character)
                );


                console.log(`Position Line: ${position.line}, Position Character: ${position.character}`);
                const variable = lineStructure[wordIndex];
                if (!variable) {
                    console.log(`No variable definition found for index ${wordIndex}`);
                    return null;
                }
                if (!variable) {
                    return null;
                }

                console.log(`Found variable: ${variable.name} for word: ${hoveredWord}`);

                // Validar el valor
                const isValid = validateType(hoveredWord, variable.type, variable.allowedValues, variable.minValue, variable.maxValue);


                // Crear el contenido del hover
                const hoverContent = new vscode.MarkdownString();
                hoverContent.isTrusted = true;
                hoverContent.appendMarkdown(`### 🧮 SVD Variable: ${variable.name}\n\n`);
                hoverContent.appendMarkdown(`📝 **Description:** ${variable.description}\n\n`);
                hoverContent.appendMarkdown(`📋 **Type:** \`${variable.type}\`\n\n`);
                hoverContent.appendMarkdown(`❗ **Required:** ${variable.required ? "Yes" : "No"}\n\n`);

                if (variable.allowedValues && variable.allowedValues.length > 0) {
                    hoverContent.appendMarkdown(`🎯 **Allowed Values:** ${variable.allowedValues.map((v: any) => `\`${v}\``).join(", ")}\n\n`);
                } else if (variable.values) {
                    hoverContent.appendMarkdown(`🎯 **Allowed Values:** ${variable.values.split(", ").map((v: any) => `\`${v}\``).join(", ")}\n\n`);
                }

                if (variable.minValue !== undefined) {
                    hoverContent.appendMarkdown(`⬇️ **Minimum Value:** ${variable.minValue}\n\n`);
                }

                if (variable.maxValue !== undefined) {
                    hoverContent.appendMarkdown(`⬆️ **Maximum Value:** ${variable.maxValue}\n\n`);
                }

                if (!isValid) {
                    hoverContent.appendMarkdown(`\n⚠️ **Warning:** Value \`${hoveredWord}\` is not valid for this variable.\n`);
                    hoverContent.appendMarkdown(`🔍 Recommend running PestCheck to validate the file\n\n`);
                    hoverContent.appendMarkdown(`[Run PestCheck](command:pestd3code.runPestCheck)`);
                }
                else {
                    hoverContent.appendMarkdown(`\n✅ **Valid Value:** \`${hoveredWord}\` satisfies the requirements.\n`);
                }

                console.log("=== SVD Hover Provider Completed ===");
                return new vscode.Hover(hoverContent);
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
                    end: lines.findIndex((l, i) => i > index && (l.trim().startsWith("*") || l.trim().startsWith("++"))) || lines.length
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
        _structure: any[]
    ): ParsedVariable[] | null {
        console.log('\n=== Control Data Line Parsing ===');
        console.log(`Line Index: ${indexline}`);
        console.log(`Raw Line: "${line}"`);
        console.log(`Tokens: [${values.join(', ')}]`);

        const mapped: ParsedVariable[] = [];

        // Line 2: RSTFLE PESTMODE
        if (indexline === 0) {
            if (values.length >= 1) {
                // RSTFLE
                const rstfle = values[0].toLowerCase();
                const validRstfle = ["restart", "norestart"].includes(rstfle);
                mapped.push({
                    name: "RSTFLE",
                    value: rstfle,
                    valid: validRstfle,
                    id: 1
                });

                // PESTMODE
                if (values.length >= 2) {
                    const pestmode = values[1].toLowerCase();
                    const validPestmode = ["estimation", "prediction", "regularization", "regularisation", "pareto"].includes(pestmode);
                    mapped.push({
                        name: "PESTMODE",
                        value: pestmode,
                        valid: validPestmode,
                        id: 2
                    });
                }
            }
            return mapped;
        }
        // Line 3: NPAR NOBS NPARGP NPRIOR NOBSGP [MAXCOMPDIM] [DERZEROLIM]
        else if (indexline === 1) {
            // Required variables first
            if (values.length >= 5) {
                // NPAR (integer)
                mapped.push({
                    name: "NPAR",
                    value: values[0],
                    valid: validateType(values[0], "integer"),
                    id: 1
                });

                // NOBS (integer)
                mapped.push({
                    name: "NOBS",
                    value: values[1],
                    valid: validateType(values[1], "integer"),
                    id: 2
                });

                // NPARGP (integer)
                mapped.push({
                    name: "NPARGP",
                    value: values[2],
                    valid: validateType(values[2], "integer"),
                    id: 3
                });

                // NPRIOR (integer)
                mapped.push({
                    name: "NPRIOR",
                    value: values[3],
                    valid: validateType(values[3], "integer"),
                    id: 4
                });

                // NOBSGP (integer, min=1)
                mapped.push({
                    name: "NOBSGP",
                    value: values[4],
                    valid: validateType(values[4], "integer", undefined, 1),
                    id: 5
                });

                // Process optional variables - usando lógica de slots
                let remainingValues = values.slice(5);

                // Para cada valor restante
                remainingValues.forEach((value, index) => {
                    let matched = false;

                    // Intentar hacer match con MAXCOMPDIM (integer)
                    if (!mapped.some(v => v.name === "MAXCOMPDIM") && validateType(value, "integer")) {
                        mapped.push({
                            name: "MAXCOMPDIM",
                            value: value,
                            valid: true,
                            id: index + 6  // 6 porque empezamos después de las 5 variables requeridas
                        });
                        matched = true;
                    }
                    // Intentar hacer match con DERZEROLIM (float)
                    else if (!mapped.some(v => v.name === "DERZEROLIM") && validateType(value, "float")) {
                        mapped.push({
                            name: "DERZEROLIM",
                            value: value,
                            valid: true,
                            id: index + 6
                        });
                        matched = true;
                    }

                    // Si no hubo match con ninguna variable opcional
                    if (!matched) {
                        mapped.push({
                            name: "UNDEFINED",
                            value: value,
                            valid: false,
                            id: index + 6
                        });
                    }
                });
            }

            // Mark missing optional variables
            const optionalVars = ["MAXCOMPDIM", "DERZEROLIM"];
            optionalVars.forEach(name => {
                if (!mapped.some(v => v.name === name)) {
                    mapped.push({
                        name: name,
                        value: "MISSING",
                        valid: true,
                        id: mapped.length + 1
                    });
                }
            });
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
                    id: 2
                });

                // PRECIS (string)
                mapped.push({
                    name: "PRECIS",
                    value: values[2],
                    valid: validateType(values[2], "string", ["single", "double"]),
                    id: 3
                });

                // DPOINT (string)
                mapped.push({
                    name: "DPOINT",
                    value: values[3],
                    valid: validateType(values[3], "string", ["point", "nopoint"]),
                    id: 4
                });

                // Process optional variables - usando lógica de slots
                let remainingValues = values.slice(4);

                // Para cada valor restante
                remainingValues.forEach((value, index) => {
                    let matched = false;

                    // Intentar hacer match con NUMCOM (integer)
                    if (!mapped.some(v => v.name === "NUMCOM") && validateType(value, "integer")) {
                        mapped.push({
                            name: "NUMCOM",
                            value: value,
                            valid: true,
                            id: index + 5  // 5 porque empezamos después de las 4 variables requeridas
                        });
                        matched = true;
                    }
                    // Intentar hacer match con JACFILE (integer 0 o 1)
                    else if (!mapped.some(v => v.name === "JACFILE") && validateType(value, "integer", ["0", "1"])) {
                        mapped.push({
                            name: "JACFILE",
                            value: value,
                            valid: true,
                            id: index + 5
                        });
                        matched = true;
                    }
                    // Intentar hacer match con MESSFILE (integer)
                    else if (!mapped.some(v => v.name === "MESSFILE") && validateType(value, "integer")) {
                        mapped.push({
                            name: "MESSFILE",
                            value: value,
                            valid: true,
                            id: index + 5
                        });
                        matched = true;
                    }
                    // Intentar hacer match con OBSREREF (string)
                    else if (!mapped.some(v => v.name === "OBSREREF") &&
                        validateType(value, "string", ["obsreref", "obsreref_N", "noobsreref"])) {
                        mapped.push({
                            name: "OBSREREF",
                            value: value,
                            valid: true,
                            id: index + 5
                        });
                        matched = true;
                    }

                    // Si no hubo match con ninguna variable opcional
                    if (!matched) {
                        mapped.push({
                            name: "UNDEFINED",
                            value: value,
                            valid: false,
                            id: index + 5
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
                        id: mapped.length + 1
                    });
                }
            });
        }
        // Line 5: RLAMBDA1 RLAMFAC PHIRATSUF PHIREDLAM NUMLAM [JACUPDATE] [LAMFORGIVE] [DERFORGIVE]
        else if (indexline === 3) {
            console.log("Processing line 5 (RLAMBDA1 and optimization parameters)");

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
                    id: 2
                });

                // PHIRATSUF (float)
                mapped.push({
                    name: "PHIRATSUF",
                    value: values[2],
                    valid: validateType(values[2], "float"),
                    id: 3
                });

                // PHIREDLAM (float)
                mapped.push({
                    name: "PHIREDLAM",
                    value: values[3],
                    valid: validateType(values[3], "float"),
                    id: 4
                });

                // NUMLAM (integer)
                mapped.push({
                    name: "NUMLAM",
                    value: values[4],
                    valid: validateType(values[4], "integer"),
                    id: 5
                });

                // Process optional variables - usando lógica de slots
                let remainingValues = values.slice(5);

                // Para cada valor restante
                remainingValues.forEach((value, index) => {
                    let matched = false;

                    // Intentar hacer match con JACUPDATE (integer)
                    if (!mapped.some(v => v.name === "JACUPDATE") && validateType(value, "integer")) {
                        mapped.push({
                            name: "JACUPDATE",
                            value: value,
                            valid: true,
                            id: index + 6
                        });
                        matched = true;
                    }
                    // Intentar hacer match con LAMFORGIVE (string)
                    else if (!mapped.some(v => v.name === "LAMFORGIVE") &&
                        value.toLowerCase() === "lamforgive") {
                        mapped.push({
                            name: "LAMFORGIVE",
                            value: value,
                            valid: true,
                            id: index + 6
                        });
                        matched = true;
                    }
                    // Intentar hacer match con DERFORGIVE (string)
                    else if (!mapped.some(v => v.name === "DERFORGIVE") &&
                        value.toLowerCase() === "derforgive") {
                        mapped.push({
                            name: "DERFORGIVE",
                            value: value,
                            valid: true,
                            id: index + 6
                        });
                        matched = true;
                    }

                    // Si no hubo match con ninguna variable opcional
                    if (!matched) {
                        mapped.push({
                            name: "UNDEFINED",
                            value: value,
                            valid: false,
                            id: index + 6
                        });
                    }
                });
            }

            // Mark missing optional variables
            const optionalVars = ["JACUPDATE", "LAMFORGIVE", "DERFORGIVE"];
            optionalVars.forEach(name => {
                if (!mapped.some(v => v.name === name)) {
                    mapped.push({
                        name: name,
                        value: "MISSING",
                        valid: true,
                        id: mapped.length + 1
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

    function parseLineByIndexRegul(
        lineIndex: number,
        values: string[],
        structure: any[]
    ): ParsedVariable[] {
        const mapped: ParsedVariable[] = [];
        console.log(`Parsing regularisation line ${lineIndex} with structure:`, structure);

        // Obtener variables requeridas y opcionales de la estructura
        const requiredVars = structure.filter(v => v.required);
        const optionalVars = structure.filter(v => !v.required);

        // Procesar variables requeridas primero
        for (let i = 0; i < requiredVars.length && i < values.length; i++) {
            const varDef = requiredVars[i];
            mapped.push({
                name: varDef.name,
                value: values[i],
                valid: validateType(values[i], varDef.type, varDef.allowedValues, varDef.minValue),
                id: i + 1
            });
        }

        // Procesar variables opcionales
        for (let i = requiredVars.length; i < values.length; i++) {
            const value = values[i];
            let matched = false;

            // Intentar hacer match con cada variable opcional
            for (const optVar of optionalVars) {
                if (!mapped.some(v => v.name === optVar.name) &&
                    validateType(value, optVar.type, optVar.allowedValues, optVar.minValue)) {
                    mapped.push({
                        name: optVar.name,
                        value: value,
                        valid: true,
                        id: i + 1
                    });
                    matched = true;
                    break;
                }
            }

            // Si no hubo match, marcar como indefinida
            if (!matched) {
                mapped.push({
                    name: "UNDEFINED",
                    value: value,
                    valid: false,
                    id: i + 1
                });
            }
        }

        return mapped;
    }

    function findMatchingVariableRegul(
        variables: ParsedVariable[],
        word: string,
        position: number
    ): ParsedVariable | null {
        console.log('\n=== Finding Matching Variable (Regularisation) ===');
        console.log(`Looking for: Word="${word}" at position ${position}`);

        // Convertir el word a número si es posible para comparación numérica
        const wordNum = parseFloat(word);
        const isWordNumeric = !isNaN(wordNum);

        // Encontrar la variable que corresponde a la posición en la línea
        const found = variables[position];
        if (!found) {
            console.log('No variable found at this position');
            return null;
        }

        console.log(`Checking variable at position ${position}:`, found);

        // Si el word es numérico, comparar los valores numéricos
        if (isWordNumeric) {
            const valueNum = parseFloat(found.value);
            if (!isNaN(valueNum) && Math.abs(valueNum - wordNum) < 1e-10) {
                console.log(`Match found! ${found.name} with value ${found.value}`);
                return found;
            }
        } else if (found.value === word) {
            // Para valores no numéricos, comparar strings directamente
            console.log(`Match found! ${found.name} with value ${found.value}`);
            return found;
        }

        console.log('No match found');
        return null;
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
                if (!isMatch) { count++; }
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
        markdown.appendMarkdown(`[Run PestCheck](command:pestd3code.runPestCheck "Run PestCheck")`);
        return new vscode.Hover(markdown);
    }

    function createControlDataHover(variable: ParsedVariable, structure: any[]): vscode.Hover | null {
        console.log('\n=== Creating Hover Content ===');
        console.log(`Variable: ${variable.name}, Value="${variable.value}", Valid=${variable.valid}`);

        const varStructure = structure.find((v: { name: string; type: string; description?: string; required: boolean; allowedValues?: string[], min?: number, max?: number, values?: string }) => v.name === variable.name);
        if (!varStructure) {
            console.log('No structure found for variable');
            return null;
        }

        console.log('Structure found:');
        console.log(`  Type: ${varStructure.type}`);
        console.log(`  Required: ${varStructure.required}`);
        console.log(`  Min Value: ${varStructure.min !== undefined ? varStructure.min : 'not set'}`);
        console.log(`  Max Value: ${varStructure.max !== undefined ? varStructure.max : 'not set'}`);

        const isValid = validateType(variable.value, varStructure.type, varStructure.allowedValues, varStructure.min, varStructure.max);

        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;
        markdown.appendMarkdown(
            `### 🔧 Control Data Variable: **${varStructure.name}**\n\n` +
            `📝 **Description:** ${varStructure.description || "No description available"}\n\n` +
            `📋 **Type:** \`${varStructure.type}\`\n\n` +
            (varStructure.allowedValues && varStructure.allowedValues.length > 0
                ? `🎯 **Allowed Values:** ${varStructure.allowedValues.map((v: any) => `\`${v}\``).join(", ")}\n\n`
                : (varStructure.values
                    ? `🎯 **Allowed Values:** ${varStructure.values.split(", ").map((v: any) => `\`${v}\``).join(", ")}\n\n`
                    : "")
            ) +
            `❗ **Required:** ${varStructure.required ? "Yes" : "No"}\n\n` +
            (varStructure.min !== undefined
                ? `⬇️ **Minimum Value:** ${varStructure.min}\n\n`
                : "") +
            (varStructure.max !== undefined
                ? `⬆️ **Maximum Value:** ${varStructure.max}\n\n`
                : "")
        );

        // Mostrar warning para variables inválidas (requeridas u opcionales)
        if (!variable.valid || !isValid) {
            console.log('Adding invalid value warning');
            markdown.appendMarkdown(
                `\n\n⚠️ **Invalid Value:** \`${variable.value}\` does not satisfy the requirements.\n\n` +
                `🔍 Recommend running PestCheck to validate the file\n\n` +
                `[Run PestCheck](command:pestd3code.runPestCheck)`
            );
        } else {
            markdown.appendMarkdown(
                `\n\n✅ **Valid Value:** \`${variable.value}\` satisfies the requirements.\n\n`
            );
        }

        return new vscode.Hover(markdown);
    }

    function validateType(value: string, type: string, allowedValues?: string[], minValue?: number, maxValue?: number): boolean {
        console.log(`Validating Type: Value="${value}", Type=${type}`);

        if (allowedValues && allowedValues.length > 0) {
            return allowedValues.includes(value);
        }

        switch (type.toLowerCase()) {
            case 'integer':
                const intValue = parseInt(value);
                const isInt = !isNaN(intValue) && Number.isInteger(Number(value));
                console.log(`  Integer validation result: ${isInt}`);
                if (!isInt) { return false; }
                if (minValue !== undefined && intValue < minValue) { return false; }
                if (maxValue !== undefined && intValue > maxValue) { return false; }
                return true;

            case 'float':
                const floatValue = parseFloat(value);
                const isFloat = !isNaN(floatValue) && Number.isFinite(Number(value));
                console.log(`  Float validation result: ${isFloat}`);
                if (!isFloat) { return false; }
                if (minValue !== undefined && floatValue < minValue) { return false; }
                if (maxValue !== undefined && floatValue > maxValue) { return false; }
                return true;

            case 'string':
                return typeof value === 'string';

            default:
                return false;
        }
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
                const wordRange = document.getWordRangeAtPosition(position, SCIENTIFIC_NUMBER_REGEX);
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
                        `### 🌐 PEST++ Variable: **${description.Variable}**\n\n` +
                        `📝 **Description:** *${description.Description}*\n\n` +
                        `📋 **Type:** \`${description.Type}\`\n\n` +
                        (description.Values
                            ? `🎯 **Allowed Values:** ${description.Values.split(", ")
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

    // Register hover providers in order of specificity
    context.subscriptions.push(regulHoverProvider);
    context.subscriptions.push(controlDataHoverProvider);
    context.subscriptions.push(svdHoverProvider);

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


    // #endregion Regularisation Section Hover Provider

    // #region Control Data Hover Provider
    /* 
        async function generatePestIndex(document: vscode.TextDocument): Promise<void> {
            console.log("=== Starting PEST Index Generation ===");
            console.log(`Processing file: ${document.fileName}`);
    
            const text = document.getText();
            const lines = text.split(/\r?\n/);
            console.log(`Total lines to process: ${lines.length}`);
    
            // Detect all sections first
            const sections = detectSections(lines);
            console.log("Detected sections:", sections.map(s => s.parent));
    
            let indexContent = "";
            let variablesProcessed = 0;
    
            // Procesar la sección de datos de control
            const controlSection = sections.find(s => s.parent.toLowerCase() === 'control data');
            if (controlSection) {
                console.log(`Procesando la sección de datos de control (líneas ${controlSection.start}-${controlSection.end})`);
                indexContent += "# Control Data\n\n";
    
                for (let i = controlSection.start; i <= controlSection.end; i++) {
                    const line = lines[i].trim();
                    if (!line || line.startsWith('*')) { continue; }
    
                    const values = line.split(/\s+/);
                    const lineIndex = i - controlSection.start - 1;
                    const parsedVariables = parseLineByIndex(lineIndex, line, values, []);
    
                    if (parsedVariables && parsedVariables.length > 0) {
                        console.log(`Processing control line ${lineIndex + 1}, found ${parsedVariables.length} variables`);
                        indexContent += `## Line ${lineIndex + 1}\n`;
                        parsedVariables.forEach(variable => {
                            if (variable.value !== "UNDEFINED" && variable.value !== "MISSING") {
                                indexContent += `${variable.name} = ${variable.value}\n`;
                                variablesProcessed++;
                            }
                        });
                        indexContent += "\n";
                    }
                }
            }
            const svdSection = sections.find(s => s.parent.toLowerCase() === 'singular value decomposition');
            if (svdSection) {
                console.log(`Processing SVD section (lines ${svdSection.start}-${svdSection.end})`);
                indexContent += "# SVD\n\n";
    
                for (let i = svdSection.start; i <= svdSection.end; i++) {
                    const line = lines[i].trim();
                    if (!line || line.startsWith('*')) { continue; }
    
                    const values = line.split(/\s+/);
                    const lineIndex = i - svdSection.start - 1;
                    const parsedVariables: SVDParsedVariable[] = parseLineByIndexSVD(lineIndex, values, []);
    
                    if (parsedVariables && parsedVariables.length > 0) {
                        console.log(`Processing SVD line ${lineIndex + 1}, found ${parsedVariables.length} variables`);
                        indexContent += `## Line ${lineIndex + 1}\n`;
                        parsedVariables.forEach(variable => {
                            if (variable.value && variable.value !== "UNDEFINED" && variable.value !== "MISSING") {
                                indexContent += `${variable.name} = ${variable.value}\n`;
                                variablesProcessed++;
                            }
                        });
                        indexContent += "\n";
                    }
                }
            }
    
            // Process Regularization section
            const regulSection = sections.find(s => s.parent.toLowerCase() === 'regularization');
            if (regulSection) {
                console.log(`Processing Regularization section (lines ${regulSection.start}-${regulSection.end})`);
                indexContent += "# Regularization\n\n";
    
                for (let i = regulSection.start; i <= regulSection.end; i++) {
                    const line = lines[i].trim();
                    if (!line || line.startsWith('*')) { continue; }
    
                    const values = line.split(/\s+/);
                    const lineIndex = i - regulSection.start - 1;
                    const parsedVariables = parseLineByIndexRegul(lineIndex, values, regularizationDataStructure[lineIndex] || []);
    
                    if (parsedVariables && parsedVariables.length > 0) {
                        console.log(`Processing regularization line ${lineIndex + 1}, found ${parsedVariables.length} variables`);
                        indexContent += `## Line ${lineIndex + 1}\n`;
                        parsedVariables.forEach(variable => {
                            if (variable.value && variable.value !== "UNDEFINED" && variable.value !== "MISSING") {
                                indexContent += `${variable.name} = ${variable.value}\n`;
                                variablesProcessed++;
                            }
                        });
                        indexContent += "\n";
                    }
                }
            }
    
            // Write to pestindex.md
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                console.error("No workspace folder found");
                return;
            }
    
            let indexPath = path.join(workspaceFolder.uri.fsPath, 'pestindex.md');
            const headerIdentifier = "# Generated by pestd3code";
    
            // Determine the new index path based on the open .pst file
            const pstFileName = path.basename(document.fileName, '.pst');
            indexPath = path.join(workspaceFolder.uri.fsPath, `${pstFileName}.md`);
    
            // Check if the file exists
            if (fs.existsSync(indexPath)) {
                const existingContent = await fs.promises.readFile(indexPath, 'utf8');
                if (!existingContent.startsWith(headerIdentifier)) {
                    // File exists but was not created by pestd3code
                    const newIndexPath = path.join(workspaceFolder.uri.fsPath, `${pstFileName}_pestd3code.md`);
                    const userResponse = await vscode.window.showWarningMessage(
                        `The file '${pstFileName}.md' already exists and was not created by pestd3code. Do you want to rename the new file to '${pstFileName}_pestd3code.md'?`,
                        'Yes', 'No'
                    );
                    if (userResponse === 'Yes') {
                        indexPath = newIndexPath;
                    } else {
                        console.log("User chose not to rename the file. Exiting the process.");
                        return;
                    }
                }
            }
    
            // Add header to the content
            indexContent = `${headerIdentifier}\n\n${indexContent}`;
            await fs.promises.writeFile(indexPath, indexContent, 'utf8');
            console.log(`=== PEST Index Generation Complete ===`);
            console.log(`- Total variables processed: ${variablesProcessed}`);
            console.log(`- Index file saved to: ${indexPath}`);
    
            // Show information message to user
            vscode.window.showInformationMessage(`PEST Index updated with ${variablesProcessed} variables`);
        }
    
        // Event listener for when a PST file is opened
        context.subscriptions.push(
            vscode.workspace.onDidOpenTextDocument(async (document) => {
                if (document.fileName.endsWith('.pst')) {
                    await generatePestIndex(document);
                }
            })
        );
    
        // Event listener for when a PST file is saved
        context.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument(async (document) => {
                if (document.fileName.endsWith('.pst')) {
                    await generatePestIndex(document);
                }
            })
        );
    
        // Event listener for when a PST file is modified
        let timeout: NodeJS.Timeout | undefined = undefined;
        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(async (event) => {
                if (event.document.fileName.endsWith('.pst')) {
                    // Clear previous timeout
                    if (timeout) {
                        clearTimeout(timeout);
                    }
                    // Set new timeout to avoid too frequent updates
                    timeout = setTimeout(async () => {
                        await generatePestIndex(event.document);
                    }, 1000); // Wait 1 second after last change
                }
            })
        ); */

    // Add new command registration
    context.subscriptions.push(
        vscode.commands.registerCommand("pestd3code.simulateUpdate", async () => {
            console.log("Simulating extension update...");

            // Reset the last version to trigger update message
            await context.globalState.update("lastVersion", "0.0.0");

            // Reload window to trigger activation event
            await vscode.commands.executeCommand("workbench.action.reloadWindow");
        })
    );

    // Add new command registration
    context.subscriptions.push(
        vscode.commands.registerCommand("pestd3code.simulateOldVersion", async () => {
            console.log("Simulating old version...");

            // Set last version to an old version number
            await context.globalState.update("lastVersion", "0.0.1");

            // Reset auto-update suggestion state to test that flow too
            await context.globalState.update("hasAutoUpdateBeenSuggested", false);

            vscode.window.showInformationMessage("PestD3Code version state has been reset to 0.0.1");
            console.log("Version simulation completed");
        })
    );
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

interface SVDParsedVariable {
    name: string;
    value: string;
    valid: boolean;
    id: number;
}

function isNumeric(value: string): boolean {
    return !isNaN(parseFloat(value)) && isFinite(Number(value));
}

function parseLineByIndexSVD(
    indexline: number,
    values: string[],
    _structure: any[]
): SVDParsedVariable[] {
    console.log('\n=== SVD Line Parsing ===');
    console.log(`Line Index: ${indexline}`);
    console.log(`Values: [${values.join(', ')}]`);

    const mapped: SVDParsedVariable[] = [];

    // Line 1: SVDMODE
    if (indexline === 0) {
        if (values.length >= 1) {
            mapped.push({
                name: "SVDMODE",
                value: values[0],
                valid: validateType(values[0], "integer", ["0", "1"]),
                id: 1
            });
        }
    }
    // Line 2: MAXSING EIGTHRESH
    else if (indexline === 1) {
        if (values.length >= 1) {
            mapped.push({
                name: "MAXSING",
                value: values[0],
                valid: validateType(values[0], "integer", undefined, 1), // debe ser mayor que cero
                id: 1
            });
        }
        if (values.length >= 2) {
            mapped.push({
                name: "EIGTHRESH",
                value: values[1],
                valid: isNumeric(values[1]) && parseFloat(values[1]) >= 0 && parseFloat(values[1]) < 1, // debe ser >= 0 y < 1
                id: 2
            });
        }
    }
    // Line 3: EIGWRITE
    else if (indexline === 2) {
        if (values.length >= 1) {
            mapped.push({
                name: "EIGWRITE",
                value: values[0],
                valid: validateType(values[0], "integer", ["0", "1"]),
                id: 1
            });
        }
    }

    console.log('Mapped variables:', mapped);
    return mapped;
}
