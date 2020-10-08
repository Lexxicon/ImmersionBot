import { Guild, GuildMember, Message, NewsChannel, TextChannel } from "discord.js";

type Era = 'EARLY'|'MIDDLE'|'LATE';
type StoryEventLevel = 'NONE'|'SOME'|'ALL';
type EventRarity = 'COMMON'|'RARE';
type MapOptions = 'SMALL'|'MEDIUM'|'LARGE';
type SlotOptions = 'DIFFICULT' | 'MIGHTY' | 'MASTER' | 'IMPOSSIBLE' | 'BANNED';

type GuildMessage = Message & {channel: TextChannel | NewsChannel; member: GuildMember; guild: Guild};
