require('dotenv').config();
require('source-map-support').install();

import {CategoryChannel, Client, Guild, GuildChannel, Message, Snowflake} from 'discord.js';
import { find, keys, over } from 'lodash';
import { getLogger, shutdown } from 'log4js';

const log = getLogger();

log.info(``);
log.info(`-------------- Application Starting ${new Date()} --------------`);
log.info(``);

const CONFIG = require('../res/config.json');

require('./ValidateEnv.js').validate();


const bot = new Client();
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

async function findCategories(guild:Guild){
    let roleManager = await guild.roles.fetch();
    let categoryRole = roleManager.cache.find(role => role.name == CONFIG.mentor_category);
    let categories: { [index: string]: CategoryChannel[] } = {};
    guild.channels.cache.forEach(channel => {   
        if(channel.type == "category" && categoryRole?.id && channel.permissionOverwrites.find(overwrite => overwrite.id == categoryRole?.id)){
            let category = channel.name.split(' ')[0].toLowerCase();
            if(!categories[category]){ 
                categories[category] = [];
            }
            categories[category].push(channel as CategoryChannel);
        }
    });
    return categories;
}

async function mentor(msg: Message & {guild: Guild}){
    if(msg.member?.roles.cache.find(role => role.name == CONFIG.student_role)){
        msg.channel.send(`You are already a ${CONFIG.student_role}!`);
        return;
    }
    let mentorRole = (await msg.guild.roles.fetch()).cache.find(role => role.name == CONFIG.mentor_role);
    if(!mentorRole){
        msg.channel.send(`Server has no ${CONFIG.mentor_role}[mentor] role!`);
        return;
    }
    let studentRole = (await msg.guild.roles.fetch()).cache.find(role => role.name == CONFIG.student_role);
    if(!studentRole){
        msg.channel.send(`Server has no ${CONFIG.student_role}[student] role!`);
        return;
    }
    let parts = msg.content.split(' ');
    if(parts.length < 3){
        msg.channel.send(`Please format the request in \`!mentor <ERA> <NATION>\``);
        return;
    }
    let categoryName = parts[1].toLowerCase();
    let categories = await findCategories(msg.guild);
    if(!categories[categoryName]){
        msg.channel.send(`Unrecognized era! Recognized Eras: ${keys(categories).join(' ')}`);
        return;
    }

    let category:CategoryChannel | null = null;
    for(let channel of categories[categoryName]){
        if(channel.children.size < 50){
            category = channel;
            break;
        }
    }
    if(category == null){
        msg.channel.send(`Out of room for ${categoryName}! Ask some one to make more!`);
        return;
    }
    let nation = parts.splice(2).join('');
    await msg.guild.channels.create(
        `${msg.member?.displayName}-${nation}`,
        {
            type:'text',
            parent: category,
            permissionOverwrites:[
                {
                    id: msg.guild.id,
                    deny: ['VIEW_CHANNEL'],
                },
                {
                    id: msg.author.id,
                    allow: ['VIEW_CHANNEL', 'MANAGE_MESSAGES', 'SEND_MESSAGES'],
                },
                {
                    id: mentorRole.id,
                    allow: ['VIEW_CHANNEL', 'MANAGE_MESSAGES', 'SEND_MESSAGES'],
                },
            ]
        });
    await msg.member?.roles.add(studentRole);
}

async function initGuild(msg: Message & {guild:Guild}){
    log.info(`initalizing ${msg.guild.name}`);
    let roleManager = await msg.guild.roles.fetch();
    let changed = false;
    if(!roleManager.cache.find(role => role.name == CONFIG.student_role)){
        await roleManager.create({data: {name: CONFIG.student_role, mentionable: false, permissions: 0}});
        changed = true;
    }
    if(!roleManager.cache.find(role => role.name == CONFIG.mentor_role)){
        await roleManager.create({data: {name: CONFIG.mentor_role, mentionable: false, permissions: 0}});
        changed = true;
    }
    let categoryRole = roleManager.cache.find(role => role.name == CONFIG.mentor_category);
    if(!categoryRole){
        categoryRole = await roleManager.create({data: {name: CONFIG.mentor_category, mentionable: false, permissions: 0}});
        changed = true;
    }
    if(changed){
        log.info(`initalized ${msg.guild.name}`);
        msg.channel.send(`Initalized ${msg.guild.name}`);
    }
}

function hasGuild( obj: any ): obj is {guild:Guild} {
    return 'guild' in obj;
}

async function findStales(msg:Message&{guild:Guild}){
    let role = (await msg.guild.roles.fetch()).cache.find(role => role.name == CONFIG.student_role);
    if(!role){
        msg.channel.send(`Server has no ${CONFIG.mentor_role}[mentor] role!`);
        return;
    }
    let stales: string[] = [];
    let categories = await findCategories(msg.guild);
    for(let parentCategory in categories){
        let subcategorys = categories[parentCategory];
        for(let subcategory of subcategorys){
            subcategory.children.each(channel => {
                if(channel.members.find(member => member.roles.cache.find(r => r.id == role?.id) == null)){
                    stales.push(channel.toString());
                }
            });
        }
    }
    if(stales.length > 0){
        msg.channel.send(stales.slice(0, Math.min(50, stales.length)).join('\n'));
    }else{
        msg.channel.send(`No stale channels found`);
    }
}

bot.on('ready', () => {
    log.info(`Logged in as ${bot?.user?.tag}!`);
});

bot.on('message', async msg => {
    try{
        if(!msg.content.startsWith(`${process.env.COMMAND_PREFIX}`)){
            return;
        }
        let command = msg.content.substr(1);
        if(hasGuild(msg)){
            switch(command.split(' ')[0]){
                case 'init':
                    initGuild(msg);
                    break;
                case 'mentor':
                    mentor(msg);
                    break;
                case 'find':
                    msg.channel.send('You must find yourself first!');
                    break;
                case 'stales':
                    findStales(msg);
                    break;
                case 'echo':
                    msg.channel.send(msg.channel.toString());
                    break;
            }
        }
    }catch(err){
        log.error(err);
    }
});

bot.login(TOKEN).then(s => {
    
}).catch(err => {
    log.error(`Failed to log in ${err}`);
    throw err;
});