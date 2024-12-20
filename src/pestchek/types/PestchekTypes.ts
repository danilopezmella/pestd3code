import { Diagnostic, DiagnosticSeverity, Range } from 'vscode';

export interface PestchekResult {
    file: string;
    diagnostic: Diagnostic;
    type: 'ERROR' | 'WARNING' | 'INFO' | 'HINT';
    diagnosticInfo?: 0 | 1 | 2 | 3;
}
