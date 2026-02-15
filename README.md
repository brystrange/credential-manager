# Credential Manager - Setup Guide

This guide provides step-by-step instructions to set up the Credential Manager project from scratch on a new computer.

## Prerequisites

Before running this project, you need to install the following software on your computer.

### 1. Install Node.js
Node.js is the runtime environment required to run this project.
1.  Go to the [Node.js official website](https://nodejs.org/).
2.  Download the **LTS (Long Term Support)** version (recommended for most users).
3.  Run the installer and follow the on-screen instructions (you can accept the default settings).
4.  **Verify Installation**:
    -   Open your terminal (Command Prompt, PowerShell, or Terminal).
    -   Type the following commands and press Enter:
        ```bash
        node -v
        npm -v
        ```
    -   If installed correctly, you will see version numbers (e.g., `v20.x.x` and `10.x.x`).

### 2. Install Git
Git is used for version control and downloading the project code.
1.  Go to the [Git official website](https://git-scm.com/downloads).
2.  Download the installer for your operating system (Windows, macOS, or Linux).
3.  Run the installer. The default settings are usually fine, but you can customize them if you know what you are doing.
4.  **Verify Installation**:
    -   Open your terminal.
    -   Type:
        ```bash
        git --version
        ```
    -   You should see the installed git version.

### 3. (Optional) Install a Code Editor
We highly recommend using **Visual Studio Code (VS Code)** for editing the code.
-   Download it from [code.visualstudio.com](https://code.visualstudio.com/).

---

## Getting the Code

Now that you have the necessary tools, you can download the project.

### 1. Open Terminal
Open your terminal (Command Prompt, PowerShell, or Terminal) or the built-in terminal in VS Code (`Ctrl + ~`).

### 2. Clone the Repository
Navigate to the folder where you want to keep your projects, then run:

```bash
git clone <YOUR_REPOSITORY_URL>
```
*(Replace `<YOUR_REPOSITORY_URL>` with the actual URL of this repository).*

### 3. Open the Project Folder
Move into the project directory:
```bash
cd credential-manager
```
If you are using VS Code, you can open the folder immediately:
```bash
code .
```

---

## Installation & Setup

You need to install the project's dependencies (libraries like React, Firebase, etc.) before running it.

### 1. Install Dependencies
Run the following command in your terminal (make sure you are inside the `credential-manager` folder):

```bash
npm install
```
*This might take a minute as it downloads all required packages.*

---

## Running the Application

### Start Development Server
To start the app locally and see it in your browser:

```bash
npm run dev
```

-   After running this, the terminal will show a local URL, usually:
    `http://localhost:5173/` or similar.
-   **Hold Ctrl and click** the link, or open your browser and type that address.
-   You should now see the application running!

### Stopping the Server
To stop the server, go back to your terminal and press **Ctrl + C**.

---

## Building for Production

If you want to create a production-ready version of the app (optimized and minified):

1.  Run the build command:
    ```bash
    npm run build
    ```
    This creates a `dist` folder with the final files.

2.  To preview this build locally:
    ```bash
    npm run preview
    ```

---

## Troubleshooting

-   **'npm' is not recognized**:
    -   Make sure you installed Node.js.
    -   Close and reopen your terminal to refresh the system path variables.
-   **Permission errors**:
    -   Try running your terminal as Administrator (right-click -> Run as Administrator), though this is rarely needed for standard projects.
-   **Port already in use**:
    -   If `http://localhost:5173/` is taken, Vite will automatically try the next available port (e.g., 5174). Check the terminal output for the correct URL.

## Project Stack
-   **Framework**: React (v19)
-   **Build Tool**: Vite
-   **Language**: TypeScript
-   **Backend/Auth**: Firebase
-   **Routing**: React Router
-   **Icons**: React Icons
