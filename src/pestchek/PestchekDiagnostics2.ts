import { PestchekResult } from './types/PestchekTypes';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode';

interface DiagnosticInfo {
    start: { line: number; character: number };
    end: { line: number; character: number };
}

function createDiagnostic(
    type: 'ERROR' | 'WARNING',
    message: string,
    range?: DiagnosticInfo,
    severity?: DiagnosticSeverity
): PestchekResult {
    const diagnosticRange = range || {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 100 }
    };

    return {
        type: type,
        file: '',
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

    const lines = output.split('\n').map(l => l.trim());
    console.log('Procesando líneas:', lines);

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
        if (!currentSection) { continue; }

        // Detectar errores con número de línea específico
        const lineMatch = line.match(/Line\s+(\d+)\s+of\s+file\s+([^:]+):\s*(.*)/);
        if (lineMatch) {
            const lineNumber = parseInt(lineMatch[1]);
            const errorMessage = lineMatch[3];

            results.push(createDiagnostic(
                currentSection,
                errorMessage.trim(),
                {
                    start: { line: lineNumber - 1, character: 0 },
                    end: { line: lineNumber - 1, character: Number.MAX_VALUE }
                },
                currentSection === 'ERROR' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning
            ));
            continue;
        }

        // Procesar otros mensajes de error/warning
        if (line.trim()) {
            let message = line;
            let j = i + 1;

            // Concatenar líneas adicionales del mismo mensaje
            while (j < lines.length && lines[j].trim() &&
                !lines[j].startsWith('Cannot open') &&
                !lines[j].startsWith('Line') &&
                !lines[j].startsWith('Errors') &&
                !lines[j].startsWith('Warnings')) {
                message += ' ' + lines[j].trim();
                j++;
            }
            i = j - 1;

            if (message.trim()) {
                results.push(createDiagnostic(
                    currentSection,
                    message.trim(),
                    undefined,
                    currentSection === 'ERROR' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning
                ));
            }
        }
    }

    console.log('Resultados del parsing:', results);
    return results;
} 