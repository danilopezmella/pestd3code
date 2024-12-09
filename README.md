# PestD3code

![Build Status](https://github.com/danilopezmella/pestd3code/actions/workflows/ci.yml/badge.svg)
![Version](https://img.shields.io/badge/version-0.0.3-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)

Welcome to **PestD3code**, a VS Code extension designed to enhance the readability and usability of PEST control files for MODFLOW. This extension helps users by adding structured decorators and hover support for better interpretation and editing of .pst and .pest files.

## Features

### 🎨 Visual Enhancements

- **Hover Tooltips:**
  - Provides detailed descriptions of PEST control variables with Markdown-formatted tooltips.
  - Includes variable descriptions, types, allowed values, and whether the variable is mandatory.
  - Specific colors for sections, floats, strings, and integers for easy visualization.

- **Collapsible Sections:**
  - Users can now collapse or expand sections of the PEST control file for easier navigation and organization.

- **Outline Panel Integration:**
  - Navigate through the file effortlessly using the Outline panel with icons for each section.

### 📂 File Interaction

- **Clickable File Paths:**
  - File paths in the **Model Input/Output** and **Model Command Line** sections are now clickable.
  - Clicking a file path opens the file in the system's default editor (if the file exists).
  - If the file does not exist, the extension notifies the user to help identify missing or incorrect paths.

### 📖 Quick Access to PEST Manual

- A quick link to the PEST manual is now included in the first line of the file, opening the manual in a parallel window for easy reference.

### 📝 Section Descriptions

- **Parameter Group Descriptions:**
  - Provides hover descriptions for the **Parameter Groups** section, explaining group-specific settings and options.

- **Parameter Data, Observation Group, and Observation Data Values:**
  - Brief explanations of values in each section.
  - Hover over each section of these parameters for the code value.

### 🧩 Pest++ Instructions

- **Hover Tooltips for Pest++ Attributes:**
  - Hover over Pest++ attributes to see code for each variable and description.

## Requirements

- **Visual Studio Code:** Version 1.95.0 or later.

## Installation

1. Install the extension from the Visual Studio Code Marketplace or download the .vsix file.
2. Open a workspace containing .pst or .pest files.
3. Use folding to collapse or expand individual sections of the file for easier navigation and organization.
4. Hover over any PEST **Control data**, **Singular value decomposition**, **Parameter Groups**, **Parameter Data**, **Observation Groups**, **Observation Data** and **PEST++** sections to see detailed information.
5. Click on file paths in the **Model Input/Output** and **Model Command Line** sections to open them in your default editor. If the file does not exist, you will be notified.
6. Access the PEST manual quickly by clicking the link included in the first line of the file. The manual opens in a parallel window.

## Extension Settings

This extension does not yet provide configurable settings. Future releases may include user-defined validation rules or additional customization options.

## Known Issues

- Some variables with highly customized formats may not display correct hover information.
- Workspace activation might fail if .pst or .pest files are deeply nested.
- Inconsistencies remain in handling the **Control Data** section, particularly with optional values (in progress).

## Release Notes

### 0.0.4

- Added support for **Prior Information** section with appropriate emoji.
- Added support for **Regularization** section with descriptions for each value.
- Improved handling of optional values in the **Control Data** section.
- Added **Open Manual** to the Outline.

### 0.0.3

- Added hover support for **Control data**, **Singular value decomposition**, **Parameter Data**, **Observation Groups**, and **Observation Data** sections.
- Enhanced Outline panel with icons for each section for easier navigation.
- Improved color coding for sections, floats, strings, and integers for better visualization.
- Implemented clickable file paths in the **Model Input/Output** and **Model Command Line** sections.
- Added Pest++ instructions with hover tooltips for Pest++ attributes.
- Fixed issues with workspace activation for deeply nested .pst or .pest files.
- Improved handling of optional values in the **Control Data** section.

### 0.0.2

- Added collapsible sections for better navigation.
- Included a quick access link to the PEST manual in the first line of the file.
- Added hover descriptions for the **Parameter Groups** section.
- Highlighted ongoing work on handling optional values in the **Control Data** section.

### 0.0.1

- Initial release of PestD3code.

## Following Extension Guidelines

This extension adheres to the best practices outlined in the Visual Studio Code Extension Guidelines.

- [Extension Guidelines](https://code.visualstudio.com/api/ux-guidelines/overview)

## Project Status

**PestD3code is currently in active development.** Features and functionalities are being continuously added and refined. If you encounter any issues or have suggestions, feel free to reach out.

## Contact

For inquiries, feedback, or support, please contact me at **[gwm@gwmodels.cl](mailto:gwm@gwmodels.cl)**.

**Thank you for using PestD3code!**