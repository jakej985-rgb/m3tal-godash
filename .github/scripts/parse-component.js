import fs from "fs";

const component = {
  name: "m3tal-godash",
  role: "UI / Visualization Layer",
  tech: "Python / Flask / SocketIO",
  hasDocker: fs.existsSync("Dockerfile"),
};

fs.writeFileSync("docs/component.json", JSON.stringify(component, null, 2));
console.log("Dashboard component state parsed.");
