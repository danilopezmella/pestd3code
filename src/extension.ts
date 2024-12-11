import * as vscode from "vscode";
import * as fs from "fs";
import { parse } from "csv-parse/sync";
import * as path from "path";

type DescriptionData = {
  controlid: string;
  itemid: string;
  Parent: string;
  Variable: string;
  Type: string;
  Values: string;
  Description: string;
  Line: string;
  Position: string;
  Mandatory: string;
};

let disposables: vscode.Disposable[] = [];

let descriptions: DescriptionData[] = [];

type VariableWithAllowedValues = {
  name: string;
  type: string;
  required: boolean;
  allowedValues: string[]; // Solo las variables con valores permitidos
};

type VariableWithoutAllowedValues = {
  name: string;
  type: string;
  required: boolean;
};

type Variable = VariableWithAllowedValues | VariableWithoutAllowedValues;

// #region Load descriptions from CSV file
async function loadDescriptions(
  context: vscode.ExtensionContext
): Promise<void> {
  const resourcePath = vscode.Uri.joinPath(
    context.extensionUri,
    "resources",
    "descriptions.csv"
  );
  const csvContent = await fs.promises.readFile(resourcePath.fsPath, "utf-8");
  const records = parse(csvContent, {
    columns: true, // Usa la primera fila como encabezados
    skip_empty_lines: true, // Ignorar líneas vacías
    trim: true, // Elimina espacios al inicio y al final
    relax_column_count: true, // Relaja el conteo de columnas por fila
  });
  descriptions = records as DescriptionData[];
  console.log("Descriptions loaded:", descriptions);
}
// #endregion Load descriptions from CSV file
// #region Define the structure of the PEST control file
const controlDataStructure: Variable[][] = [
  [
    {
      name: "RSTFLE",
      type: "string",
      required: true,
      allowedValues: ["restart", "norestart"],
    },
    {
      name: "PESTMODE",
      type: "string",
      required: true,
      allowedValues: [
        "estimation",
        "prediction",
        "regularization",
        "pareto",
        "regularisation",
      ],
    },
  ],
  [
    { name: "NPAR", type: "integer", required: true },
    { name: "NOBS", type: "integer", required: true },
    { name: "NPARGP", type: "integer", required: true },
    { name: "NPRIOR", type: "integer", required: true },
    { name: "NOBSGP", type: "integer", required: true },
    { name: "MAXCOMPDIM", type: "integer", required: false },
  ],
  [
    { name: "NTPLFLE", type: "integer", required: true },
    { name: "NINSFLE", type: "integer", required: true },
    {
      name: "PRECIS",
      type: "string",
      required: true,
      //allowedValues: ["single", "double"],
    },
    {
      name: "DPOINT",
      type: "string",
      required: true,
      //allowedValues: ["point", "nopoint"],
    },
    { name: "NUMCOM", type: "integer", required: false },
    { name: "JACFILE", type: "integer", required: false },
    { name: "MESSFILE", type: "integer", required: false },
  ],
  [
    { name: "RLAMBDA1", type: "float", required: true },
    { name: "RLAMFAC", type: "float", required: true },
    { name: "PHIRATSUF", type: "float", required: true },
    { name: "PHIREDLAM", type: "float", required: true },
    { name: "NUMLAM", type: "float", required: true },
    { name: "JACUPDATE", type: "integer", required: false },
    {
      name: "LAMFORGIVE",
      type: "string",
      required: false,
      //allowedValues: ["lamforgive", "nolamforgive"],
    },
    {
      name: "DERFORGIVE",
      type: "string",
      required: false,
      //allowedValues: ["derforgive", "noderforgive"],
    },
  ],
  [
    { name: "RELPARMAX", type: "float", required: true },
    { name: "FACPARMAX", type: "float", required: true },
    { name: "FACORIG", type: "float", required: true },
  ],
  [
    { name: "PHIREDSWH", type: "float", required: true },
    { name: "NOPTSWITCH", type: "integer", required: false },
    { name: "SPLITSWH", type: "float", required: false },
    {
      name: "DOAUI",
      type: "string",
      required: false,
      //allowedValues: ["aui", "noaui"],
    },
  ],
  [
    { name: "NOPTMAX", type: "integer", required: true },
    { name: "PHIREDSTP", type: "float", required: true },
    { name: "NPHISTP", type: "integer", required: true },
    { name: "NPHINORED", type: "integer", required: true },
    { name: "RELPARSTP", type: "float", required: true },
    { name: "NRELPAR", type: "integer", required: true },
  ],

  [
    { name: "ICOV", type: "integer", required: true },
    { name: "ICOR", type: "integer", required: true },
    { name: "IEIG", type: "integer", required: true },
    { name: "IRES", type: "integer", required: true },
    {
      name: "REISAVEITN",
      type: "string",
      required: false,
      allowedValues: ["reisaveitn", "noreisaveitn"],
    },
    {
      name: "JCOSAVE",
      type: "string",
      required: false,
      allowedValues: ["jcosave", "nojcosave"],
    },
    {
      name: "VERBOSEREC",
      type: "string",
      required: false,
      allowedValues: ["verboserec", "noverboserec"],
    },
    {
      name: "JCOSAVEITN",
      type: "string",
      required: false,
      allowedValues: ["jcosaveitn", "nojcosaveitn"],
    },

    {
      name: "PARSAVEITN",
      type: "string",
      required: false,
      allowedValues: ["parsaveitn", "noparsaveitn"],
    },
    {
      name: "PARSAVERUN",
      type: "string",
      required: false,
      allowedValues: ["parsaverun", "noparsaverun"],
    },
  ],
];

const svdDataStructure = [
  [{ name: "SVDMODE", type: "integer", required: true }],
  [
    {
      name: "MAXSING",
      type: "integer",
      required: true,
    },
    {
      name: "EIGTHRESH",
      type: "float",
      required: true,
    },
  ],
  [{ name: "EIGWRITE", type: "integer", required: true }],
];

