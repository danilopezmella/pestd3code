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
    let currentMessage: string | null = null;
    let currentLineNumber: number | null = null;
    let pendingMessage: string | null = null;

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
        
  // Add this new condition before the lineMatch check
  if (line.startsWith('Cannot open')) {
    results.push(createDiagnostic(
        'ERROR',
        line + (lines[i + 1]?.trim().startsWith('observation group') ? ' ' + lines[++i].trim() : ''),
        {
            start: { line: 0, character: 0 },
            end: { line: 0, character: Number.MAX_VALUE }
        }
    ));
    continue;
}
        // Detectar inicio de un nuevo error con número de línea
        const lineMatch = line.match(/Line\s+(\d+)\s+of\s+file\s+([^:]+):\s*(.*)/);
        if (lineMatch) {
            // Si teníamos un mensaje pendiente, lo agregamos
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

            // Iniciar nuevo mensaje
            currentLineNumber = parseInt(lineMatch[1]);
            currentMessage = lineMatch[3];
            continue;
        }

        // Acumular líneas adicionales al mensaje actual
        if (currentMessage && line.trim() && 
            !line.startsWith('Cannot open') &&
            !line.startsWith('Errors') &&
            !line.startsWith('Warnings')) {
            currentMessage += ' ' + line.trim();
        }
    }

    // No olvidar el último mensaje si existe
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

    console.log('Resultados del parsing:', results);
    return results;
} 