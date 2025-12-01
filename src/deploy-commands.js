// src/deploy-commands.js
const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.TEST_GUILD_ID;

const commands = [
  // CONFIG (autorole + modlog)
  new SlashCommandBuilder()
    .setName('config')
    .setDescription('Server automation configuration')
    .addSubcommand(sub =>
      sub.setName('autorole')
         .setDescription('Configure autorole')
         .addStringOption(opt =>
           opt.setName('action')
              .setDescription('set or clear')
              .setRequired(true)
              .addChoices(
                { name: 'set', value: 'set' },
                { name: 'clear', value: 'clear' }
              ))
         .addRoleOption(opt => opt.setName('role').setDescription('Role to assign (required for set)'))
    )
    .addSubcommand(sub =>
      sub.setName('modlog')
         .setDescription('Configure modlog channel')
         .addStringOption(opt =>
           opt.setName('action')
              .setDescription('set or clear')
              .setRequired(true)
              .addChoices(
                { name: 'set', value: 'set' },
                { name: 'clear', value: 'clear' }
              ))
         .addChannelOption(opt => opt.setName('channel').setDescription('Channel to log to (required for set)'))
    ),

  // AUTORESPONSE
  new SlashCommandBuilder()
    .setName('autoresponse')
    .setDescription('Manage autoresponses')
    .addSubcommand(sub =>
      sub.setName('add')
         .setDescription('Add autoresponse')
         .addStringOption(o => o.setName('keyword').setDescription('Keyword trigger').setRequired(true))
         .addStringOption(o => o.setName('response').setDescription('Reply text').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('remove')
         .setDescription('Remove autoresponse by keyword')
         .addStringOption(o => o.setName('keyword').setDescription('Keyword').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('list')
         .setDescription('List autoresponses')
    ),

  // REMIND
  new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Set a one-time reminder')
    .addStringOption(opt => opt
      .setName('when')
      .setDescription('When: duration like 10m, 2h, 1d or ISO datetime')
      .setRequired(true))
    .addStringOption(opt => opt
      .setName('text')
      .setDescription('Reminder text')
      .setRequired(true))
].map(c => c.toJSON());

(async () => {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('Registering commands to guild...', GUILD_ID);
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('Commands registered.');
  } catch (err) {
    console.error('Failed to register commands:', err);
    process.exit(1);
  }
})();