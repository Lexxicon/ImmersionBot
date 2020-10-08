require('dotenv').config();
require('source-map-support').install();
require('./Prototypes.js');

import { getLogger, shutdown } from 'log4js';
const log = getLogger();

import Discord, { NewsChannel, TextChannel } from 'discord.js';
import { GuildMessage } from './global';

log.info(``);
log.info(`-------------- Application Starting ${new Date()} --------------`);
log.info(``);

require('./ValidateEnv.js').validate();


const bot = new Discord.Client();
const TOKEN = process.env.TOKEN;;
const LOBBY_NAME = process.env.DEFAULT_LOBBY_NAME;

export function getDiscordBot(){
    return bot;
}

function cleanup(){
    log.info('Goodbye');
    shutdown();
}

// do app specific cleaning before exiting
process.on('exit', function () {
    cleanup();
});

// catch ctrl+c event and exit normally
process.on('SIGINT', function () {
    log.info('Ctrl-C...');
    cleanup();
    process.exit(2);
});

//catch uncaught exceptions, trace, then exit normally
process.on('uncaughtException', function(e) {
    log.error(`Uncaught Exception... ${e} ${e.name}`);
    log.error(e.stack);
    cleanup();
    process.exit(99);
});

bot.on('ready', () => {
    log.info(`Logged in as ${bot?.user?.tag}!`);
});

bot.on('message', async msg => {
    
});

bot.login(TOKEN).then(s => {
    
}).catch(err => {
    log.error(`Failed to log in ${err}`);
    throw err;
});