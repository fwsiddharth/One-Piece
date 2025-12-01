// src/deploy-commands.js
const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();
const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.TEST_GUILD_ID;

const commands = [
  new SlashCommandBuilder()
    .setName('config')
    .setDescription('Server automation configuration')
    .addSubcommand(sub =>
      sub.setName('autorole')
         .setDescription('Configure autorole')
         .addStringOption(opt => opt.setName('action').setDescription('set or clear').setRequired(true).addChoices(
           { name: 'set', value: 'set' },
           { name: 'clear', value: 'clear' }
         ))
         .addRoleOption(opt => opt.setName('role').setDescription('Role to assign (required for set)'))
    ),
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
    )
].map(c => c.toJSON());

(async () => {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('Registering commands to guild...', GUILD_ID);
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('Commands registered.');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();