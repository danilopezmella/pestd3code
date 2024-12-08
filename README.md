# Pest4All

Welcome to **Pest4All**, a VS Code extension designed to enhance the readability and usability of PEST control files for MODFLOW. This extension helps users by adding structured decorators and hover support for better interpretation and editing of .pst and .pest files.

## Features

- **Hover Tooltips:**
  - Provides detailed descriptions of PEST control variables with Markdown-formatted tooltips.
  - Includes variable descriptions, types, allowed values, and whether the variable is mandatory.
  
- **Support for .pst and .pest Files:**
  - Automatically activates when .pst or .pest files are detected in the workspace.
  - Associates these file types with PEST control variables for enhanced development workflows.

- **Collapsible Sections:**
  - Users can now collapse or expand sections of the PEST control file for easier navigation and organization.

- **Quick Access to PEST Manual:**
  - A quick link to the PEST manual is now included in the first line of the file, opening the manual in a parallel window for easy reference.

- **Clickable File Paths:**
  - File paths in the **Model Input/Output** and **Model Command Line** sections are now clickable.
  - Clicking a file path opens the file in the system's default editor (if the file exists).
  - If the file does not exist, the extension notifies the user to help identify missing or incorrect paths.

- **Parameter Group Descriptions:**
  - Provides hover descriptions for the **Parameter Groups** section, explaining group-specific settings and options.

- **Future Plans:** *(Not Yet Implemented)*
  - **Hover other sections:** Hover over the rest of the PCF.

## Requirements

- **Visual Studio Code:** Version 1.95.0 or later.

## Installation

1. Install the extension from the Visual Studio Code Marketplace or download the .vsix file.  
2. Open a workspace containing .pst or .pest files.  
3. Use folding to collapse or expand individual sections of the file for easier navigation and organization.  
4. Hover over any PEST **Control data**, **Singular value decomposition**, and **Parameter Groups** sections to see detailed information.  
5. Click on file paths in the **Model Input/Output** and **Model Command Line** sections to open them in your default editor. If the file does not exist, you will be notified.  
6. Access the PEST manual quickly by clicking the link included in the first line of the file. The manual opens in a parallel window.

## Extension Settings

This extension does not yet provide configurable settings. Future releases may include user-defined validation rules or additional customization options.

## Known Issues

- Some variables with highly customized formats may not display correct hover information.
- Workspace activation might fail if .pst or .pest files are deeply nested.
- Inconsistencies remain in handling the **Control Data** section, particularly with optional values (in progress).

## Release Notes

### 0.0.2

- Added collapsible sections for better navigation.
- Included a quick access link to the PEST manual in the first line of the file.
- Added hover descriptions for the **Parameter Groups** section.
- Highlighted ongoing work on handling optional values in the **Control Data** section.

### 0.0.1

- Initial release of Pest4All.

## Following Extension Guidelines

This extension adheres to the best practices outlined in the Visual Studio Code Extension Guidelines.

- [Extension Guidelines](https://code.visualstudio.com/api/ux-guidelines/overview)

## Project Status

**Pest4All is currently in active development.** Features and functionalities are being continuously added and refined. If you encounter any issues or have suggestions, feel free to reach out.

## Contact

For inquiries, feedback, or support, please contact me at **[gwm@gwmodels.cl](mailto:gwm@gwmodels.cl)**.

**Thank you for using Pest4All!**
