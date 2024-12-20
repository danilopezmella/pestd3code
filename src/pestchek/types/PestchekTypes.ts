import { Diagnostic, DiagnosticSeverity, Range } from 'vscode';

export interface PestchekResult {
    file: string;
    diagnostic: Diagnostic;
}
