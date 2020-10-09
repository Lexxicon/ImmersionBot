require('dotenv').config();
require('source-map-support').install();

import {CategoryChannel, Client, Guild, GuildChannel, GuildEmoji, Message, MessageManager, Snowflake, TextChannel} from 'discord.js';
import dateFormat from 'dateformat';
import { find, keys, last, over } from 'lodash';
import { getLogger, shutdown } from 'log4js';
import AsciiTable from 'ascii-table';
import AsciiChart from 'asciichart';

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


const SEC_IN_MIN = 60;
const SEC_IN_HOUR = SEC_IN_MIN * 60;
const SEC_IN_DAY = SEC_IN_HOUR * 24;

function getSeconds(str: string) {
    if(str.startsWith('-')) throw `Negative times aren't allowed! ${str}`
    let seconds = 0;
    let days = str.match(/(\d+)\s*d/);
    let hours = str.match(/(\d+)\s*h/);
    let minutes = str.match(/(\d+)\s*m/);
    let rawSeconds = str.match(/(\d+)\s*s/);
    if (days) { seconds += parseInt(days[1])*SEC_IN_DAY; }
    if (hours) { seconds += parseInt(hours[1])*SEC_IN_HOUR; }
    if (minutes) { seconds += parseInt(minutes[1])*SEC_IN_MIN; }
    if (rawSeconds) { seconds += parseInt(rawSeconds[1]); }
    return seconds;
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
        findUser(msg);
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
        let mentorRole = await roleManager.create({data: {name: CONFIG.mentor_role, mentionable: false, permissions: 0}});
        changed = true;
        msg.guild.me?.roles.add(mentorRole);
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

function hasMessages( obj: any ): obj is {messages: MessageManager}{
    return 'messages' in obj;
}

async function findStales(msg:Message&{guild:Guild}){
    let role = (await msg.guild.roles.fetch()).cache.find(role => role.name == CONFIG.mentor_role);
    if(!role){
        await msg.channel.send(`Server has no ${CONFIG.mentor_role}[mentor] role!`);
        return;
    }

    if(msg.member?.roles.cache.find(r => r.id == role?.id) == null){
        msg.channel.send(`Only mentors can use this`);
        return ;
    }
    let lastTalkThreashold: Date | null = null;

    if(msg.content.split(' ').length > 1){
        let rawTime = msg.content.split(' ').slice(1).join(' ');
        let ms = getSeconds(rawTime) * 1000;
        lastTalkThreashold = new Date();
        lastTalkThreashold.setTime(lastTalkThreashold.getTime() - ms);
    }

    log.info(`${lastTalkThreashold}`);

    let onlyMentors: string[] = [];
    let idle: string[] = [];

    let categories = await findCategories(msg.guild);
    for(let parentCategory in categories){
        let subcategorys = categories[parentCategory];
        for(let subcategory of subcategorys){
            let channels: GuildChannel[] & {messages:MessageManager}[] = [];
            subcategory.children.each(channel => {
                let foundOnlyMentors = true;
                channel.members.each(member => {
                    if(member.user.id == bot.user?.id) return;
                    if(member.roles.cache.find(r => r.id == role!.id) == null){
                        foundOnlyMentors = false;
                    }
                });
                if(foundOnlyMentors){
                    onlyMentors.push(channel.toString());
                }else if(lastTalkThreashold && hasMessages(channel) ) {
                    channels.push(channel);
                }
            });
            if(lastTalkThreashold){
                for(let channel of channels){
                    try{
                        let messages = await channel.messages.fetch({limit: 1});
                        let m = messages.random();
                        if(!m || m.createdTimestamp < lastTalkThreashold.getTime()){
                            idle.push(channel.toString());
                        }
                    }catch(err){
                        log.error(err);
                    }
                }
            }
        }
    }
    if(onlyMentors.length > 0){
        await msg.channel.send(`Only ${role.name}:\n${onlyMentors.slice(0, Math.min(50, onlyMentors.length)).join('\n')}`);
    }
    if(idle.length > 0){
        await msg.channel.send(`Idle since ${dateFormat(lastTalkThreashold, 'yyyy-mm-dd HH:MM')}:\n${idle.slice(0, Math.min(50, idle.length)).join('\n')}`);
    }
    if(onlyMentors.length == 0 && idle.length == 0){
        await msg.channel.send(`No stale channels found`);
    }
}

async function findUser(msg:Message&{guild:Guild}){
    let userID = msg.author.id;
    let mentionedUser = msg.mentions.users.random();
    if(mentionedUser && msg.member?.roles.cache.find(role => role.name == CONFIG.mentor_role)){
        userID = mentionedUser.id;
    }

    let categories = await findCategories(msg.guild);
    let found: string[] = [];
    for(let parentCategory in categories){
        let subcategorys = categories[parentCategory];
        for(let subcategory of subcategorys){
            let channels: GuildChannel[] & {messages:MessageManager}[] = [];
            subcategory.children.filter(channel => channel.permissionOverwrites.find((perm, key) => key == userID) != null).each(c => channels.push(c));
            for(let c of channels){
                found.push(c.toString());
            }
        }
    }
    await msg.channel.send(`Found: ${found.join(' ')}`);
}

async function rename(msg:Message&{guild:Guild}){
    let parts = msg.content.split(' ');
    if(parts.length < 3){
        msg.channel.send(`Please format the request in \`!mentor <ERA> <NATION>\``);
        return;
    }

    let mentorRole = (await msg.guild.roles.fetch()).cache.find(role => role.name == CONFIG.mentor_role);
    if(!mentorRole) {
        msg.channel.send(`Guild is missing ${CONFIG.mentor_role} role!`);
        return;
    }

    let channel = msg.channel as GuildChannel;
    let categories = await findCategories(msg.guild);
    let isInCategory = false;
    for(let group in categories){
        for(let category of categories[group]){
            if(channel.parentID == category.id){
                isInCategory = true;
            }
        }
    }
    if(!isInCategory){
        log.debug(`Requested to rename channel not in category: ${channel.name}`);
        return;
    }
    let targetChannel = msg.channel as GuildChannel;
    if(channel.permissionOverwrites.find((perm, key) => key == msg.author.id) == null){
        log.debug(`Non owner requested rename of un authorized channel. ${msg.member?.displayName}, ${targetChannel.name}`)
        return;
    }

    let categoryName = parts[1].toLowerCase();
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

    await targetChannel.edit({
        parentID: category.id,
        name: `${msg.member?.displayName}-${nation}`
    });
}


async function DRN(msg: Message&{guild:Guild}){
    let role = (await msg.guild.roles.fetch()).cache.find(role => role.name == CONFIG.mentor_role);
    if(!role){
        await msg.channel.send(`Server has no ${CONFIG.mentor_role}[mentor] role!`);
        return;
    }
    let isMentor = msg.member?.roles.cache.find(r => r.id == role?.id) == null;
    let targetChannel = msg.channel as GuildChannel;
    if(!isMentor && targetChannel.permissionOverwrites.find((perm, key) => key == msg.author.id) == null){
        return;
    }

    const DRN_REGEX = /(?<ATK>\d+)\s*vs?\s*(?<DEF>\d+)/;
    let match = DRN_REGEX.exec(msg.content);
    function drn(depth: number){
        if(depth > 20) return 10000;
        let roll = Math.ceil(Math.random() * 6);
        if(roll == 6){
            return 5 + drn(depth++);
        }
        return roll;
    }
    if(match && match?.groups){
        let atk = Number(match.groups['ATK']);
        let def = Number(match.groups['DEF']);
        let result = {wins: 0, losses: 0, values: [] as number[]};
        let count = 0;
        let sum = 0;
        while(count++ < 1000){
            let atkDrn = drn(0) + drn(0) + atk;
            let defDrn = drn(0) + drn(0) + def;
            let roll = atkDrn - defDrn;
            sum += roll;
            result.values.push(roll);
            if(roll > 0){
                result.wins++;
            }else{
                result.losses++;
            }
        }
        result.values = result.values.sort((a, b) => a - b);
        let rolls = result.wins + result.losses;
        
        let zero: number[] = [];
        let breakdown: number[] = [];
        let granularity = 30;
        for(let i = 0; i < granularity; i++){
            zero[i] = 0;
            let index = Math.floor((i/granularity) * result.values.length);
            //exclude the lowest and highest rolls
            index = Math.max(10, Math.min(result.values.length - 10, index));
            breakdown[i] = result.values[index];
        }
        
        let table = new AsciiTable(`${atk} vs ${def}`);
        table.addRow('Rolls', rolls);
        table.addRow('Wins', result.wins);
        table.addRow('Losses', result.losses);
        table.addRow('Avg', (sum/count).toFixed(2));
        table.addRow('Win %', ((result.wins/rolls)*100).toFixed(2));

        let tableStr = table.toString().split('\n') as string[];
        let graph = AsciiChart.plot([zero, breakdown], {height: tableStr.length}).split('\n') as string[];
        let output: string[] = [];
        output.push('```');
        for(let i = 0; i < tableStr.length; i++){
            output.push(`${tableStr[i]} ${graph[i]}`);
        }
        output.push('```');
        await msg.channel.send(`${output.join('\n')}`);
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
            const mentorCMD = `${CONFIG.mentor_role}`.toLowerCase();
            log.info(`processing ${command} from ${msg.member?.displayName}`);
            switch(command.split(' ')[0].toLowerCase()){
                case 'init':
                    initGuild(msg);
                    break;
                case mentorCMD:
                    mentor(msg);
                    break;
                case 'rename':
                    rename(msg);
                    break;
                case 'find':
                    findUser(msg);
                    break;
                case 'stales':
                    findStales(msg);
                    break;
                case 'help':
                    let cmds: string[] = [];
                    cmds.push('Commands');
                    cmds.push('```');
                    cmds.push(`!${mentorCMD} <category> <nation> -- create a ${mentorCMD} channel for yourself`);
                    cmds.push(`!rename <category> <nation> -- rename your ${mentorCMD} channel (must be done within your ${mentorCMD} channel)`);
                    cmds.push('!find -- find your channel');
                    if(msg.member?.roles.cache.find(r => r.name == CONFIG.mentor_role) != null){
                        cmds.push(`[${CONFIG.mentor_role} only] !fine <@user> -- find ${mentorCMD} channel(s) for a user`);
                        cmds.push(`[${CONFIG.mentor_role} only] !stales <optional time: 1d> -- limit 50 channels`);
                    }
                    cmds.push('```');
                    msg.channel.send(`${cmds.join('\n')}`);
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