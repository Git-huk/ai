// lib/configdb.js
const fs = require('fs')
const path = require('path')

const DB_PATH = path.join(__dirname, 'config.json')

// Ensure file exists
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, JSON.stringify({}), 'utf8')
}

function readConfig() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8')
    return JSON.parse(raw)
  } catch (e) {
    console.error('❌ Failed to read config:', e)
    return {}
  }
}

function writeConfig(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8')
  } catch (e) {
    console.error('❌ Failed to write config:', e)
  }
}

module.exports = {
  getConfig: (key) => {
    const config = readConfig()
    return config[key] ?? null
  },

  setConfig: (key, value) => {
    const config = readConfig()
    config[key] = value
    writeConfig(config)
  },

  getAllConfig: () => {
    return readConfig()
  }
}
