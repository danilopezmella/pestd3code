import { Diagnostic, DiagnosticSeverity, Range } from 'vscode';

export interface PestchekResult {
    type: 'ERROR' | 'WARNING';
    file: string;
    diagnostic: Diagnostic;
}
