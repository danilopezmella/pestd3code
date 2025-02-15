# Change Log

### 0.1.6
- **Fixed Hover for Regularization description**:
  - Fixed the hover functionality for Regularization description to ensure consistent behavior and included detailed descriptions for each variable in the regularization section.

### 0.1.5
- **Fixed Hover for Regularization and Regularisation**:
  - Corrected the hover functionality for both spellings of Regularization to ensure consistent behavior.

### 0.1.4
- **First Time Auto Set PestCheck**:
  - Added a feature to offer auto-setting the PestCheck path the first time the extension is installed. This helps users quickly configure the necessary path without manual intervention.
  - Improved user experience by providing clear and detailed messages during the initial setup process.

- **Update Notification**:
  - Added a notification message to inform users when the extension has been updated. This ensures users are aware of the latest features and improvements.
  - Recommended users to use the auto-update feature to always have the latest version of the extension.

- **Improved Executable Messages on macOS**:
  - Enhanced the messages related to executable files on macOS (darwin). The messages now provide clearer instructions and guidance for setting execution permissions.
  - Included detailed console logs to track the process of granting execution permissions and handling potential issues.

### Known Issues
- **PestCheck Parsing Differences**:
  - There are known issues where PestCheck might parse files differently compared to PestD3code. This is an ongoing area of work, and improvements are being made to align the parsing logic between PestCheck and PestD3code.
  - **Users may experience discrepancies in parsing results, so please report any inconsistencies to help me improve the extension.** For inquiries, feedback, or support, please message me on LinkedIn: [www.linkedin.com/in/dlz800](https://www.linkedin.com/in/dlz800).

### 0.1.3

- **Allowed Values from Descriptions**:
  - Allowed values for parameters are now also extracted from their descriptions for better accuracy. The more the better. 

### 0.1.2

- **New Feature: Robust Parser for PEST Files**:
  - Developed a robust parser to handle `.pst` files, efficiently processing control data, SVD, and regularization sections.
  - Enhanced user experience by providing detailed logs and error handling during the parsing process.
  - Included console logs to track parsing progress and identify potential issues.

- **Improved Section Detection**:
  - Enhanced logic to detect and process different sections within `.pst` files.
  - Added support for handling control data, SVD, and regularization sections separately.
  - Included detailed console logs to provide insights into the section detection process.

- **Bug Fixes and Performance Improvements**:
  - Fixed issues related to section parsing and index generation.
  - Optimized the extension's performance for faster execution and smoother user experience.

### 0.1.1
- Contact information updated in README.md
### 0.1.0
- **Enhanced Skip Warnings Configuration**:
  - Added a new feature to handle skip warnings configuration more effectively. Users can now choose to skip warnings, show all warnings, or never show the skip warnings message again.
  - Improved user interaction with detailed messages and options for better control over the warning settings.
- **Improved Diagnostic Collection**:
  - Enhanced the diagnostic collection process to provide more accurate and detailed error messages.
  - Added a dedicated output channel for PestCheck results and raw output to help users debug and understand the diagnostics better.
- **Temporary File Handling**:
  - Implemented a mechanism to create and manage temporary files for PestCheck runs, ensuring the original `.pst` files remain unmodified.
  - Added console logs to track the creation and processing of temporary files for better transparency.
- **User Interaction Enhancements**:
  - Improved user prompts and messages for better clarity and guidance during PestCheck configuration and execution.
  - Added detailed console logs to provide insights into the decision-making process and actions taken by the extension.
- **Bug Fixes and Performance Improvements**:
  - Fixed various bugs related to file handling, configuration updates, and diagnostic collection.
  - Optimized the extension's performance for faster execution and smoother user experience.
- **Documentation Updates**:
  - Updated the README and CHANGELOG files to reflect the latest changes and improvements in the extension.
  - Added detailed descriptions and examples to help users understand and utilize the new features effectively.
- **Important Note**:
  - The Pestcheck tool is not bundled with this extension. Pestd3code requires you to have your own installation of Pestcheck
- **Run Pestcheck and Clear Diagnostic Buttons**:
  - Added new buttons in the top right of the file editor to run Pestcheck and clear diagnostics using native VS Code options
- **Pestcheck Run with /s Option Configuration**:
  - Added a configuration option to enable/disable the `/s` flag for Pestcheck runs
  - When enabled, `/s` skips warnings and template/instruction/coverage matrix file checking
  - Default setting is disabled (full checking enabled)
  - Diagnostic messages from referenced files are now properly tracked and displayed in VS Code's Problems panel for those files
- **Pestcheck Diagnostics Integration**:
  - Results from your Pestcheck installation are now shown as diagnostics that can be tracked in the native VS Code Problems panel
- **Separation of Pestcheck Parsing**:
  - Created a dedicated function to handle the parsing of your Pestcheck output, isolating it from the rest of the code for better modularity
- **Autoset/Find Your Pestcheck executable**:
  - The autoset feature helps locate your installed Pestcheck executable across different operating systems
- **Pestcheck Webview for Raw Output**:
  - Introduced a new webview to display raw output from your Pestcheck runs for better visualization
- **Output Panel**:
  - Added an output panel to debug and display detailed logs, errors, and diagnostic information before sending them to the Problems panel
- **Enhanced Error Handling**:
  - Improved error handling mechanisms to provide more detailed and user-friendly error messages
- **Performance Improvements**:
  - Optimized the extension's performance for faster load times and smoother operation
- **Removed Support for `.pest` Files**:
  - Due to the new implementation, support for `.pest` files has been removed. Only `.pst` files are managed by the extension
- **Bug Fixes**:
  - Resolved various bugs reported in the previous version to enhance stability and reliability
- **OS Agnostic Enhancements**:
  - Improved compatibility across different operating systems to ensure consistent performance
- **Control Data Fixes (WIP)**:
  - Ongoing work to fix issues related to the Control Data section for better accuracy and performance
- **Pestcheck Parser Enhancements (WIP)**:
  - Additional parse options are being developed to enhance the parsing of your Pestcheck output
- **Model Command Line Enhancement**:
  - Added support for handling multiple words in *model command line section, particularly useful for Python commands. The extension now creates a link using the last word as the target file path

### 0.0.7
- **Pestcheck Installation Check**:
  - Added a minor update to avoid displaying the "Pestcheck already installed" message if Pestcheck is already present

### 0.0.6
- **Pestcheck Compatibility**:
  - Now compatible with `Pestcheck` for enhanced validation and error checking. Pestcheck.exe is not provided by the extension
- **Pestcheck Path and Settings**:
  - Added a field to specify the path for `Pestcheck` and its settings
  - Implemented auto-setup commands to locate `Pestcheck` in the system path and common directories
- **Quick Access Links**:
  - Added links to files in `.bat` files for quick access to open files in a new window
- **Identify External Change**:
  - Implemented a feature to detect external changes in `.pst` and  `.pest` files and notify the user

### 0.0.5
- **Updated README.md**:
  - Highlighted that the extension works **WITHOUT** modifying `.pst` files, emphasizing its seamless decorator functionality
  - Enhanced description of the extension's purpose and features for improved clarity
  - Added animated GIFs to illustrate functionality in the `README.md`
- **Enhanced Language Support**:
  - Now includes both spellings: **Regularization** and **Regularisation** for broader compatibility
  - **Prior Information Improvement**:
    - Removed asterisks (*) and equal signs (=) for cleaner formatting and better readability
  - **Identify External Change**:
    - Implemented a feature to detect external changes in `.pst` files and notify the user
---

### 0.0.4
- Added support for **Prior Information** section with appropriate emoji
- Added support for **Regularization** section with descriptions for each value
- Improved handling of optional values in the **Control Data** section
- Added **Open Manual** to the Outline

### 0.0.3
- Added hover support for **Control data**, **Singular value decomposition**, **Parameter Data**, **Observation Groups**, and **Observation Data** sections
- Enhanced Outline panel with icons for each section for easier navigation
- Improved color coding for sections, floats, strings, and integers for better visualization
- Implemented clickable file paths in the **Model Input/Output** and **Model Command Line** sections
- Added Pest++ instructions with hover tooltips for Pest++ attributes
- Fixed issues with workspace activation for deeply nested .pst or .pest files
- Improved handling of optional values in the **Control Data** section

### 0.0.2
- Added collapsible sections for better navigation
- Included a quick access link to the PEST manual in the first line of the file
- Added hover descriptions for the **Parameter Groups** section
- Highlighted ongoing work on handling optional values in the **Control Data** section

### 0.0.1
- Initial release