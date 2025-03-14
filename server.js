require('dotenv').config();
const express = require('express');
const noblox = require('noblox.js');
const { Client } = require('discord.js');
const app = express();
app.use(express.json());

// Configuration (store these securely, e.g., in environment variables)
const API_TOKEN = process.env.API_TOKEN || 'your-secret-token'; // Replace with env variable
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE; // Roblox .ROBLOSECURITY cookie
const GROUP_ID = process.env.GROUP_ID; // Your Roblox group ID
const DISCORD_TOKEN = process.env.DISCORD_TOKEN; // Discord bot token
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID; // Your Discord server ID

// Role mapping dictionary
const ROLE_MAPPING = {
    1: { robloxRank: 1, discordRoleId: '1345027588636016870', name: 'NEWBIE' },
    2: { robloxRank: 2, discordRoleId: '1345027683347730512', name: 'ROOKIE' },
    3: { robloxRank: 3, discordRoleId: '1345027744857194538', name: 'TRAINEE' },
    4: { robloxRank: 4, discordRoleId: '1345027803153694721', name: 'ADEPT' },
    5: { robloxRank: 5, discordRoleId: '1345027885122977862', name: 'SKILLED' },
    6: { robloxRank: 6, discordRoleId: '1345027945072427089', name: 'PRO' },
    7: { robloxRank: 7, discordRoleId: '1345028011606540299', name: 'EXPERT' },
    8: { robloxRank: 8, discordRoleId: '1345028065771913276', name: 'CHAMPION' },
    9: { robloxRank: 9, discordRoleId: '1345028120402727015', name: 'LEGEND' },
    10: { robloxRank: 10, discordRoleId: '1345028196323819530', name: 'MYTHIC' },
    11: { robloxRank: 11, discordRoleId: '1345028259972251708', name: 'GODLIKE' },
    12: { robloxRank: 12, discordRoleId: '1345026491389448262', name: 'VIP' }
};

// Level-based roles to remove (roles that get replaced by higher ones)
const LEVEL_ROLES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

// Discord bot setup
const discordClient = new Client({ intents: ['Guilds', 'GuildMembers'] });

discordClient.once('ready', () => {
    console.log(`[INFO] Discord bot logged in as ${discordClient.user.tag}`);
    console.log(`[INFO] Connected to guild: ${DISCORD_GUILD_ID}`);
});

discordClient.login(DISCORD_TOKEN).catch(error => {
    console.error('[ERROR] Failed to login to Discord:', error.message);
    process.exit(1); // Exit process if Discord login fails
});

// Default GET route with simple HTML
app.get('/', (req, res) => {
    console.log(`[INFO] GET request received at / from ${req.ip}`);
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Obby Dash Bot API</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background-color: #f0f0f0; }
                h1 { color: #333; }
                p { color: #666; }
            </style>
        </head>
        <body>
            <h1>Obby Dash Bot API</h1>
            <p>The server is running! Use POST /change-role to update roles.</p>
            <p>Server Time: ${new Date().toISOString()}</p>
        </body>
        </html>
    `);
});

// API endpoint to change role
app.post('/change-role', async (req, res) => {
    const { userId, roleId, token } = req.body;

    console.log(`[INFO] POST /change-role received - userId: ${userId}, roleId: ${roleId}`);

    // Token authentication
    if (token !== API_TOKEN) {
        console.warn(`[WARN] Invalid token provided from ${req.ip}`);
        return res.status(401).json({ error: 'Invalid token' });
    }

    if (!userId || !roleId || typeof roleId !== 'number' || !ROLE_MAPPING[roleId]) {
        console.warn(`[WARN] Invalid userId (${userId}) or roleId (${roleId})`);
        return res.status(400).json({ error: 'Invalid userId or roleId' });
    }

    try {
        // Login to Roblox
        console.log('[INFO] Logging into Roblox with bot account');
        await noblox.setCookie(ROBLOX_COOKIE);
        console.log('[INFO] Successfully logged into Roblox');

        // Get current role
        const currentRank = await noblox.getRankInGroup(GROUP_ID, userId);
        console.log(`[INFO] Current rank for user ${userId}: ${currentRank} (${ROLE_MAPPING[currentRank]?.name || 'Unknown'})`);

        // Check if new role is higher
        if (roleId > currentRank) {
            // Update Roblox role
            console.log(`[INFO] Updating Roblox rank for user ${userId} to ${roleId} (${ROLE_MAPPING[roleId].name})`);
            await noblox.setRank(GROUP_ID, userId, roleId);
            console.log(`[SUCCESS] Updated Roblox rank for user ${userId} to ${roleId}`);

            // Sync with Discord
            const guild = discordClient.guilds.cache.get(DISCORD_GUILD_ID);
            if (!guild) {
                console.warn('[WARN] Discord guild not found');
                return res.status(500).json({ error: 'Discord guild not found' });
            }

            console.log(`[INFO] Fetching Discord member for user ${userId}`);
            const discordMember = await guild.members.fetch(userId).catch(() => null);
            if (discordMember) {
                // Remove lower level roles (but keep manual roles like Staff)
                const rolesToRemove = LEVEL_ROLES
                    .filter(r => r < roleId && ROLE_MAPPING[r])
                    .map(r => ROLE_MAPPING[r].discordRoleId);
                console.log(`[INFO] Removing lower roles for ${userId}: ${rolesToRemove.join(', ')}`);
                await discordMember.roles.remove(rolesToRemove.filter(r => r));
                console.log(`[SUCCESS] Removed lower roles for ${userId}`);

                // Add the new role
                const newRoleId = ROLE_MAPPING[roleId].discordRoleId;
                if (newRoleId) {
                    console.log(`[INFO] Adding role ${newRoleId} (${ROLE_MAPPING[roleId].name}) to ${userId}`);
                    await discordMember.roles.add(newRoleId);
                    console.log(`[SUCCESS] Added role ${newRoleId} to ${userId}`);
                }
            } else {
                console.warn(`[WARN] Discord member ${userId} not found in guild ${DISCORD_GUILD_ID}`);
            }
        } else {
            console.log(`[INFO] Role ${roleId} (${ROLE_MAPPING[roleId].name}) is not higher than current rank ${currentRank}, no change made`);
        }

        res.json({ success: true, message: 'Role updated or no change needed' });
    } catch (error) {
        console.error('[ERROR] Error updating role:', error.message);
        console.error('[ERROR] Stack trace:', error.stack);
        res.status(500).json({ error: 'Failed to update role', details: error.message });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[INFO] Server running on port ${PORT}`);
    console.log(`[INFO] Access the test page at http://localhost:${PORT}/`);
});