import { DiagnosticSeverity } from 'vscode';

export interface PestchekResult {
    tipo: 'ERROR' | 'WARNING';
    descripcion: string;
    valor: string;
    archivo: string;
    severity: DiagnosticSeverity;
    linea?: number;
    range?: {
        start: { line: number; character: number; };
        end: { line: number; character: number; };
    };
}