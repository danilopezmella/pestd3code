# PestD3code

![Build Status](https://github.com/danilopezmella/pestd3code/actions/workflows/ci.yml/badge.svg)
![Version](https://img.shields.io/badge/version-0.1.6-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)

# Welcome to **PestD3code**

**PestD3code** is a VS Code extension designed to enhance the readability and usability of PEST control files for MODFLOW. This extension provides structured decorators, diagnostics, and hover support to make the interpretation and editing of `.pst` files easier and more intuitive.

---

### 🚨 **IMPORTANT NOTE** 🚨

The **most important feature** of this extension is that it works **WITHOUT** modifying your `.pst` file. It functions as a seamless decorator, ensuring that your original file remains untouched. You can confidently explore and interact with your `.pst` file, knowing it stays completely safe.

---

## Features Demonstration

<div align="center">

### 🎥 Video Tutorial

[![PestD3code Feature Demo](https://vumbnail.com/1045433698.jpg)](https://vimeo.com/1045433698)

> ▶️ Click the image above to watch the full demonstration video
</div>

## Features

### 🔍 Smart Navigation & Interface
- **Outline Panel:** Navigate through sections with custom icons for quick access
- **Collapsible Sections:** Collapse/expand sections for better organization
- **Color Coding:** Specific colors for sections, floats, strings, and integers
- **Modern UI:** Clean and intuitive interface design

### 💡 Intelligent Assistance
- **Enhanced Hover Tooltips:** 
  - Real-time type validation (integer, float, string)
  - Minimum/Maximum value constraints
  - Required field indicators
  - Detailed variable descriptions
  - PestCheck validation recommendations
- **Context Help:** Access variable descriptions and requirements instantly
- **Value Validation:** View allowed values and data types with immediate feedback
- **Smart Suggestions:** Get helpful hints while editing
- **Inline Error Detection:** Highlights invalid values directly in the editor

### 🛠️ PestCheck Integration
- **OS-Agnostic Support:** Auto-locate Pestcheck across different operating systems
- **One-Click Diagnostics:** Run checks directly from VS Code
- **Visual Feedback:** View diagnostics in Problems panel and dedicated webview
- **Smart Warnings:** Intelligent handling of suppressible warnings with `/s` flag
- **Real-time Notifications:** Instant feedback on errors and warnings

### 📂 File Management & Documentation
- **Smart Links:** Clickable file paths in Model Input/Output sections
- **Path Validation:** Automatic verification of file existence
- **Multi-word Support:** Enhanced handling of commands with spaces
- **Quick Manual:** Instant access to PEST manual from the editor
- **Section Guides:** Detailed descriptions for all PEST components
- **PEST++ Support:** Complete tooltips for all PEST++ attributes

### 🔧 Development Features
- **Enhanced Debugging:** Detailed error messages and logging
- **Output Panel:** Dedicated diagnostic information
- **Cross-Platform:** Optimized for all operating systems
- **TypeScript Stack:** Built with modern VS Code APIs
- **Regular Updates:** Continuous improvements and bug fixes

## Requirements

- **Visual Studio Code:** Version 1.95.0 or later.
- **Pestcheck:** Ensure you have Pestcheck installed to use the new diagnostics features.

## Installation

1. Install the extension from the Visual Studio Code Marketplace or download the .vsix file.
2. Open a workspace containing .pst files.
3. Use folding to collapse or expand individual sections of the file for easier navigation and organization.
4. Hover over any PEST **Control data**, **Singular value decomposition**, **Parameter Groups**, **Parameter Data**, **Observation Groups**, **Observation Data** and **PEST++** sections to see detailed information.
5. Click on file paths in the **Model Input/Output** and **Model Command Line** sections to open them in your default editor. If the file does not exist, you will be notified.
6. Access the PEST manual quickly by clicking the link included in the first line of the file. The manual opens in a parallel window.

## Extension Settings

This extension does not yet provide configurable settings. Future releases may include user-defined validation rules or additional customization options.

## Known Issues

- Some variables with highly customized formats may not display correct hover information.
- Workspace activation might fail if `.pst` files are deeply nested.
- Inconsistencies remain in handling the **Control Data** section (in progress).

## Following Extension Guidelines

This extension adheres to the best practices outlined in the Visual Studio Code Extension Guidelines.

- [Extension Guidelines](https://code.visualstudio.com/api/ux-guidelines/overview)

## Project Status

**PestD3code is currently in active development.** Features and functionalities are being continuously added and refined. If you encounter any issues or have suggestions, feel free to reach out.

## Contact

For inquiries, feedback, or support, please message me on LinkedIn: [www.linkedin.com/in/dlz800](https://www.linkedin.com/in/dlz800)

**Thank you for using PestD3code!**
