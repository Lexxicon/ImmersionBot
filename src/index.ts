require('dotenv').config();
require('source-map-support').install();

import AsciiTable from 'ascii-table';
import AsciiChart from 'asciichart';
import dateFormat from 'dateformat';
import { CategoryChannel, Client, Guild, GuildChannel, Message, MessageManager } from 'discord.js';
import { keys } from 'lodash';
import { getLogger, shutdown } from 'log4js';

const log = getLogger();

log.info(``);
log.info(`-------------- Application Starting ${new Date()} --------------`);
log.info(``);

const STUDENT_ROLE = require('../res/config.json').student_role as string;
const MENTOR_ROLE = require('../res/config.json').mentor_role as string;
const MENTOR_CATEGORY = require('../res/config.json').mentor_category as string;


require('./ValidateEnv.js').validate();


const bot = new Client();
const TOKEN = process.env.TOKEN;

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
    if(str.startsWith('-')) throw `Negative times aren't allowed! ${str}`;
    let seconds = 0;
    const days = str.match(/(\d+)\s*d/);
    const hours = str.match(/(\d+)\s*h/);
    const minutes = str.match(/(\d+)\s*m/);
    const rawSeconds = str.match(/(\d+)\s*s/);
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

process.on('unhandledRejection', (reason: any, p) => {
    log.error(`Unhandled Rejection at: Promise ${p} reason: ${reason} stack: ${reason?.stack}`);
});

async function findCategories(guild:Guild){
    const roleManager = await guild.roles.fetch();
    const categoryRole = roleManager.cache.find(role => role.name == MENTOR_CATEGORY);
    const categories: { [index: string]: CategoryChannel[] } = {};
    guild.channels.cache.forEach(channel => {   
        if(channel.type == "category" && categoryRole?.id && channel.permissionOverwrites.find(overwrite => overwrite.id == categoryRole?.id)){
            const category = channel.name.split(' ')[0].toLowerCase();
            if(!categories[category]){ 
                categories[category] = [];
            }
            categories[category].push(channel as CategoryChannel);
        }
    });
    return categories;
}

async function extendCategory(categoryName: string, msg: Message & {guild: Guild}){
    log.info(`Extending ${categoryName}`);
    const channelRole = await findRole(msg, MENTOR_CATEGORY);
    if(!channelRole){
        return null;
    }
    let counter = 1;
    let position = -1;
    let lastFoundCategory = msg.guild.channels.cache.find(channel => channel.name.toLowerCase() == `${categoryName} ${counter}`);
    if(lastFoundCategory){
        position = lastFoundCategory.position;
        while((lastFoundCategory = msg.guild.channels.cache.find(channel => channel.name.toLowerCase() == `${categoryName} ${counter}`)) != null){
            position = lastFoundCategory.position;
            counter++;
            if(counter > 10){
                return null;
            }
        }
        return await msg.guild.channels.create(`${categoryName} ${counter}`, {
            type: 'category',
            position: position,
            permissionOverwrites: [{
                    id: channelRole.id
                }
            ]
        });
    }
    return null;
}

// async function extendNewCategory

async function findRole(msg: Message & {guild: Guild}, roleName: string){
    const mentorRole = (await msg.guild.roles.fetch()).cache.find(role => role.name == roleName);
    if(!mentorRole){
        await msg.channel.send(`Server has no ${roleName} role!`);
        return;
    }
    return mentorRole;
}

function hasGuild( obj: any ): obj is {guild:Guild} {
    return 'guild' in obj;
}

function hasMessages( obj: any ): obj is {messages: MessageManager}{
    return 'messages' in obj;
}

