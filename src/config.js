// src/config.js
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'config.json');

function ensureDir() {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({}), 'utf8');
}

function read() {
  ensureDir();
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

function write(obj) {
  ensureDir();
  fs.writeFileSync(FILE, JSON.stringify(obj, null, 2), 'utf8');
}

function getGuild(guildId) {
  const cfg = read();
  return cfg[guildId] || { autoRole: null, autoresponses: [] };
}

function setGuild(guildId, value) {
  const cfg = read();
  cfg[guildId] = value;
  write(cfg);
}

module.exports = { getGuild, setGuild };