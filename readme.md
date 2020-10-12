# Immersion Bot
##
## Basic overview of functionality
#
### Roles
- Student
    - A user without this role may request a mentor channel via the `!mentor` command
    - Name is overriden by the `STUDENT_ROLE` environment variable
- Mentor
    - Gives elevated access to 
        - All mentor channels
        - Commands
    - Name is overriden by the `MENTOR_ROLE` environment variable
- Teaching Channels
    - Indicates that the text category should be eligible for teaching channels
    - Name is overriden by the `MENTOR_CATEGORY` environment variable

By default, commands must be prefixed with `!`, but this can be configured by setting the `COMMAND_PREFIX` environment variable
#
### Commands
- help
    - Basically lists this, but only shows command variants the user has access to
    - Where
        - Anywhere
    - Who
        - Anyone
- init
    - Checks that the bot has the needed permissions and reports any missing permissions
    - Creates the needed Roles if they don't exist and reports created roles
- rename
    - Arguments
        - Era: Target category to change to
        - New Nation: Target name to change to
    - Where
        - Any teaching channel. Defined as: 'Any channel with a parent category which has the `MENTOR_CATEGORY` role'
    - Who
        - A student of the channel. Defined as 'Any user who has explicit permission overrides for the channel'
- find
    - Arguments
        - User Mention: Optional
    - Where
        - Anywhere
    - Who
        - Any user may use this command with no argument, in which case, they are the 'specific user'
        - Mentors may specify a user to look up a 'specific user'
    - Locates channels which are children of categories with the `MENTOR_CATEGORY` role and which the 'specific user' has user level overwrites.
    - Limited to 50 channels
- stales
    - Arguments
        - Duration: Optional
            - Examples: 
                - 5m = 5 minutes
                - 1h = 1 hour
                - 3d = 3 days
                - 3d 1 h 5m = 3 days, 1 hour, and 5 minutes
            - Day is short hand for 24 hours and does not account for things such as day light savings
    - Where
        - Anywhere
    - Who
        - Mentors
    - Locates teaching channels which have no students, if specified will also look for teaching channels which haven't had a message within the last 'Duration'
        - Teaching channels are defined as channels with a parent category that has a `MENTOR_CATEGORY` role
        - Channels with no students are defined as channels which have only users with the `MENTOR` role
- drn
    - Arguments
        - Attack base
        - 'vs' or 'v'
        - Defender base
    - Where
        - Teaching channel
            - Channel owner
        - Anywhere
            - Mentor
    - Who
        - Students and Mentors
    - Rolls 2drn + atk vs 2drn + def
        - Does this 1000 times
        - Reports stats on the outcome
        - A 'win' is the attacker's result exceeding the defenders result
- mentor
    - The name of this command can be the name may be overriden with the `MENTOR_CATEGORY` environment variable
#
### Setup

1. Install nodeJS 12.0+
2. Clone repo
3. run `npm install`
5. create a `.env` file in the root
4. generate a Discord API token
    1. https://discord.com/developers/applications
    2. New Application
    3. Bot
    4. Copy Token
6. create a `TOKEN=<API secret>` entry in the `.env` file
7. Invite the bot to your server
    1. From the page where you generated the bot token
    2. OAuth2
    3. Select 'bot' from the SCOPES section
    4. The bot will need the following permissions [268504272]
        - View Audit Log
        - Manage Roles
        - Manage Channels
        - View Channels
        - Send Messages
        - Read Message History
        - Add Reactions
    - It's unlikely that the bot actually needs all of these, but it's a good starting place.
    - If the bot is invited with missing permissions it'll complain about it
7. run `npm start`
8. In your Discord server, say '!init' in a server chat