# Parsing Configuration and Rules

## Default Parsing Configuration
- **Variable**: `default value`
- **Severity**: `Warning`
- **Line**: `0`
- **File**: `filepath of the pst in the active editor`
- **Description**: `No description`
- **Keyword**: `pcf`

## Parsing Rules

### Basic Error
- **Description**: The most basic error to parse.
- **Conditions**:
  - The line starts with `Line <number> of file`.
- **Output**:
  - **Severity**: `Error`
  - **Line**: `<number>`
  - **File**: `<file>`
  - **Description**: The rest of the line after `:`.
  - **Keyword**: `None`

### Multiline Error
- **Description**: Specific error spanning multiple lines with keywords.
- **Conditions**:
  - `Errors ----->` followed by lines with `Cannot open covariance matrix file`.
- **Output**:
  - **Severity**: `Error`
  - **Line**: `findline(<keyword>)`  
    *findline(): Must be a function to search for the keyword in the active file.*
  - **File**: `pst of the active editor`
  - **Description**: The full line after `:`.
  - **Keyword**: The last quoted word in the line.

### Dual File Error
- **Description**: Error involving two files, including a `.pst` file.
- **Conditions**:
  - `Line <number> of instruction file <file>: observation '<observation>' not cited in file <file>`.
- **Output**:
  - **Severity**: `Error`
  - **Line**: `<number>`
  - **File**: `<instruction file>`
  - **Description**: Observation `<observation>` not cited in file `<file>`.
  - **Keyword**: `None`

---

# Examples

### Example 1
**Input:**
```plaintext
Line 1499 of file copy_freyberg_missing_instruction_invalid_model_command.pst: cannot open 
instruction file misc\freyberg_heads.smp.missing.
```
**Output:**
```plaintext
Severity: Error
Line: 1499
File: copy_freyberg_missing_instruction_invalid_model_command.pst
Description: cannot open instruction file misc\freyberg_heads.smp.missing.
Keyword: None
```

### Example 2
**Input:**
```plaintext
Errors ----->
Cannot open covariance matrix file ..\runmodel\preproc\cov1.mat for observation group "regul_kx1".
```
**Output:**
```plaintext
Severity: Error
Line: findline(regul_kx1)
File: pst of the active editor
Description: Cannot open covariance matrix file ..\runmodel\preproc\cov1.mat for observation group "regul_kx1".
Keyword: regul_kx1
```

### Example 3
**Input:**
```plaintext
Line 383 of instruction file misc\freyberg_heads.smp.ins: observation "or09c17_1" not cited in file copy_freyberg.pst.
```
**Output:**
```plaintext
Severity: Error
Line: 383
File: misc\freyberg_heads.smp.ins
Description: observation "or09c17_1" not cited in file copy_freyberg.pst.
Keyword: None
```

---

# Additional Notes
- All keywords are extracted from the last quoted words if applicable.
- If there is no explicit line number, the `findline()` function must be used to locate the corresponding keyword.
- The `findline()` logic should search for occurrences in the active file and return the nearest line number.
