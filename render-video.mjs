import { spawn, execSync } from "node:child_process";
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";

const root = resolve(".");
const nodeExe = "C:\\Users\\Administrator\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\bin\\node.exe";
const yarnCjs = join(root, "yarn.cjs");

// Kill any process using port 4173 to avoid EADDRINUSE
try {
  console.log("Cleaning up port 4173...");
  execSync('powershell -Command "$conn = Get-NetTCPConnection -LocalPort 4173 -ErrorAction SilentlyContinue; if ($conn) { Stop-Process -Id $conn.OwningProcess -Force }"');
  console.log("Port 4173 cleaned up.");
} catch (e) {
  // Ignore
}

console.log("Starting local preview server...");
const serverProcess = spawn(nodeExe, [join(root, "server.mjs")], {
  stdio: "inherit",
  env: { ...process.env, PORT: "4173" }
});

// Give the server a moment to start
await new Promise(resolve => setTimeout(resolve, 2000));

try {
  // Install dependencies in remotion folder if node_modules doesn't exist
  const remotionDir = join(root, "remotion");
  const nodeModulesDir = join(remotionDir, "node_modules");
  if (!existsSync(nodeModulesDir)) {
    console.log("Installing Remotion dependencies via Yarn...");
    const installProcess = spawn(nodeExe, [yarnCjs, "install"], {
      cwd: remotionDir,
      stdio: "inherit"
    });
    await new Promise((resolve, reject) => {
      installProcess.on("close", code => {
        if (code === 0) resolve();
        else reject(new Error(`Yarn install failed with code ${code}`));
      });
    });
  }

  console.log("Rendering video with Remotion...");
  const renderProcess = spawn(nodeExe, [yarnCjs, "run", "render"], {
    cwd: remotionDir,
    stdio: "inherit"
  });

  await new Promise((resolve, reject) => {
    renderProcess.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(`Remotion render failed with code ${code}`));
    });
  });

  console.log("Video rendering complete! Output saved as out.mp4 in the workspace root.");
} catch (err) {
  console.error("Error during render:", err);
} finally {
  console.log("Stopping local preview server...");
  serverProcess.kill();
  process.exit(0);
}

