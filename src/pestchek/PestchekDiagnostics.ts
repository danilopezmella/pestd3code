import { PestchekResult } from './types/PestchekTypes';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { DiagnosticSeverity } from 'vscode';

const execAsync = promisify(exec);

export async function analyzePestFile(filePath: string): Promise<PestchekResult[]> {
    try {
        // Ejecutar pestchek
        const baseName = path.basename(filePath, '.pst');
        const dirName = path.dirname(filePath);
        const { stdout } = await execAsync('pestchek ' + baseName, { cwd: dirName });
        
        return parsePestchekOutput(stdout, baseName);
    } catch (error: any) {
        // Si hay error en la ejecución pero tenemos stdout, intentamos parsear
        if (error.stdout) {
            return parsePestchekOutput(error.stdout, path.basename(filePath, '.pst'));
        }
        throw error;
    }
}

export function parsePestchekOutput(output: string, _fileName: string): PestchekResult[] {
    const results: PestchekResult[] = [];
    let currentSection: 'ERROR' | 'WARNING' | null = null;
    let currentBlock: { file: string; messages: string[]; firstLine: number; currentMessage: string[] } | null = null;

/*     // Agregar el warning inicial
    results.push(createDiagnostic(
        'WARNING',
        'PESTCHEK Version 18.25. Watermark Numerical Computing.',
        1,
        fileName
    ));
 */
    const lines = output.split('\n').map(l => l.trim());

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Ignorar líneas vacías
        if (!line) {
            if (currentBlock && currentBlock.currentMessage.length > 0) {
                const fullMessage = currentBlock.currentMessage.join(' ');
                const isPestFile = currentBlock && (currentBlock.file.endsWith('.pst') || currentBlock.file.endsWith('.pest'));
                const messageToStore = isPestFile ? 
                    fullMessage :
                    `Line ${currentBlock.firstLine} of ${currentBlock.file}: ${fullMessage}`;
                
                currentBlock.messages.push(messageToStore);
                currentBlock.currentMessage = [];
            }
            continue;
        }

        // Detectar sección
        if (line.startsWith('PESTCHEK Version')) {
            continue;
        } else if (line.startsWith('Errors ----->')) {
            currentSection = 'ERROR';
            continue;
        }

        // Procesar líneas de error
        if (currentSection === 'ERROR') {
            const lineMatch = line.match(/^Line\s+(\d+)\s+of\s+([^:]+):\s*(.*)/);
            if (lineMatch) {
                // Si hay un mensaje acumulado, guardarlo
                if (currentBlock && currentBlock.currentMessage.length > 0) {
                    const fullMessage = currentBlock.currentMessage.join(' ');
                    const isPestFile = currentBlock && (currentBlock.file.endsWith('.pst') || currentBlock.file.endsWith('.pest'));
                    const messageToStore = isPestFile ? 
                        fullMessage :
                        `Line ${currentBlock.firstLine} of ${currentBlock.file}: ${fullMessage}`;
                    
                    currentBlock.messages.push(messageToStore);
                    currentBlock.currentMessage = [];
                }

                const [, lineNum, file, message] = lineMatch;
                
                // Si es un nuevo archivo o primer bloque
                if (!currentBlock || currentBlock.file !== file) {
                    // Si hay un bloque anterior, procesarlo
                    if (currentBlock) {
                        // Verificar si hay referencia a dos archivos diferentes
                        const hasSecondFileReference = currentBlock.messages.some(msg => 
                            msg.includes('file') && msg.includes('.pst')
                        );

                        if (hasSecondFileReference) {
                            // Si hay referencia a dos archivos, mostrar todo en línea 0
                            results.push(createDiagnostic(
                                'WARNING',
                                currentBlock.messages.join('\n'),
                                1,
                                currentBlock?.file ?? '',
                                {
                                    start: { line: 0, character: 0 },
                                    end: { line: 0, character: 100 }
                                }
                            ));
                        } else {
                            // Si solo hay un archivo, mostrar cada error en su línea correspondiente
                            currentBlock.messages.forEach((msg: string) => {
                                const isPestFile = currentBlock && (currentBlock.file.endsWith('.pst') || currentBlock.file.endsWith('.pest'));
                                if (isPestFile) {
                                    results.push(createDiagnostic(
                                        'ERROR',
                                        msg,
                                        0,
                                        currentBlock?.file ?? '',
                                        {
                                            start: { line: (currentBlock?.firstLine ?? 1) - 1, character: 0 },
                                            end: { line: (currentBlock?.firstLine ?? 1) - 1, character: 100 }
                                        }
                                    ));
                                } else {
                                    // Para otros archivos, mantener el mensaje completo
                                    results.push(createDiagnostic(
                                        'WARNING',
                                        msg,
                                        2,
                                        currentBlock?.file ?? '',
                                        {
                                            start: { line: 0, character: 0 },
                                            end: { line: 0, character: 100 }
                                        }
                                    ));
                                }
                            });
                        }
                    }
                    // Iniciar nuevo bloque
                    currentBlock = {
                        file,
                        messages: [],
                        firstLine: parseInt(lineNum),
                        currentMessage: [message]
                    };
                } else {
                    currentBlock.firstLine = parseInt(lineNum);
                    currentBlock.currentMessage = [message];
                }
                continue;
            }

            // Si no es una línea que comienza con "Line", agregar al mensaje actual
            if (currentBlock) {
                currentBlock.currentMessage.push(line);
            }
        }
    }

    // Procesar el último mensaje acumulado si existe
    if (currentBlock && currentBlock.currentMessage.length > 0) {
        const fullMessage = currentBlock.currentMessage.join(' ');
        const isPestFile = currentBlock.file.endsWith('.pst') || currentBlock.file.endsWith('.pest');
        const messageToStore = isPestFile ? 
            fullMessage :
            `Line ${currentBlock.firstLine} of ${currentBlock.file}: ${fullMessage}`;
        
        currentBlock.messages.push(messageToStore);
    }

    // Procesar el último bloque si existe
    if (currentBlock) {
        const hasSecondFileReference = currentBlock.messages.some(msg => 
            msg.includes('file') && msg.includes('.pst')
        );

        if (hasSecondFileReference) {
            // Si hay referencia a dos archivos, mostrar todo en línea 0
            results.push(createDiagnostic(
                'WARNING',
                currentBlock.messages.join('\n'),
                1,
                currentBlock.file,
                {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 100 }
                }
            ));
        } else {
            // Si solo hay un archivo, mostrar cada error en su línea correspondiente
            currentBlock.messages.forEach((msg) => {
                const isPestFile = currentBlock.file.endsWith('.pst') || currentBlock.file.endsWith('.pest');
                if (isPestFile) {
                    results.push(createDiagnostic(
                        'ERROR',
                        msg,
                        0,
                        currentBlock.file,
                        {
                            start: { line: currentBlock.firstLine - 1, character: 0 },
                            end: { line: currentBlock.firstLine - 1, character: 100 }
                        }
                    ));
                } else {
                    // Para otros archivos, mantener el mensaje completo
                    results.push(createDiagnostic(
                        'WARNING',
                        msg,
                        2,
                        currentBlock.file,
                        {
                            start: { line: 0, character: 0 },
                            end: { line: 0, character: 100 }
                        }
                    ));
                }
            });
        }
    }

    return results;
}

function createDiagnostic(
    tipo: 'ERROR' | 'WARNING',
    descripcion: string,
    severity: DiagnosticSeverity,
    archivo: string = '',
    range?: { start: { line: number; character: number }; end: { line: number; character: number } }
): PestchekResult {
    return {
        tipo,
        descripcion,
        valor: '',
        archivo,
        linea: range?.start.line,
        severity,
        range
    };
}