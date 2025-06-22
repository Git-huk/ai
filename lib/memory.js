const fs = require("fs");
const path = require("path");

const memoryDir = path.join(__dirname, "../memory");
if (!fs.existsSync(memoryDir)) fs.mkdirSync(memoryDir);

function getMemoryFile(userJid) {
    return path.join(memoryDir, `${userJid.replace(/[@.]/g, "_")}.json`);
}

function loadUserMemory(userJid) {
    const file = getMemoryFile(userJid);
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file));
}

function saveUserMemory(userJid, memory) {
    const file = getMemoryFile(userJid);
    fs.writeFileSync(file, JSON.stringify(memory.slice(-10), null, 2)); // Keep only last 10
}

function updateMemory(userJid, role, content) {
    const memory = loadUserMemory(userJid);
    memory.push({ role, content });
    saveUserMemory(userJid, memory);
    return memory;
}

module.exports = {
    loadUserMemory,
    updateMemory
};
