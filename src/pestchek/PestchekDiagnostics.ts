import { PestchekResult } from './types/PestchekTypes';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode';
import * as fs from 'fs';

const execAsync = promisify(exec);

interface DiagnosticInfo {
    start: { line: number; character: number };
    end: { line: number; character: number };
}

function createDiagnostic(
    type: 'ERROR' | 'WARNING',
    message: string,
    range?: DiagnosticInfo,
    file?: string,
    severity?: DiagnosticSeverity
): PestchekResult {
    const diagnosticRange = range || {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 100 }
    };

    return {
        type: type,
        diagnostic: new Diagnostic(
            new Range(
                diagnosticRange.start.line,
                diagnosticRange.start.character,
                diagnosticRange.end.line,
                diagnosticRange.end.character
            ),
            message,
            severity ?? (type === 'ERROR' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning)
        ),
        file: file || ''
    };
}


function getOriginalPstFile(copyFile: string): string {
    // Si el archivo es un .pst y comienza con copy_, retornamos el original
    if (copyFile.endsWith('.pst') && copyFile.startsWith('copy_')) {
        return copyFile.replace('copy_', '');
    }
    return copyFile;
}

export function parsePestchekOutput(output: string, fileName: string): PestchekResult[] {
    const absoluteFilePath = path.isAbsolute(fileName) ? fileName : path.resolve(fileName);
    console.log(`Procesando archivo: ${absoluteFilePath}`);

    const results: PestchekResult[] = [];
    let currentSection: 'ERROR' | 'WARNING' | null = null;

    const lines = output.split('\n').map(l => l.trim());

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith('PESTCHEK Version')) {
            continue;
        } else if (line.startsWith('Errors ----->')) {
            currentSection = 'ERROR';
            continue;
        } else if (line.startsWith('Warnings ----->')) {
            currentSection = 'WARNING';
            continue;
        }
        if (!currentSection) {continue;}

        // Primero intentamos detectar errores con número de línea específico
        const lineMatch = line.match(/Line\s+(\d+)\s+of\s+file\s+([^:]+):\s*(.*)/);
        if (lineMatch) {
            const lineNumber = parseInt(lineMatch[1]);
            const errorMessage = lineMatch[3];
            
            results.push(createDiagnostic(
                'ERROR',
                errorMessage.trim(),
                {
                    start: { line: lineNumber - 1, character: 0 },
                    end: { line: lineNumber - 1, character: Number.MAX_VALUE }
                },
                absoluteFilePath,
                DiagnosticSeverity.Error
            ));
            continue;
        }

        // Si no es un error con número de línea, procesamos errores con grupos de observación
        if (currentSection === 'ERROR' && line.trim()) {
            let errorMessage = line;
            let j = i + 1;
            
            while (j < lines.length && lines[j].trim() && 
                   !lines[j].startsWith('Cannot open') && 
                   !lines[j].startsWith('Line') && 
                   !lines[j].startsWith('Errors') && 
                   !lines[j].startsWith('Warnings')) {
                errorMessage += ' ' + lines[j].trim();
                j++;
            }
            i = j - 1;

            const observationGroup = errorMessage.match(/"([^"]+)"/);
            if (observationGroup) {
                const groupName = observationGroup[1];
                const lineNumber = findLineNumberInFile(absoluteFilePath, groupName);
                
                if (lineNumber > 0) {
                    results.push(createDiagnostic(
                        'ERROR',
                        errorMessage.trim(),
                        {
                            start: { line: lineNumber - 1, character: 0 },
                            end: { line: lineNumber - 1, character: Number.MAX_VALUE }
                        },
                        absoluteFilePath,
                        DiagnosticSeverity.Error
                    ));
                }
            }

            if (j < lines.length && lines[j].startsWith('Cannot open')) {
                i = j - 1;
            }
        }
    }
    return results;
}

function findLineNumberInFile(filePath: string, searchText: string): number {
    try {
        console.log(`Buscando en archivo: ${filePath}`);
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(searchText)) {
                console.log(`Encontrado en línea ${i}`);
                return i + 1; // +1 porque los editores empiezan en línea 1
            }
        }
        console.log('No se encontró el texto');
    } catch (error) {
        console.error('Error leyendo archivo:', error);
    }
    return 0;
}