// src/index.js
// Full implementation: autorole, autoresponse, modlog, reminders (channel + DM).
// Overwrite your existing src/index.js with this file.

if (process.env.NODE_ENV !== 'production') require('dotenv').config();

const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const { getGuild, setGuild } = require('./config');
const { readAll: readReminders, addReminder, removeReminder } = require('./reminders');
const crypto = require('crypto');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const log = (...args) => console.log(new Date().toISOString(), ...args);

// tolerant time parser: accepts "5s", "5 sec", "30" (seconds), "10m", "2h", "1d" or ISO datetime
function parseWhen(whenRaw) {
  if (!whenRaw || typeof whenRaw !== 'string') return null;
  const when = whenRaw.trim().toLowerCase();

  const dur = when.match(/^(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/i);
  if (dur) {
    const n = Number(dur[1]);
    const u = dur[2];
    const multipliers = {
      s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000,
      m: 60_000, min: 60_000, mins: 60_000, minute: 60_000, minutes: 60_000,
      h: 3_600_000, hr: 3_600_000, hrs: 3_600_000, hour: 3_600_000, hours: 3_600_000,
      d: 86_400_000, day: 86_400_000, days: 86_400_000
    };
    const mult = multipliers[u];
    if (!mult) return null;
    return Date.now() + (n * mult);
  }

  const plainNum = when.match(/^(\d+)$/);
  if (plainNum) {
    return Date.now() + (Number(plainNum[1]) * 1000);
  }

  const t = Date.parse(whenRaw);
  if (!isNaN(t)) return t;
  return null;
}

// --- Reminder scheduling
const scheduledTimers = new Map();

function scheduleReminder(rem) {
  const delay = rem.ts - Date.now();
  if (delay <= 0) {
    // due now
    void deliverReminder(rem);
    return;
  }
  const timer = setTimeout(() => {
    void deliverReminder(rem);
  }, delay);
  scheduledTimers.set(rem.id, timer);
}

async function deliverReminder(rem) {
  try {
    // 1) Send in original channel if possible
    if (rem.channelId) {
      try {
        const ch = await client.channels.fetch(rem.channelId).catch(() => null);
        if (ch && ch.send) {
          await ch.send({ content: `<@${rem.userId}> Reminder: ${rem.text}` }).catch(() => {});
        }
      } catch {}
    }

    // 2) Always attempt DM as well
    try {
      const user = await client.users.fetch(rem.userId).catch(() => null);
      if (user) await user.send({ content: `Reminder: ${rem.text}` }).catch(() => {});
    } catch {}

  } catch (err) {
    log('deliverReminder error', err?.message ?? err);
  } finally {
    try { removeReminder(rem.id); } catch {}
    if (scheduledTimers.has(rem.id)) {
      clearTimeout(scheduledTimers.get(rem.id));
      scheduledTimers.delete(rem.id);
    }
  }
}

// --- Client ready: schedule persisted reminders
client.once('clientReady', () => {
  log('Bot online as', client.user.tag);
  try {
    const all = readReminders();
    for (const r of all) scheduleReminder(r);
    log('Scheduled', all.length, 'reminder(s)');
  } catch (e) {
    log('Error scheduling reminders on startup', e?.message ?? e);
  }
});

// --- Auto-role on join
client.on('guildMemberAdd', async member => {
  try {
    const cfg = getGuild(member.guild.id);
    if (cfg && cfg.autoRole) {
      let role = member.guild.roles.cache.get(cfg.autoRole);
      if (!role) role = await member.guild.roles.fetch(cfg.autoRole).catch(() => null);
      if (role) await member.roles.add(role).catch(e => log('autorole add failed', e?.message ?? e));
    }
  } catch (e) {
    log('guildMemberAdd error', e?.message ?? e);
  }
});

// --- Auto-response on message
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  try {
    const cfg = getGuild(message.guild.id);
    if (!cfg || !cfg.autoresponses || cfg.autoresponses.length === 0) return;
    const content = message.content.toLowerCase();
    for (const ar of cfg.autoresponses) {
      if (!ar.keyword) continue;
      if (content.includes(ar.keyword.toLowerCase())) {
        await message.reply({ content: ar.response }).catch(() => {});
        break;
      }
    }
  } catch (e) {
    log('messageCreate error', e?.message ?? e);
  }
});

// --- Message delete watcher for modlog
client.on('messageDelete', async message => {
  try {
    if (!message.guild) return;
    const cfg = getGuild(message.guild.id);
    if (!cfg || !cfg.modLog) return;
    const ch = message.guild.channels.cache.get(cfg.modLog) || await message.guild.channels.fetch(cfg.modLog).catch(() => null);
    if (!ch || !ch.send) return;
    const author = message.author ? `${message.author.tag} (${message.author.id})` : 'Unknown';
    const chanName = message.channel ? message.channel.name : 'Unknown';
    const content = message.content ? message.content : '[embed/attachment or empty]';
    const info = `**Message deleted**\nAuthor: ${author}\nChannel: #${chanName}\nContent: ${content}`;
    await ch.send({ content: info }).catch(() => {});
  } catch (e) {
    log('messageDelete error', e?.message ?? e);
  }
});

