import { PestchekResult } from './types/PestchekTypes';
import { Diagnostic, DiagnosticSeverity, Range, Uri, workspace } from 'vscode';
import path from 'path';

interface DiagnosticInfo {
    start: { line: number; character: number };
    end: { line: number; character: number };
}

function resolveFilePath(filePath: string, workspaceRoot: string): string {
    console.log('Resolving file path:', {
        filePath,
        workspaceRoot,
        isAbsolute: path.isAbsolute(filePath)
    });

    if (path.isAbsolute(filePath)) {
        return filePath;
    }
    return path.resolve(workspaceRoot, filePath);
}

function createDiagnostic(
    type: 'ERROR' | 'WARNING',
    message: string,
    range?: DiagnosticInfo,
    severity?: DiagnosticSeverity,
    file?: string
): PestchekResult {
    const workspaceRoot = workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    const resolvedFile = file ? resolveFilePath(file, workspaceRoot) : '';

    console.log('Creating diagnostic:', {
        type,
        message,
        originalFile: file,
        resolvedFile,
        workspaceRoot
    });

    const diagnosticRange = range || {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 100 }
    };

    return {
        type: type,
        file: resolvedFile,
        diagnostic: new Diagnostic(
            new Range(
                diagnosticRange.start.line,
                diagnosticRange.start.character,
                diagnosticRange.end.line,
                diagnosticRange.end.character
            ),
            message,
            severity ?? (type === 'ERROR' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning)
        )
    };
}

export function parsePestchekOutput(output: string): PestchekResult[] {
    const results: PestchekResult[] = [];
    let currentSection: 'ERROR' | 'WARNING' | null = null;
    let currentMessage: string | null = null;
    let currentLineNumber: number | null = null;

    const lines = output.split('\n').map(l => l.trim());
    console.log('Processing lines:', lines);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Skip empty lines and version info
        if (!line || line.startsWith('PESTCHEK Version')) {
            continue;
        } else if (line === 'Errors ----->') {
            currentSection = 'ERROR';
            continue;
        } else if (line === 'Warnings ----->') {
            currentSection = 'WARNING';
            continue;
        }

        if (!currentSection || line === 'No errors encountered.') {
            continue;
        }

        const lineMatch = line.match(/Line\s+(\d+)\s+of\s+file\s+([^:]+):/);
        if (lineMatch) {
            // Send pending message if exists
            if (currentMessage && currentSection) {
                results.push(createDiagnostic(
                    currentSection,
                    currentMessage.trim(),
                    currentLineNumber ? {
                        start: { line: currentLineNumber - 1, character: 0 },
                        end: { line: currentLineNumber - 1, character: Number.MAX_VALUE }
                    } : undefined
                ));
            }

            // Start new message
            currentLineNumber = parseInt(lineMatch[1]);
            currentMessage = line.split(':')[1]?.trim() || '';

            // Accumulate additional lines while they're not new errors
            while (i + 1 < lines.length &&
                lines[i + 1].trim() &&
                !lines[i + 1].match(/Line\s+\d+/) &&
                !lines[i + 1].startsWith('Errors') &&
                !lines[i + 1].startsWith('Warnings')) {
                currentMessage += ' ' + lines[++i].trim();
            }
            continue;
        }

        // Handle instruction file errors
        const instructionMatch = line.match(/Line\s+(\d+)\s+of\s+instruction\s+file\s+([^:]+):/);
        if (instructionMatch) {
            console.log('Found instruction file error:', line);
            const lineNum = parseInt(instructionMatch[1]);
            const insFile = instructionMatch[2];
            let message = line.split(':')[1]?.trim() || '';

            // Accumulate multiline message
            while (i + 1 < lines.length &&
                lines[i + 1].trim() &&
                !lines[i + 1].match(/Line\s+\d+/) &&
                !lines[i + 1].startsWith('Errors') &&
                !lines[i + 1].startsWith('Warnings')) {
                message += ' ' + lines[++i].trim();
            }

            console.log('Creating diagnostic for instruction file:', {
                lineNum,
                insFile,
                message
            });

            results.push(createDiagnostic(
                'ERROR',
                message.trim(),
                {
                    start: { line: lineNum - 1, character: 0 },
                    end: { line: lineNum - 1, character: Number.MAX_VALUE }
                },
                undefined,
                insFile
            ));
            continue;
        }

        // Accumulate additional lines to current message
        if (currentMessage && line.trim() &&
            !line.startsWith('Cannot open') &&
            !line.startsWith('Errors') &&
            !line.startsWith('Warnings')) {
            currentMessage += ' ' + line.trim();
        }

        // Handle "Cannot open" errors
        if (line.startsWith('Cannot open')) {
            results.push(createDiagnostic(
                'ERROR',
                line + (lines[i + 1]?.trim().startsWith('observation group') ? ' ' + lines[++i].trim() : ''),
                {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: Number.MAX_VALUE }
                }
            ));
        }
    }

    // Don't forget last message if exists
    if (currentMessage && currentSection) {
        results.push(createDiagnostic(
            currentSection,
            currentMessage.trim(),
            currentLineNumber ? {
                start: { line: currentLineNumber - 1, character: 0 },
                end: { line: currentLineNumber - 1, character: Number.MAX_VALUE }
            } : undefined
        ));
    }

    console.log('Parsing results:', results);
    return results;
} 