async function mentor(msg: Message & {guild: Guild}){
    if(msg.member?.roles.cache.find(role => role.name == STUDENT_ROLE)){
        await msg.channel.send(`You are already a ${STUDENT_ROLE}!`);
        await findUser(msg);
        return;
    }
    const mentorRole = await findRole(msg, MENTOR_ROLE);
    if(!mentorRole){
        return;
    }
    const studentRole = await findRole(msg, STUDENT_ROLE);
    if(!studentRole){
        return;
    }

    const parts = msg.content.split(' ');
    if(parts.length < 3){
        await msg.channel.send(`Please format the request in \`!mentor <CATEGORY> <NATION>\``);
        return;
    }
    const categoryName = parts[1].toLowerCase();
    const categories = await findCategories(msg.guild);
    if(!categories[categoryName]){
        await msg.channel.send(`Unrecognized Category! Recognized Categories: ${keys(categories).join(' ')}`);
        return;
    }

    let category:CategoryChannel | null = null;
    for(const channel of categories[categoryName]){
        if(channel.children.size < 5){
            category = channel;
            break;
        }
    }
    if(category == null){
        category = await extendCategory(categoryName, msg);
        if(categoryName == null){
            await msg.channel.send(`Out of room for ${categoryName}! Ask someone to make more!`);
            return;
        }
    }

    const nation = parts.splice(2).join('');
    const mentorChannel = await msg.guild.channels.create(
        `${msg.member?.displayName}-${nation}`,
        {
            type:'text',
            parent: category?.id,
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
    await msg.channel.send(`Created ${mentorChannel.toString()}`);
}

async function initGuild(msg: Message & {guild:Guild}){
    log.info(`initalizing ${msg.guild.name}`);
    const roleManager = await msg.guild.roles.fetch();
    let changed = false;
    if(!roleManager.cache.find(role => role.name == STUDENT_ROLE)){
        const role = await roleManager.create({data: {name: STUDENT_ROLE, mentionable: false, permissions: 0}});
        await msg.channel.send(`Created ${role.toString()} as student role`);
        changed = true;
    }
    if(!roleManager.cache.find(role => role.name == MENTOR_ROLE)){
        const mentorRole = await roleManager.create({data: {name: MENTOR_ROLE, mentionable: false, permissions: 0}});
        await msg.channel.send(`Created ${mentorRole.toString()} as mentor role`);
        changed = true;
        await msg.guild.me?.roles.add(mentorRole);
    }
    let categoryRole = roleManager.cache.find(role => role.name == MENTOR_CATEGORY);
    if(!categoryRole){
        categoryRole = await roleManager.create({data: {name: MENTOR_CATEGORY, mentionable: false, permissions: 0}});
        await msg.channel.send(`Created ${categoryRole.toString()} as mentory channel role`);
        changed = true;
    }
    if(changed){
        log.info(`initalized ${msg.guild.name}`);
        await msg.channel.send(`Initalized ${msg.guild.name}`);
    }
}

async function findStales(msg:Message&{guild:Guild}){
    const role = await findRole(msg, MENTOR_ROLE);
    if(!role){
        return;
    }

    if(msg.member?.roles.cache.find(r => r.id == role?.id) == null){
        await msg.channel.send(`Only mentors can use this`);
        return ;
    }
    
    let lastTalkThreashold: Date | null = null;

    if(msg.content.split(' ').length > 1){
        const rawTime = msg.content.split(' ').slice(1).join(' ');
        const ms = getSeconds(rawTime) * 1000;
        lastTalkThreashold = new Date();
        lastTalkThreashold.setTime(lastTalkThreashold.getTime() - ms);
    }

    log.info(`${lastTalkThreashold}`);

    const onlyMentors: string[] = [];
    const idle: string[] = [];

    const categories = await findCategories(msg.guild);
    for(const parentCategory in categories){
        const subcategorys = categories[parentCategory];
        for(const subcategory of subcategorys){
            const channels: GuildChannel[] & {messages:MessageManager}[] = [];
            subcategory.children.each(channel => {
                let foundOnlyMentors = true;
                channel.members.each(member => {
                    if(member.user.id == bot.user?.id) return;
                    if(member.roles.cache.find(r => r.id == role?.id) == null){
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
                for(const channel of channels){
                    try{
                        const messages = await channel.messages.fetch({limit: 1});
                        const m = messages.random();
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
    const mentionedUser = msg.mentions.users.random();
    if(mentionedUser && msg.member?.roles.cache.find(role => role.name == MENTOR_ROLE)){
        userID = mentionedUser.id;
    }

    const categories = await findCategories(msg.guild);
    const found: string[] = [];
    for(const parentCategory in categories){
        const subcategorys = categories[parentCategory];
        for(const subcategory of subcategorys){
            const channels: GuildChannel[] & {messages:MessageManager}[] = [];
            subcategory.children.filter(channel => channel.permissionOverwrites.find((perm, key) => key == userID) != null).each(c => channels.push(c));
            for(const c of channels){
                found.push(c.toString());
            }
        }
    }
    await msg.channel.send(`Found: ${found.join(' ')}`);
}

async function rename(msg:Message&{guild:Guild}){
    const parts = msg.content.split(' ');
    if(parts.length < 3){
        await msg.channel.send(`Please format the request in \`!mentor <ERA> <NATION>\``);
        return;
    }

    const mentorRole = await findRole(msg, MENTOR_ROLE);
    if(!mentorRole) {
        return;
    }

    const channel = msg.channel as GuildChannel;
    const categories = await findCategories(msg.guild);
    let isInCategory = false;
    for(const group in categories){
        for(const category of categories[group]){
            if(channel.parentID == category.id){
                isInCategory = true;
            }
        }
    }
    if(!isInCategory){
        log.debug(`Requested to rename channel not in category: ${channel.name}`);
        return;
    }
    const targetChannel = msg.channel as GuildChannel;
    if(channel.permissionOverwrites.find((perm, key) => key == msg.author.id) == null){
        log.debug(`Non owner requested rename of un authorized channel. ${msg.member?.displayName}, ${targetChannel.name}`);
        return;
    }

    const categoryName = parts[1].toLowerCase();
    if(!categories[categoryName]){
        await msg.channel.send(`Unrecognized era! Recognized Eras: ${keys(categories).join(' ')}`);
        return;
    }
    let category:CategoryChannel | null = null;
    for(const channel of categories[categoryName]){
        if(channel.children.size < 50){
            category = channel;
            break;
        }
    }
    if(category == null){
        category = await extendCategory(categoryName, msg);
    }
    if(category == null){
        await msg.channel.send(`Out of room for ${categoryName}! Ask some one to make more!`);
        return;
    }
    const nation = parts.splice(2).join('');

    await targetChannel.edit({
        parentID: category.id,
        name: `${msg.member?.displayName}-${nation}`
    });

    await msg.channel.send(`Renamed to ${targetChannel.toString()}`);
}


async function DRN(msg: Message&{guild:Guild}){
    const role = await findRole(msg, MENTOR_ROLE);
    if(!role){
        return;
    }
    const isMentor = msg.member?.roles.cache.find(r => r.id == role.id) != null;
    const targetChannel = msg.channel as GuildChannel;
    if(!isMentor && targetChannel.permissionOverwrites.find((perm, key) => key == msg.author.id) == null){
        log.info(`Insufficient permissions to use DRN here`);
        return;
    }

    const DRN_REGEX = /(?<ATK>\d+)\s*vs?\s*(?<DEF>\d+)/;
    const match = DRN_REGEX.exec(msg.content);

    function drn(depth: number){
        if(depth > 20) return 10000;
        const roll = Math.ceil(Math.random() * 6);
        if(roll == 6){
            return 5 + drn(depth++);
        }
        return roll;
    }

    if(match && match?.groups){
        const atk = Number(match.groups['ATK']);
        const def = Number(match.groups['DEF']);
        const result = {wins: 0, losses: 0, values: [] as number[]};
        let count = 0;
        let sum = 0;
        while(count++ < 1000){
            const atkDrn = drn(0) + drn(0) + atk;
            const defDrn = drn(0) + drn(0) + def;
            const roll = atkDrn - defDrn;
            sum += roll;
            result.values.push(roll);
            if(roll > 0){
                result.wins++;
            }else{
                result.losses++;
            }
        }
        result.values = result.values.sort((a, b) => a - b);
        const rolls = result.wins + result.losses;
        
        const zero: number[] = [];
        const breakdown: number[] = [];
        const granularity = 30;
        for(let i = 0; i < granularity; i++){
            zero[i] = 0;
            let index = Math.floor((i/granularity) * result.values.length);
            //exclude the lowest and highest rolls
            index = Math.max(10, Math.min(result.values.length - 10, index));
            breakdown[i] = result.values[index];
        }
        
        const table = new AsciiTable(`${atk} vs ${def}`);
        table.addRow('Rolls', rolls);
        table.addRow('Wins', result.wins);
        table.addRow('Losses', result.losses);
        table.addRow('Avg', (sum/count).toFixed(2));
        table.addRow('Win %', ((result.wins/rolls)*100).toFixed(2));

        const tableStr = table.toString().split('\n') as string[];
        const graph = AsciiChart.plot([zero, breakdown], {height: tableStr.length}).split('\n') as string[];
        const output: string[] = [];
        output.push('```');
        for(let i = 0; i < tableStr.length; i++){
            output.push(`${tableStr[i]} ${graph[i]}`);
        }
        output.push('```');
        await msg.channel.send(`${output.join('\n')}`);
    }else{
       await  msg.channel.send(`Unrecognized input`);
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
        const command = msg.content.substr(1);
        if(hasGuild(msg)){
            const mentorCMD = `${MENTOR_ROLE}`.toLowerCase();
            log.info(`processing ${command} from ${msg.member?.displayName}`);
            switch(command.split(' ')[0].toLowerCase()){
                case 'init':
                    await initGuild(msg);
                    break;
                case mentorCMD:
                    await mentor(msg);
                    break;
                case 'rename':
                    await rename(msg);
                    break;
                case 'find':
                    await findUser(msg);
                    break;
                case 'stales':
                    await findStales(msg);
                    break;
                case 'drn':
                    await DRN(msg);
                    break;
                case 'help':{
                    const cmds: string[] = [];
                    cmds.push('Commands');
                    cmds.push('```');
                    cmds.push(`!${mentorCMD} <category> <nation> -- create a ${mentorCMD} channel for yourself`);
                    cmds.push(`!rename <category> <nation> -- rename your ${mentorCMD} channel (must be done within your ${mentorCMD} channel)`);
                    cmds.push(`!drn <number> vs <number> -- generate stats for an opposed 2drn vs 2drn check (only works in your ${mentorCMD} channel)`);
                    cmds.push('!find -- find your channel');
                    if(msg.member?.roles.cache.find(r => r.name == MENTOR_ROLE) != null){
                        cmds.push(`[${MENTOR_ROLE} only] !fine <@user> -- find ${mentorCMD} channel(s) for a user`);
                        cmds.push(`[${MENTOR_ROLE} only] !stales <optional time: 1d> -- limit 50 channels`);
                    }
                    cmds.push('```');
                    await msg.channel.send(`${cmds.join('\n')}`);
                }
            }
        }
    }catch(err){
        log.error(err);
    }
});

bot.login(TOKEN).catch(err => {
    log.error(`Failed to log in ${err}`);
    throw err;
});