import fs from "fs";

function readJSON(path) {
  return fs.existsSync(path) ? JSON.parse(fs.readFileSync(path)) : {};
}

const component = readJSON("docs/component.json");

let md = `# ${component.name}\n\n`;

md += `> **Role**: ${component.role}\n`;
md += `> **Technology**: ${component.tech}\n\n`;

md += `## Overview\n`;
md += `This is the M3TAL Dashboard, a high-density "Mission Control" interface for monitoring and controlling the M3TAL media automation platform.\n\n`;

md += `## Features\n`;
md += `- Real-time system monitoring via SocketIO\n`;
md += `- API-driven container control\n`;
md += `- Professional high-density UI statistics\n`;
if (component.hasDocker) md += `- Containerized deployment\n`;

md += `\n## M3TAL Ecosystem\n`;
md += `This is a sub-component of the [M3TAL Media Server](https://github.com/jakej985-rgb/M3tal-Media-Server).\n`;
md += `- **Core Orchestrator**: M3tal-Media-Server\n`;
md += `- **Backend API**: m3tal-goback\n`;

fs.writeFileSync("README.generated.md", md);
console.log("README.generated.md assembled for Dashboard.");