const regularizationDataStructure = [
  [
    { name: "PHIMLIM", type: "float", required: true },
    { name: "PHIMACCEPT", type: "float", required: true },
    { name: "FRACPHIM", type: "float", required: false },
  ],
  [
    { name: "WFINIT", type: "float", required: true },
    { name: "WFMIN", type: "float", required: true },
    { name: "WFMAX", type: "float", required: true },
  ],
  [
    { name: "WFFAC", type: "float", required: true },
    { name: "WFTOL", type: "float", required: true },
    { name: "IREGADJ", type: "integer", required: false },
  ],
];

// #endregion Define the structure of the PEST control file
// #region Document Symbol Provider
class PestDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  public provideDocumentSymbols(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.SymbolInformation[]> {
    const symbols: vscode.SymbolInformation[] = [];
    const regex = /^\*\s*(.+)|^\+\+\s*/; // Detecta líneas que comienzan con '* ' o '++'
    const emojiMap: Record<string, string> = {
      "Control data": "🔧",
      "Singular value decomposition": "🧮",
      "Parameter groups": "📂🪨",
      "Parameter data": "🪨",
      "Observation groups": "📂🔍",
      "Observation data": "🔍",
      "Model command line": "💻",
      "Model input/output": "🧩",
      "Prior information": "🗂️",
      "Regularization": "⚖️",
      "Regularisation": "⚖️",
      "PEST++ section": "🌐",
    };

    // Agregar símbolo especial para abrir el manual
    symbols.push(
      new vscode.SymbolInformation(
        "📖 Open Manual",
        vscode.SymbolKind.Field,
        "",
        new vscode.Location(document.uri, new vscode.Range(0, 0, 0, 0))
      )
    );

    let inPestPlusSection = false; // Bandera para bloques Pest++
    let currentSymbol: vscode.SymbolInformation | null = null;

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i).text;
      const match = line.match(regex);

      // Si encontramos un encabezado estándar ('* ')
      if (match && match[1]) {
        // Cierra la sección anterior
        if (currentSymbol) {
          const end = new vscode.Position(
            i - 1,
            document.lineAt(i - 1).text.length
          );
          currentSymbol.location.range = new vscode.Range(
            currentSymbol.location.range.start,
            end
          );
        }

        inPestPlusSection = false; // Finaliza cualquier bloque Pest++
        const sectionName =
          match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();

        const icon = emojiMap[sectionName] || "";

        currentSymbol = new vscode.SymbolInformation(
          `${icon} ${sectionName}`,
          vscode.SymbolKind.Field,
          "",
          new vscode.Location(
            document.uri,
            new vscode.Range(i, 0, i, line.length)
          )
        );

        symbols.push(currentSymbol);
      }
      // Si encontramos el inicio de un bloque '++'
      else if (line.trim().startsWith("++")) {
        if (!inPestPlusSection) {
          if (currentSymbol) {
            const end = new vscode.Position(
              i - 1,
              document.lineAt(i - 1).text.length
            );
            currentSymbol.location.range = new vscode.Range(
              currentSymbol.location.range.start,
              end
            );
          }

          inPestPlusSection = true;

          currentSymbol = new vscode.SymbolInformation(
            "🌐 PEST++ section",
            vscode.SymbolKind.Field,
            "",
            new vscode.Location(
              document.uri,
              new vscode.Range(i, 0, i, line.length)
            )
          );

          symbols.push(currentSymbol);
        }
      }
    }

    // Cierra la última sección
    if (currentSymbol) {
      const end = new vscode.Position(
        document.lineCount - 1,
        document.lineAt(document.lineCount - 1).text.length
      );
      currentSymbol.location.range = new vscode.Range(
        currentSymbol.location.range.start,
        end
      );
    }

    return symbols;
  }
}

