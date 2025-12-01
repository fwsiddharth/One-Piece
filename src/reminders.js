// src/reminders.js
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'reminders.json');

function ensure() {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify([]), 'utf8');
}

function readAll() {
  ensure();
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

function writeAll(list) {
  ensure();
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2), 'utf8');
}

function addReminder(reminder) {
  const all = readAll();
  all.push(reminder);
  writeAll(all);
}

function removeReminder(id) {
  const all = readAll().filter(r => r.id !== id);
  writeAll(all);
}

module.exports = { readAll, addReminder, removeReminder };