// --- Interaction (slash command) handler
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    // /config (autorole & modlog)
    if (interaction.commandName === 'config') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: 'Admin only.', ephemeral: true });
      }

      const sub = interaction.options.getSubcommand();

      // autorole
      if (sub === 'autorole') {
        const action = interaction.options.getString('action');
        if (action === 'set') {
          const role = interaction.options.getRole('role');
          if (!role) return interaction.reply({ content: 'Role required for set.', ephemeral: true });
          const cfg = getGuild(interaction.guildId);
          cfg.autoRole = role.id;
          setGuild(interaction.guildId, cfg);
          return interaction.reply({ content: `Auto-role set to ${role.name}`, ephemeral: true });
        } else if (action === 'clear') {
          const cfg = getGuild(interaction.guildId);
          cfg.autoRole = null;
          setGuild(interaction.guildId, cfg);
          return interaction.reply({ content: `Auto-role cleared`, ephemeral: true });
        }
      }

      // modlog
      if (sub === 'modlog') {
        const action = interaction.options.getString('action');
        if (action === 'set') {
          const channel = interaction.options.getChannel('channel');
          if (!channel) return interaction.reply({ content: 'Channel required for set.', ephemeral: true });
          const cfg = getGuild(interaction.guildId);
          cfg.modLog = channel.id;
          setGuild(interaction.guildId, cfg);
          return interaction.reply({ content: `ModLog set to ${channel.name}`, ephemeral: true });
        } else if (action === 'clear') {
          const cfg = getGuild(interaction.guildId);
          cfg.modLog = null;
          setGuild(interaction.guildId, cfg);
          return interaction.reply({ content: `ModLog cleared`, ephemeral: true });
        }
      }

      return;
    }

    // /autoresponse (add/remove/list)
    if (interaction.commandName === 'autoresponse') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: 'Admin only.', ephemeral: true });
      }
      const sub = interaction.options.getSubcommand();
      const cfg = getGuild(interaction.guildId);
      if (!cfg.autoresponses) cfg.autoresponses = [];

      if (sub === 'add') {
        const keyword = interaction.options.getString('keyword');
        const response = interaction.options.getString('response');
        cfg.autoresponses.push({ keyword, response });
        setGuild(interaction.guildId, cfg);
        return interaction.reply({ content: `Added autoresponse for "${keyword}"`, ephemeral: true });
      } else if (sub === 'remove') {
        const keyword = interaction.options.getString('keyword');
        cfg.autoresponses = (cfg.autoresponses || []).filter(a => a.keyword.toLowerCase() !== keyword.toLowerCase());
        setGuild(interaction.guildId, cfg);
        return interaction.reply({ content: `Removed autoresponse for "${keyword}"`, ephemeral: true });
      } else if (sub === 'list') {
        const list = (cfg.autoresponses || []).map((a, i) => `${i + 1}. "${a.keyword}" -> ${a.response}`).join('\n') || 'No autoresponses';
        return interaction.reply({ content: `Autoresponses:\n${list}`, ephemeral: true });
      }
      return;
    }

    // /remind
    if (interaction.commandName === 'remind') {
      const whenRaw = interaction.options.getString('when');
      const text = interaction.options.getString('text');
      const ts = parseWhen(whenRaw);
      if (!ts) return interaction.reply({ content: 'Invalid time. Use 5s, 10m, 2h, 1d or an ISO datetime.', ephemeral: true });

      if (ts - Date.now() > 365 * 24 * 3600 * 1000) {
        return interaction.reply({ content: 'Max 365 days allowed.', ephemeral: true });
      }

      const id = crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
      const rem = {
        id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId: interaction.user.id,
        text,
        ts
      };

      try {
        addReminder(rem);
        scheduleReminder(rem);
        const due = new Date(ts).toLocaleString();
        return interaction.reply({ content: `Reminder set for ${due}`, ephemeral: true });
      } catch (e) {
        log('remind add error', e?.message ?? e);
        return interaction.reply({ content: 'Failed to set reminder.', ephemeral: true });
      }
    }

  } catch (err) {
    log('interaction handling error', err?.message ?? err);
    if (!interaction.replied) {
      try { await interaction.reply({ content: 'Internal error', ephemeral: true }); } catch {}
    }
  }
});

// --- login
if (!process.env.BOT_TOKEN) {
  log('ERROR: BOT_TOKEN is not set');
  process.exit(1);
}
client.login(process.env.BOT_TOKEN).catch(err => {
  log('Login failed', err?.message ?? err);
  process.exit(1);
});