//#endregion Document Symbol Provider
// #region Validate type of the variable
function validateType(
  value: string,
  type: "string" | "integer" | "float"
): boolean {
  if (type === "integer") {
    return /^\d+$/.test(value);
  }
  if (type === "float") {
    return /^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(value); // Soporte para notación científica
  }
  return typeof value === "string";
}
// #endregion Validate type of the variable
//#region Extension activation
export async function activate(context: vscode.ExtensionContext) {
  await loadDescriptions(context);

  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      { scheme: "file", pattern: "**/*.{pst,pest}" }, // Cambia 'plaintext' al lenguaje que definiste para tus archivos .pst
      new PestDocumentSymbolProvider()
    )
  );

  // #region CodeLens provider for manual
  const manualCodeLensProvider = vscode.languages.registerCodeLensProvider(
    { scheme: "file", pattern: "**/*.{pst,pest}" },
    {
      provideCodeLenses() {
        const codeLenses: vscode.CodeLens[] = [];
        const topOfDocument = new vscode.Range(0, 0, 0, 0);
        const command: vscode.Command = {
          title: "📖 →  Open Manual",
          command: "extension.openManual",
        };
        codeLenses.push(new vscode.CodeLens(topOfDocument, command));
        return codeLenses;
      },
    }
  );

  const openManualCommand = vscode.commands.registerCommand(
    "extension.openManual",
    async () => {
      const manualPath = vscode.Uri.file(
        path.join(context.extensionPath, "resources", "pestpp_users_manual.md")
      );
      //await vscode.window.showTextDocument(document,vscode.ViewColumn.Beside);
      await vscode.commands.executeCommand(
        "markdown.showPreviewToSide",
        manualPath
      );
    }
  );

  context.subscriptions.push(openManualCommand);

  //#endregion CodeLens provider for manual

  // #region Folding provider for PEST control file
  const foldingProvider = vscode.languages.registerFoldingRangeProvider(
    { scheme: "file", pattern: "**/*.{pst,pest}" }, // Archivos con extensiones .pst y .pest
    {
      provideFoldingRanges(document, _context, token) {
        const ranges: vscode.FoldingRange[] = [];
        const lines = document.getText().split("\n");

        let start: number | null = null; // Marca el inicio de una sección

        for (let i = 0; i < lines.length; i++) {
          if (token.isCancellationRequested) {
            console.log("Folding operation cancelled.");
            return ranges; // Salir si el usuario cancela la operación
          }

          const line = lines[i].trim();

          // Detectar el inicio de una nueva sección
          if (line.startsWith("*")) {
            if (start !== null) {
              // Si ya hay una sección abierta, cerrarla antes de iniciar otra
              ranges.push(new vscode.FoldingRange(start, i - 1));
            }
            start = i; // Marca la línea actual como inicio de una nueva sección
          }
        }

        // Finalizar la última sección abierta
        if (start !== null && start < lines.length - 1) {
          ranges.push(new vscode.FoldingRange(start, lines.length - 1));
        }

        return ranges;
      },
    }
  );
  /* const decorationType = vscode.window.createTextEditorDecorationType({
          after: {
              margin: "0 0 0 2em", // Ajusta este valor para más separación
              contentText: " ", // hover over any variable in this section to view its details.",
              color: "#aaaaaa", // Gris claro para menor prominencia
          },
      }); */

  // #endregion Folding provider for PEST control file

  // #region Hover provider for control data and SVD sections
  const hoverProvider = vscode.languages.registerHoverProvider(
    { scheme: "file" },
    {
      provideHover(document, position) {
        const lines = document.getText().split("\n");

        // Detectar sección actual
        const sections: { parent: string; start: number; end: number }[] = [];
        lines.forEach((line, index) => {
          const trimmed = line.trim().toLowerCase();
          if (trimmed.startsWith("*")) {
            sections.push({
              parent: trimmed.substring(1).trim(),
              start: index,
              end:
                lines.findIndex(
                  (l, i) => i > index && l.trim().startsWith("*")
                ) || lines.length,
            });
          }
        });

        const currentSection = sections.find(
          (section) =>
            position.line > section.start && position.line < section.end
        );

        // Verificar si estamos en una sección reconocida
        if (
          !currentSection ||
          (currentSection.parent !== "control data" &&
            currentSection.parent !== "singular value decomposition")
        ) {
          return null; // No estamos en una sección reconocida
        }

        // Seleccionar la estructura adecuada según la sección
        const structure =
          currentSection.parent === "control data"
            ? controlDataStructure
            : svdDataStructure;

        // Obtener la estructura de la línea actual
        const relativeLine = position.line - currentSection.start - 1;
        const lineStructure = structure[relativeLine];
        // Crea un indice para la línea actual
        const indexline = relativeLine;
        // Imprime el indice de la línea actual
        console.log(`Índice de la línea actual: ${indexline + 2}`);

        if (!lineStructure) {
          return null; // Línea fuera de la definición
        }
        if (!structure) {
          return null; // Línea fuera de la definición
        }

        const line = document.lineAt(position.line).text.trim();
        const values = line.split(/\s+/); // Dividir en palabras

        console.log(`Línea: ${line}`); // Log de la línea actual
        console.log(`Valores detectados: ${values.join(", ")}`); // Valores detectados

        // Mapear variables de la línea
        const mappedVariables: {
          name: string;
          value: string | null;
          valid: boolean;
          id: number;
        }[] = [];
        let valueIndex = 0;

        // Crea una condición if si la línea actual es la 9
        if (indexline === 7) {
          // Separate numbers and words
          const numbers = values.filter((value) => !isNaN(Number(value)));
          const words = values.filter((value) => isNaN(Number(value)));

          // Map variables from the line
          const mappedVariables: {
            name: string;
            value: string | null;
            valid: boolean;
            id: number;
          }[] = [];
          let numberIndex = 0;

          lineStructure.forEach((variable) => {
            let value: string | null = null;

            // Assign required variables from numbers
            if (variable.required) {
              if (numberIndex < numbers.length) {
                value = numbers[numberIndex];
                numberIndex++;
                //      console.log(Assigned numeric value ${value} to ${variable.name});
              } else {
                value = "MISSING";
                //    console.log(Required variable ${variable.name} is missing.);
              }
            } else {
              // Assign optional variables from words
              const optionalValueIndex = words.findIndex(
                (word) => word.toLowerCase() === variable.name.toLowerCase()
              );
              if (optionalValueIndex !== -1) {
                value = words[optionalValueIndex];
                //  console.log(Assigned optional value ${value} to ${variable.name});
              }
            }

            // Add to mapped variables
            const repetitions = mappedVariables.filter(
              (v) => v.value === value
            ).length;
            mappedVariables.push({
              name: variable.name,
              value,
              valid: value !== "MISSING" && value !== null,
              id: repetitions + 1,
            });
          });

          //  console.log(Mapped variables: ${JSON.stringify(mappedVariables)});

          // Determine the word under the cursor
          const wordRange = document.getWordRangeAtPosition(position, /[^\s]+/); // Match anything that is not a space

          if (!wordRange) {
            console.log("No word detected under the cursor.");
            return null;
          }

          const word = document.getText(wordRange);
          //   console.log(Detected word: "${word}");

          const lineUpToCursor9 = document.getText(
            new vscode.Range(
              position.line,
              0,
              position.line,
              position.character
            )
          );
          const wordsBeforeCursor = lineUpToCursor9.trimStart().split(/\s+/);
          const wordOccurrences = wordsBeforeCursor.filter(
            (w) => w === word
          ).length;

          // console.log(The word "${word}" has appeared ${wordOccurrences} times before the cursor.);

          const variableInfo = mappedVariables.find(
            (v) => v.value === word && v.id === wordOccurrences + 1
          );

          function getHoverContent(
            variableName: string
          ): vscode.MarkdownString | null {
            const variable = descriptions.find(
              (v) => v.Variable === variableName
            );
            if (!variable) {
              return null;
            }

            return new vscode.MarkdownString(
              `### Variable: **${variable.Variable}**\n\n` +
                `- **Description:** *${variable.Description}*\n` +
                `- **Type:** \`${variable.Type}\`\n` +
                (variable.Values
                  ? `- **Allowed Values:** ${variable.Values.split(", ")
                      .map((val) => `\`${val}\``)
                      .join(", ")}\n`
                  : "") +
                `- **Required:** ${
                  variable.Mandatory === "required" ? "Yes" : "No"
                }`
            );
          }
          if (!variableInfo) {
            console.log("No variable info found for the detected word.");
            return null;
          }

          // console.log(Variable info: ${variableInfo.name});

          // Imprime variableInfo.name
          console.log(variableInfo.name);

          const hoverContent = getHoverContent(variableInfo.name);
          if (!hoverContent) {
            console.log("No hover content found for the variable.");
            return null;
          }
          // Mostrar hover con información
          return new vscode.Hover(hoverContent);
        }

        // Si el indice de la linea es distinto de 7
        if (indexline !== 7) {
          // Iterar sobre la estructura de la línea
          lineStructure.forEach((variable) => {
            // Inicializar la variable con un valor nulo
            let value: string | null = null;

            console.log("Procesando variable:", variable.name);
            console.log("Valores disponibles en la línea:", values);
            console.log("Posición actual (valueIndex):", valueIndex);

            // Obtener el valor actual en la posición del índice
            const currentValue = values[valueIndex] || null;

            // Si tiene allowedValues, buscar en toda la línea antes de asignar un valor numérico
            if (
              "allowedValues" in variable &&
              Array.isArray(variable.allowedValues)
            ) {
              // Buscar un valor permitido en la línea
              const optionalValueIndex = values.findIndex(
                (v) =>
                  Array.isArray(variable.allowedValues) &&
                  variable.allowedValues.includes(v)
              );
              // Si no se encuentra, usar el valor actual
              if (optionalValueIndex !== -1) {
                value = values[optionalValueIndex];
                console.log(
                  `Asignado valor opcional ${value} a ${variable.name}`
                );
              }
            }

            // Si no tiene allowedValues, asignar el valor actual si es válido
            if (
              !value &&
              currentValue &&
              validateType(
                currentValue,
                variable.type as "string" | "integer" | "float"
              )
            ) {
              value = currentValue;
              valueIndex++; // Avanzar el índice solo si se asigna un valor numérico
              console.log(
                `Asignado valor numérico ${value} a ${variable.name}`
              );
            }

            // Si no se encuentra un valor válido
            if (!value) {
              if (!value) {
                if (variable.required) {
                  value = "MISSING";
                  console.log(
                    `Variable requerida ${variable.name} está ausente.`
                  );
                  //vscode.window.showWarningMessage(`Variable "${variable.name}" está ausente o no tiene un valor asignado.`);
                } else {
                  console.log(
                    `Variable opcional ${variable.name} no encontrada, continuando...`
                  );
                }
              }
            }

            // Agregar a las variables mapeadas
            const repetitions = mappedVariables.filter(
              (v) => v.value === value
            ).length;
            mappedVariables.push({
              name: variable.name,
              value,
              valid: value !== "MISSING" && value !== null,
              id: repetitions + 1,
            });
          });

          // Obtener el rango de la palabra bajo el cursor
          const wordRange = document.getWordRangeAtPosition(position, /[^\s]+/); // Coincide con cualquier cosa que no sea espacio

          // Validar si se detectó un rango válido
          if (!wordRange) {
            console.log("No se detectó ninguna palabra bajo el cursor.");
            return null;
          }

          // Obtener la palabra desde el rango detectado
          const word = document.getText(wordRange);

          // Imprimir palabra detectada
          console.log(`Palabra detectada: "${word}"`);

          // Substring desde el inicio de la línea hasta el cursor
          const lineUpToCursor = document.getText(
            new vscode.Range(
              position.line,
              0,
              position.line,
              position.character
            )
          );

          // Eliminar espacios iniciales y dividir correctamente la línea
          const words = lineUpToCursor.trimStart().split(/\s+/);

          // Contar ocurrencias de la palabra detectada
          const wordOccurrences = words.filter((w) => w === word).length;

          // Imprimir información de depuración
          console.log(
            `La palabra "${word}" ha aparecido ${wordOccurrences} veces antes del cursor.`
          );
          console.log("Indice de la linea" + indexline);

          // Define variableInfo como la variable mapeada que coincide con la palabra y la ocurrencia
          const variableInfo = mappedVariables.find(
            (v) => v.value === word && v.id === wordOccurrences + 1
          );

          // Si no se encuentra la variable, devolver nulo
          if (!variableInfo) {
            return null;
          }
          // Si se encuentra la variable, devolver un MarkdownString
          // Función para obtener el contenido del hover
          function getHoverContent(
            variableName: string
          ): vscode.MarkdownString | null {
            const variable = descriptions.find(
              (v) => v.Variable === variableName
            );

            // Si no se encuentra la variable, devolver nulo
            if (!variable) {
              return null;
            }
            // Si se encuentra la variable, devolver un MarkdownString
            return new vscode.MarkdownString(
              `### Variable: **${variable.Variable}**\n\n` +
                `- **Description:** *${variable.Description}*\n` +
                `- **Type:** \`${variable.Type}\`\n` +
                (variable.Values
                  ? `- **Allowed Values:** ${variable.Values.split(", ")
                      .map((val) => `\`${val}\``)
                      .join(", ")}\n`
                  : "") +
                `- **Rquired:** ${
                  variable.Mandatory === "required" ? "Yes" : "No"
                }`
            );
          }

          // Imprimir el nombre de la variable detectada
          console.log(variableInfo.name);

          // Obtener el contenido del hover
          const hoverContent = getHoverContent(variableInfo.name);
          // Si no hay contenido de hover, devolver nulo
          if (!hoverContent) {
            return null;
          }

          // Mostrar hover con información
          return new vscode.Hover(hoverContent);
        }
        return null;
      },
    }
  );

  const hoverProviderRegularization = vscode.languages.registerHoverProvider(
    { scheme: "file" },
    {
      provideHover(document, position) {
        // Obtener todas las líneas del archivo
        const lines = document.getText().split("\n");

        // Detectar las secciones que comienzan con *
        const sections: { name: string; start: number; end: number }[] = [];
        lines.forEach((line, index) => {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith("*")) {
            const nextSectionIndex = lines.findIndex(
              (l, i) => i > index && l.trim().startsWith("*")
            );
            sections.push({
              name: trimmedLine.substring(1).trim().toLowerCase(),
              start: index,
              end: nextSectionIndex !== -1 ? nextSectionIndex : lines.length, // Final hasta la siguiente sección o el final del archivo
            });
          }
        });

        console.log("Secciones detectadas:", sections); // Depuración

        // Determinar la sección actual según la posición del cursor
        const currentSection = sections.find(
          (section) =>
            position.line > section.start && position.line < section.end
        );

        if (!currentSection) {
          console.log("No se encontró ninguna sección para esta línea."); // Depuración
          return null;
        }

        console.log("Sección actual:", currentSection.name); // Depuración

        // Verificar si la sección es * Regularization
        if (
          currentSection.name !== "regularization" &&
          currentSection.name !== "regularisation"
        ) {
          console.log("La sección actual no es Regularization."); // Depuración
          return null;
        }

        // Obtener la línea actual
        const line = document.lineAt(position.line).text.trim();
        const values = line.split(/\s+/); // Dividir la línea en valores

        console.log("Valores detectados en la línea:", values); // Depuración

        // Obtener la palabra bajo el cursor
        const wordRange = document.getWordRangeAtPosition(position, /[^\s]+/);
        if (!wordRange) {
          console.log("No hay palabra bajo el cursor."); // Depuración
          return null;
        }

        const word = document.getText(wordRange);
        console.log("Palabra detectada:", word); // Depuración

        // Mapear las variables de la línea con los valores
        const lineIndex = position.line - currentSection.start - 1; // Índice relativo de la línea
        const lineStructure = regularizationDataStructure[lineIndex];

        if (!lineStructure) {
          console.log("La línea actual no tiene una estructura definida."); // Depuración
          return null;
        }

        // Buscar la posición del valor bajo el cursor en la línea
        const valueIndex = values.findIndex((v) => v === word);
        if (valueIndex === -1) {
          console.log("El valor detectado no está en la línea actual."); // Depuración
          return null;
        }

        const variable = lineStructure[valueIndex];
        if (!variable) {
          console.log("No se encontró una variable para este valor."); // Depuración
          return null;
        }

        // Buscar descripción en la lista de descripciones
        const descriptionData = descriptions.find(
          (desc) => desc.Variable === variable.name
        );

        const description = descriptionData
          ? descriptionData.Description
          : "No description available";

        // Construir el contenido del hover
        const hoverContent = new vscode.MarkdownString(
          `### Variable: **${variable.name}**\n\n` +
            `- **Description:** ${description}\n` +
            `- **Type:** \`${variable.type}\`\n` +
            `- **Required:** ${variable.required ? "Yes" : "No"}`
        );

        return new vscode.Hover(hoverContent);
      },
    }
  );

  context.subscriptions.push(hoverProviderRegularization);
  // Escucha cambios en el editor activo
  vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor) {
      //  applyDecorations(editor);
    }
  });

  //#endregion Hover provider for control data and SVD sections

  // #region Parameter Groups CodeLens and Hover

  function parseParameterGroups(document: vscode.TextDocument) {
    const headers = [
      "PARGPNME",
      "INCTYP",
      "DERINC",
      "DERINCLB",
      "FORCEN",
      "DERINCMUL",
      "DERMTHD",
      "SPLITTHRESH",
      "SPLITRELDIFF",
      "SPLITACTION",
    ];

    const lines = document.getText().split("\n");
    const allRanges: { range: vscode.Range; header: string }[] = [];
    let inParameterGroups = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Detectar la sección "* parameter groups"
      if (trimmedLine.startsWith("* parameter groups")) {
        inParameterGroups = true;
        continue;
      }

      // Procesar todas las líneas de datos dentro de "* parameter groups"
      if (inParameterGroups) {
        if (trimmedLine.startsWith("*")) {
          inParameterGroups = false;
          continue;
        }

        // Encuentra las posiciones de todas las palabras en la línea
        const columnPositions = Array.from(line.matchAll(/\S+/g));
        const words = trimmedLine.split(/\s+/);

        words.forEach((word, index) => {
          // Mapea la palabra al índice correcto
          if (headers[index] && columnPositions[index]) {
            const startIndex = columnPositions[index].index!;
            const endIndex = startIndex + word.length;

            const wordRange = new vscode.Range(
              new vscode.Position(i, startIndex),
              new vscode.Position(i, endIndex)
            );

            allRanges.push({ range: wordRange, header: headers[index] });
          }
        });
      }
    }

    return allRanges; // Retornar todos los rangos y headers asociados
  }

  const parameterGroupsHoverProvider = vscode.languages.registerHoverProvider(
    { scheme: "file", pattern: "**/*.{pst,pest}" },
    {
      provideHover(document, position): vscode.ProviderResult<vscode.Hover> {
        const ranges = parseParameterGroups(document);

        for (const { range, header } of ranges) {
          if (range.contains(position)) {
            return new vscode.Hover(new vscode.MarkdownString(`${header}`));
          }
        }

        return null; // Asegura que se devuelve un valor en todos los caminos
      },
    }
  );

  // Nueva función para obtener solo los rangos de la primera línea
  function getFirstRowRangesGroups(document: vscode.TextDocument) {
    const allRanges = parseParameterGroups(document);
    const firstLineRanges = allRanges.filter(
      ({ range }) => range.start.line === allRanges[0]?.range.start.line
    );
    return firstLineRanges;
  }

  const parameterGroupsCodeLensProvider =
    vscode.languages.registerCodeLensProvider(
      { scheme: "file", pattern: "**/*.{pst,pest}" },
      {
        provideCodeLenses(document) {
          const codeLenses: vscode.CodeLens[] = [];
          const firstRowRanges = getFirstRowRangesGroups(document);

          if (firstRowRanges.length > 0) {
            firstRowRanges.forEach(({ range, header }) => {
              const description =
                descriptions.find((desc) => desc.Variable === header)
                  ?.Description || "No description available";
              codeLenses.push(
                new vscode.CodeLens(range, {
                  title: header,
                  command: "", // Si no necesitas que haga nada al clic, deja el comando vacío.
                  tooltip: `${header} : ${description}`, // Tooltip para cada header.
                })
              );
            });
          }

          return codeLenses;
        },
      }
    );

  // #endregion Parameter Groups CodeLens and Hover

  // #region Observation Groups CodeLens and Hover
  function parseObsGroups(document: vscode.TextDocument) {
    const headers = ["OBGNME", "GTARG", "COVFILE"];

    const lines = document.getText().split("\n");
    const allRanges: { range: vscode.Range; header: string }[] = [];
    let inObservationGroups = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Detectar la sección "* observation groups"
      if (trimmedLine.startsWith("* observation groups")) {
        inObservationGroups = true;
        continue;
      }

      // Procesar todas las líneas de datos dentro de "* observation groups"
      if (inObservationGroups) {
        if (trimmedLine.startsWith("*")) {
          inObservationGroups = false;
          continue;
        }

        // Encuentra las posiciones de todas las palabras en la línea
        const columnPositions = Array.from(line.matchAll(/\S+/g));
        const words = trimmedLine.split(/\s+/);

        words.forEach((word, index) => {
          // Mapea la palabra al índice correcto
          if (headers[index] && columnPositions[index]) {
            const startIndex = columnPositions[index].index!;
            const endIndex = startIndex + word.length;

            const wordRange = new vscode.Range(
              new vscode.Position(i, startIndex),
              new vscode.Position(i, endIndex)
            );

            allRanges.push({ range: wordRange, header: headers[index] });
          }
        });
      }
    }

    return allRanges; // Retornar todos los rangos y headers asociados
  }

  const obsGroupsHoverProvider = vscode.languages.registerHoverProvider(
    { scheme: "file", pattern: "**/*.{pst,pest}" },
    {
      provideHover(document, position): vscode.ProviderResult<vscode.Hover> {
        const ranges = parseObsGroups(document);

        for (const { range, header } of ranges) {
          if (range.contains(position)) {
            return new vscode.Hover(new vscode.MarkdownString(`${header}`));
          }
        }

        return null; // Asegura que se devuelve un valor en todos los caminos
      },
    }
  );

  // Nueva función para obtener solo los rangos de la primera línea
  function getFirstRowRangesObsGroups(document: vscode.TextDocument) {
    const allRanges = parseObsGroups(document);
    const firstLineRanges = allRanges.filter(
      ({ range }) => range.start.line === allRanges[0]?.range.start.line
    );
    return firstLineRanges;
  }

  const obsGroupsCodeLensProvider = vscode.languages.registerCodeLensProvider(
    { scheme: "file", pattern: "**/*.{pst,pest}" },
    {
      provideCodeLenses(document) {
        const codeLenses: vscode.CodeLens[] = [];
        const firstRowRanges = getFirstRowRangesObsGroups(document);

        if (firstRowRanges.length > 0) {
          firstRowRanges.forEach(({ range, header }) => {
            const description =
              descriptions.find((desc) => desc.Variable === header)
                ?.Description || "No description available";
            codeLenses.push(
              new vscode.CodeLens(range, {
                title: header,
                command: "", // Si no necesitas que haga nada al clic, deja el comando vacío.
                tooltip: `${header} : ${description}`, // Tooltip para cada header.
              })
            );
          });
        }

        return codeLenses;
      },
    }
  );

  // #endregion Parameter Groups CodeLens and Hover

  // #region Parameter Data CodeLens and Hover
  function parseParameterData(document: vscode.TextDocument) {
    const headers = [
      "PARNME",
      "PARTRANS",
      "PARCHGLIM",
      "PARVAL1",
      "PARLBND",
      "PARUBND",
      "PARGP",
      "SCALE",
      "OFFSET",
      "DERCOM",
      "PARTIED",
    ];

    const lines = document.getText().split("\n");
    const allRanges: { range: vscode.Range; header: string }[] = [];
    let inParameterData = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = lines[i].trim();

      // Detectar la sección "* parameter data"
      if (trimmedLine.startsWith("* parameter data")) {
        inParameterData = true;
        continue;
      }

      // Procesar todas las líneas de datos dentro de "* parameter data"
      if (inParameterData) {
        if (trimmedLine.startsWith("*")) {
          inParameterData = false;
          continue;
        }

        // Divide la línea por columnas basadas en espacios múltiples
        const columnPositions = Array.from(line.matchAll(/\S+/g)); // Encuentra posiciones de todas las palabras
        const words = trimmedLine.split(/\s+/); // Palabras visibles

        words.forEach((word, index) => {
          // Mapea la palabra al índice correcto
          if (headers[index] && columnPositions[index]) {
            const startIndex = columnPositions[index].index!;
            const endIndex = startIndex + word.length;

            const wordRange = new vscode.Range(
              new vscode.Position(i, startIndex),
              new vscode.Position(i, endIndex)
            );

            allRanges.push({ range: wordRange, header: headers[index] });
          }
        });
      }
    }

    return allRanges; // Retornar todos los rangos y headers asociados
  }

  const parameterDataHoverProvider = vscode.languages.registerHoverProvider(
    { scheme: "file", pattern: "**/*.{pst,pest}" },
    {
      provideHover(document, position): vscode.ProviderResult<vscode.Hover> {
        const ranges = parseParameterData(document);

        for (const { range, header } of ranges) {
          if (range.contains(position)) {
            return new vscode.Hover(new vscode.MarkdownString(`${header}`));
          }
        }

        return null; // Asegura que se devuelve un valor en todos los caminos
      },
    }
  );

  // Nueva función para obtener solo los rangos de la primera línea
  function getFirstRowRangesData(document: vscode.TextDocument) {
    const allRanges = parseParameterData(document);
    const firstLineRanges = allRanges.filter(
      ({ range }) => range.start.line === allRanges[0]?.range.start.line
    );
    return firstLineRanges;
  }

  const parameterDataCodeLensProvider =
    vscode.languages.registerCodeLensProvider(
      { scheme: "file", pattern: "**/*.{pst,pest}" },
      {
        provideCodeLenses(document) {
          const codeLenses: vscode.CodeLens[] = [];
          const firstRowRanges = getFirstRowRangesData(document);

          if (firstRowRanges.length > 0) {
            firstRowRanges.forEach(({ range, header }) => {
              const description =
                descriptions.find((desc) => desc.Variable === header)
                  ?.Description || "No description available";
              codeLenses.push(
                new vscode.CodeLens(range, {
                  title: header,
                  command: "", // Si no necesitas que haga nada al clic, deja el comando vacío.
                  tooltip: `${header} : ${description}`, // Tooltip para cada header.
                })
              );
            });
          }

          return codeLenses;
        },
      }
    );

  // #endregion Parameter Groups CodeLens and Hover

  // #region Observation Data CodeLens and Hover
  function parseObsData(document: vscode.TextDocument) {
    const headers = ["OBSNME", "OBSVAL", "WEIGHT", "OBGNME"];

    const lines = document.getText().split("\n");
    const allRanges: { range: vscode.Range; header: string }[] = [];
    let inObservationData = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Detectar la sección "* observation data"
      if (trimmedLine.startsWith("* observation data")) {
        inObservationData = true;
        continue;
      }

      // Procesar todas las líneas de datos dentro de "* observation data"
      if (inObservationData) {
        if (trimmedLine.startsWith("*")) {
          inObservationData = false;
          continue;
        }

        // Encuentra las posiciones de todas las palabras en la línea
        const columnPositions = Array.from(line.matchAll(/\S+/g)); // Encuentra palabras y sus posiciones
        const words = trimmedLine.split(/\s+/); // Palabras visibles

        words.forEach((word, index) => {
          // Mapea la palabra al índice correcto
          if (headers[index] && columnPositions[index]) {
            const startIndex = columnPositions[index].index!;
            const endIndex = startIndex + word.length;

            const wordRange = new vscode.Range(
              new vscode.Position(i, startIndex),
              new vscode.Position(i, endIndex)
            );

            allRanges.push({ range: wordRange, header: headers[index] });
          }
        });
      }
    }

    return allRanges; // Retornar todos los rangos y headers asociados
  }

  const obsDataHoverProvider = vscode.languages.registerHoverProvider(
    { scheme: "file", pattern: "**/*.{pst,pest}" },
    {
      provideHover(document, position): vscode.ProviderResult<vscode.Hover> {
        const ranges = parseObsData(document);

        for (const { range, header } of ranges) {
          if (range.contains(position)) {
            return new vscode.Hover(new vscode.MarkdownString(`${header}`));
          }
        }

        return null; // Asegura que se devuelve un valor en todos los caminos
      },
    }
  );

  // Nueva función para obtener solo los rangos de la primera línea
  function getFirstRowRangesObsData(document: vscode.TextDocument) {
    const allRanges = parseObsData(document);
    const firstLineRanges = allRanges.filter(
      ({ range }) => range.start.line === allRanges[0]?.range.start.line
    );
    return firstLineRanges;
  }

  const obsDataCodeLensProvider = vscode.languages.registerCodeLensProvider(
    { scheme: "file", pattern: "**/*.{pst,pest}" },
    {
      provideCodeLenses(document) {
        const codeLenses: vscode.CodeLens[] = [];
        const firstRowRanges = getFirstRowRangesObsData(document);

        if (firstRowRanges.length > 0) {
          firstRowRanges.forEach(({ range, header }) => {
            const description =
              descriptions.find((desc) => desc.Variable === header)
                ?.Description || "No description available";
            codeLenses.push(
              new vscode.CodeLens(range, {
                title: header,
                command: "", // Si no necesitas que haga nada al clic, deja el comando vacío.
                tooltip: `${header} : ${description}`, // Tooltip para cada header.
              })
            );
          });
        }

        return codeLenses;
      },
    }
  );

  // #endregion Parameter Groups CodeLens and Hover

  // #region Prior Information CodeLens and Hover
  function parsePriorInformation(document: vscode.TextDocument) {
    const headers = ["PILBL", "PIFAC", "PARNME", "PIVAL", "WEIGHT", "OBGNME"];
  
    const lines = document.getText().split("\n");
    const allRanges: { range: vscode.Range; header: string }[] = [];
    let inPriorInformation = false;
  
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
  
      // Detectar la sección "* prior information"
      if (trimmedLine.startsWith("* prior information")) {
        inPriorInformation = true;
        continue;
      }
  
      // Procesar todas las líneas de datos dentro de "* prior information"
      if (inPriorInformation) {
        if (trimmedLine.startsWith("*")) {
          inPriorInformation = false;
          continue;
        }
  
        // Encuentra las posiciones de palabras relevantes en la línea
        const columnMatches = Array.from(
          line.matchAll(/[a-zA-Z0-9_.]+/g) // Capturar solo palabras relevantes
        );
  
        columnMatches.forEach((match, index) => {
          const word = match[0];
          const startIndex = match.index!;
          const endIndex = startIndex + word.length;
  
          // Asociar con un header solo si el índice es válido
          if (headers[index]) {
            const wordRange = new vscode.Range(
              new vscode.Position(i, startIndex),
              new vscode.Position(i, endIndex)
            );
  
            allRanges.push({ range: wordRange, header: headers[index] });
          }
        });
      }
    }
  
    return allRanges; // Retornar todos los rangos y headers asociados
  }
  
  const PriorInformationHoverProvider = vscode.languages.registerHoverProvider(
    { scheme: "file", pattern: "**/*.{pst,pest}" },
    {
      provideHover(document, position): vscode.ProviderResult<vscode.Hover> {
        const ranges = parsePriorInformation(document);
  
        for (const { range, header } of ranges) {
          if (range.contains(position)) {
            return new vscode.Hover(new vscode.MarkdownString(`${header}`));
          }
        }
  
        return null; // Asegura que se devuelve un valor en todos los caminos
      },
    }
  );
  
  

  // Nueva función para obtener solo los rangos de la primera línea
  function getFirstRowRangesPriorInformation(document: vscode.TextDocument) {
    const allRanges = parsePriorInformation(document);
    const firstLineRanges = allRanges.filter(
      ({ range }) => range.start.line === allRanges[0]?.range.start.line
    );
    return firstLineRanges;
  }

  const PriorInformationCodeLensProvider =
    vscode.languages.registerCodeLensProvider(
      { scheme: "file", pattern: "**/*.{pst,pest}" },
      {
        provideCodeLenses(document) {
          const codeLenses: vscode.CodeLens[] = [];
          const firstRowRanges = getFirstRowRangesPriorInformation(document);

          if (firstRowRanges.length > 0) {
            firstRowRanges.forEach(({ range, header }) => {
              const description =
                descriptions.find((desc) => desc.Variable === header)
                  ?.Description || "No description available";
              codeLenses.push(
                new vscode.CodeLens(range, {
                  title: header,
                  command: "", // Si no necesitas que haga nada al clic, deja el comando vacío.
                  tooltip: `${header} : ${description}`, // Tooltip para cada header.
                })
              );
            });
          }

          return codeLenses;
        },
      }
    );

  // #endregion Parameter Groups CodeLens and Hover

  // #region CodeLens provider for command line and input/output sections

  const codeLensProvider = vscode.languages.registerCodeLensProvider(
    { scheme: "file", pattern: "**/*.{pst,pest}" },
    {
      provideCodeLenses(document) {
        const codeLenses: vscode.CodeLens[] = [];
        const lines = document.getText().split("\n");
        let inRelevantSection = false;

        lines.forEach((line, i) => {
          const trimmedLine = line.trim();

          // Detectar inicio de las secciones relevantes
          if (
            trimmedLine.startsWith("* model input/output") ||
            trimmedLine.startsWith("* model command line")
          ) {
            inRelevantSection = true;
            return;
          }

          // Salir de la sección relevante
          if (inRelevantSection && trimmedLine.startsWith("*")) {
            inRelevantSection = false;
            return;
          }

          // Procesar líneas dentro de secciones relevantes
          if (inRelevantSection) {
            if (trimmedLine.startsWith("++")) {
              // if line starts with ++ do not add code lens
              // Do nothing
            } else {
              const matches = trimmedLine.match(/[^ ]+/g);
              if (matches) {
                matches.forEach((filePath) => {
                  const range = new vscode.Range(i, 0, i, trimmedLine.length);

                  codeLenses.push(
                    new vscode.CodeLens(range, {
                      title: `📂 Open ${filePath}`,
                      command: "extension.openFileFromDecoration",
                      arguments: [filePath], // Argumentos que pasamos al comando
                    })
                  );
                });
              }
            }
          }
        });

        return codeLenses;
      },
    }
  );

  const handleClick = vscode.commands.registerCommand(
    "extension.openFileFromDecoration",
    async (filePath: string) => {
      const activeEditor = vscode.window.activeTextEditor;

      // Asegúrate de que hay un archivo activo
      if (!activeEditor) {
        vscode.window.showWarningMessage("No active editor.");
        return;
      }

      // Obtén el directorio del archivo activo
      const currentDir = path.dirname(activeEditor.document.uri.fsPath);

      // Calcula la ruta completa
      const resolvedPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(currentDir, filePath);

      try {
        const doc = await vscode.workspace.openTextDocument(resolvedPath);
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
      } catch {
        vscode.window.showWarningMessage(`File not found: ${resolvedPath}`);
      }
    }
  );

  // #endregion CodeLens provider for command line and input/output sections

  // #region Hover provider for pest++ section

  const hoverProviderPlus = vscode.languages.registerHoverProvider(
    { scheme: "file" },
    {
      provideHover(document, position) {
        const line = document.lineAt(position.line).text;
        const match = line.match(/\+\+(\w+)(?:\([^)]*\))?/);
        const word = match ? match[1] : undefined;

        console.log(`Variable: ${word}`);

        const description = descriptions.find((desc) => desc.Variable === word);
        if (!description) {
          return null;
        }
        return new vscode.Hover(
          new vscode.MarkdownString(
            `### Variable: **${description.Variable}**\n\n` +
              `- **Description:** *${description.Description}*\n` +
              `- **Type:** \`${description.Type}\`\n` +
              (description.Values
                ? `- **Allowed Values:** ${description.Values.split(", ")
                    .map((val) => `\`${val}\``)
                    .join(", ")}\n`
                : "")
          )
        );
      },
    }
  );
  context.subscriptions.push(hoverProviderPlus);
  // Escucha cambios en el editor activo
  vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor) {
      //  applyDecorations(editor);
    }
  });

  // #endregion Hover provider for pest++ section

  // Listeners for changes in the active editor
  vscode.workspace.onDidChangeTextDocument((event) => {
    const editor = vscode.window.activeTextEditor;
    if (editor && event.document === editor.document) {
      //applyDecorations(editor);
    }
  });

  const disposable = vscode.commands.registerCommand(
    "pestd3code.activate",
    () => {
      vscode.window.showInformationMessage("PestD3code activated!");
    }
  );
  context.subscriptions.push(manualCodeLensProvider);
  context.subscriptions.push(disposable);
  context.subscriptions.push(hoverProvider);
  disposables.push(foldingProvider);
  context.subscriptions.push(handleClick);
  context.subscriptions.push(codeLensProvider);
  context.subscriptions.push(parameterGroupsCodeLensProvider);
  context.subscriptions.push(parameterDataCodeLensProvider);
  context.subscriptions.push(parameterGroupsHoverProvider);
  context.subscriptions.push(parameterDataHoverProvider);
  context.subscriptions.push(obsGroupsCodeLensProvider);
  context.subscriptions.push(obsGroupsHoverProvider);
  context.subscriptions.push(obsDataCodeLensProvider);
  context.subscriptions.push(obsDataHoverProvider);
  context.subscriptions.push(PriorInformationCodeLensProvider);
  context.subscriptions.push(PriorInformationHoverProvider);
}
//#endregion Extension activation

// This method is called when your extension is deactivated
export function deactivate() {}
