// src/index.js
if (process.env.NODE_ENV !== 'production') require('dotenv').config();

const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const { getGuild, setGuild } = require('./config');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const log = (...a) => console.log(new Date().toISOString(), ...a);

client.once('clientReady', () => log('Bot online as', client.user.tag));

// Auto-role on join
client.on('guildMemberAdd', async member => {
  try {
    const cfg = getGuild(member.guild.id);
    if (cfg.autoRole) {
      const role = member.guild.roles.cache.get(cfg.autoRole) || await member.guild.roles.fetch(cfg.autoRole).catch(()=>null);
      if (role) await member.roles.add(role).catch(e => log('autorole add failed', e.message));
    }
  } catch (e) {
    log('guildMemberAdd error', e.message);
  }
});

// Auto-response on message
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  try {
    const cfg = getGuild(message.guild.id);
    if (!cfg.autoresponses || cfg.autoresponses.length === 0) return;
    const content = message.content.toLowerCase();
    for (const ar of cfg.autoresponses) {
      if (content.includes(ar.keyword.toLowerCase())) {
        await message.reply(ar.response).catch(() => {});
        break;
      }
    }
  } catch (e) {
    log('messageCreate error', e.message);
  }
});

// Slash command handler
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // config autorole (admin only)
  if (interaction.commandName === 'config') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: 'Admin only.', ephemeral: true });
    }
    const sub = interaction.options.getSubcommand();
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
  }

  // autoresponse commands (admin only)
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
      const list = (cfg.autoresponses || []).map((a, i) => `${i+1}. "${a.keyword}" -> ${a.response}`).join('\n') || 'No autoresponses';
      return interaction.reply({ content: `Autoresponses:\n${list}`, ephemeral: true });
    }
  }
});

client.login(process.env.BOT_TOKEN);