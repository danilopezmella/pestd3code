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
    const results: PestchekResult[] = [];
    let currentSection: 'ERROR' | 'WARNING' | null = null;

    // Agregar el warning inicial
    results.push(createDiagnostic(
        'WARNING',
        'PESTCHEK Version 18.25. Watermark Numerical Computing.',
        {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 }
        },
        fileName,
    ));

    const lines = output.split('\n').map(l => l.trim());

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        console.log(`Procesando línea ${i}: ${line}`);

        if (line.startsWith('PESTCHEK Version')) {
            console.log('Encontrada versión de PESTCHEK, continuando...');
            continue;
        } else if (line.startsWith('Errors ----->')) {
            console.log('Sección de errores encontrada');
            currentSection = 'ERROR';
            continue;
        } else if (line.startsWith('Warnings ----->')) {
            console.log('Sección de advertencias encontrada');
            currentSection = 'WARNING';
            continue;
        }

        if (!currentSection) continue;

        const lineMatch = line.match(/Line\s+(\d+)\s+of\s+(?:instruction\s+)?file\s+([^:]+):/);
        
        if (lineMatch) {
            const reportedLineNumber = parseInt(lineMatch[1]);
            let file = lineMatch[2];
            console.log(`Línea reportada: ${reportedLineNumber}, Archivo: ${file}`);
            
            // Convertir la ruta del archivo si es necesario
            file = getOriginalPstFile(file);
            console.log(`Archivo convertido: ${file}`);
            
            let message = line;
            
            // Buscar el número de línea real en el archivo
            const actualLineNumber = findLineNumberInFile(file, message);
            console.log(`Archivo: ${file}, Línea reportada: ${reportedLineNumber}, Línea encontrada: ${actualLineNumber}`);

            // Si el mensaje continúa en la siguiente línea
            while (i + 1 < lines.length && !lines[i + 1].match(/Line\s+\d+/) && lines[i + 1].trim()) {
                i++;
                message += ' ' + lines[i].trim();
                console.log(`Mensaje extendido: ${message}`);
            }
            const lineNumber = actualLineNumber || reportedLineNumber;
            console.log(`Número de línea usado: ${lineNumber}`);
            results.push(createDiagnostic(
                currentSection,
                message,
                {
                    start: { line: lineNumber - 1, character: 0 },
                    end: { line: lineNumber - 1, character: Number.MAX_VALUE }
                },
                file,
                currentSection === 'ERROR' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning
            ));
            console.log(`Diagnóstico creado: ${message}`);
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