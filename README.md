# PestD3code

![Build Status](https://github.com/danilopezmella/pestd3code/actions/workflows/ci.yml/badge.svg)
![Version](https://img.shields.io/badge/version-0.0.5-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)

# Welcome to **PestD3code**

**PestD3code** is a VS Code extension designed to enhance the readability and usability of PEST control files for MODFLOW. This extension provides structured decorators and hover support to make the interpretation and editing of `.pst` and `.pest` files easier and more intuitive.

---

### 🚨 **IMPORTANT NOTE** 🚨

The **most important feature** of this extension is that it works **WITHOUT** modifying your `.pst` file. It functions as a seamless decorator, ensuring that your original file remains untouched. You can confidently explore and interact with your `.pst` file, knowing it stays completely safe.

---

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


## Features Demonstration

### 1. Folding sections, color coding, and hover tooltips for Control Data, SVD, etc.
![Folding sections and hovers](media/video_1.gif)

### 2. Clickable links to files in model command lines and input/output sections
![Quick access to files in model command line and model input output](media/video_2.gif)

### 3. Embedded PEST++ manual for instant access and interactive table of contents
![Manual and PEST++ variable and table of contents](media/video_3.gif)

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
- Inconsistencies remain in handling the **Control Data** section (in progress).

## Following Extension Guidelines

This extension adheres to the best practices outlined in the Visual Studio Code Extension Guidelines.

- [Extension Guidelines](https://code.visualstudio.com/api/ux-guidelines/overview)

## Project Status

**PestD3code is currently in active development.** Features and functionalities are being continuously added and refined. If you encounter any issues or have suggestions, feel free to reach out.

## Contact

For inquiries, feedback, or support, please contact me at **[gwm@gwmodels.cl](mailto:gwm@gwmodels.cl)**.

**Thank you for using PestD3code!**