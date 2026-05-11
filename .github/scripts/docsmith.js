import fs from "fs";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

const generatedReadme = fs.existsSync("README.generated.md")
  ? fs.readFileSync("README.generated.md", "utf-8")
  : "";

const prompt = `
You are DocSmith, the M3TAL UI Architect.

Task:
Polish the README for the M3TAL Dashboard (m3tal-godash).

Rules:
- Focus on the "Mission Control" and "High-Density" aesthetic.
- Emphasize real-time visualization and observability.
- Explain its role as the primary human interface to the M3TAL stack.
- Keep it concise.

RAW README:
${generatedReadme}
`;

async function run() {
  const result = await model.generateContent(prompt);
  fs.writeFileSync("README.md", result.response.text());
  console.log("README polished by DocSmith for Dashboard.");
}

run();
