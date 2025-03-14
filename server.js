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
    console.log('Discord bot is ready!');
});

discordClient.login(DISCORD_TOKEN).catch(console.error);

// API endpoint to change role
app.post('/change-role', async (req, res) => {
    const { userId, roleId, token } = req.body;

    // Token authentication
    if (token !== API_TOKEN) {
        return res.status(401).json({ error: 'Invalid token' });
    }

    if (!userId || !roleId || typeof roleId !== 'number' || !ROLE_MAPPING[roleId]) {
        return res.status(400).json({ error: 'Invalid userId or roleId' });
    }

    try {
        // Login to Roblox
        await noblox.setCookie(ROBLOX_COOKIE);
        console.log('Logged into Roblox');

        // Get current role
        const currentRank = await noblox.getRankInGroup(GROUP_ID, userId);
        console.log(`Current rank for user ${userId}: ${currentRank}`);

        // Check if new role is higher
        if (roleId > currentRank) {
            // Update Roblox role
            await noblox.setRank(GROUP_ID, userId, roleId);
            console.log(`Updated Roblox rank for user ${userId} to ${roleId}`);

            // Sync with Discord
            const guild = discordClient.guilds.cache.get(DISCORD_GUILD_ID);
            if (!guild) {
                console.warn('Discord guild not found');
                return res.status(500).json({ error: 'Discord guild not found' });
            }

            const discordMember = await guild.members.fetch(userId).catch(() => null);
            if (discordMember) {
                // Remove lower level roles (but keep manual roles like Staff)
                const rolesToRemove = LEVEL_ROLES
                    .filter(r => r < roleId && ROLE_MAPPING[r])
                    .map(r => ROLE_MAPPING[r].discordRoleId);
                await discordMember.roles.remove(rolesToRemove.filter(r => r));
                console.log(`Removed lower roles for ${userId}: ${rolesToRemove}`);

                // Add the new role
                const newRoleId = ROLE_MAPPING[roleId].discordRoleId;
                if (newRoleId) {
                    await discordMember.roles.add(newRoleId);
                    console.log(`Added role ${newRoleId} to ${userId}`);
                }
            } else {
                console.warn(`Discord member ${userId} not found`);
            }
        } else {
            console.log(`Role ${roleId} is not higher than current rank ${currentRank}, no change made`);
        }

        res.json({ success: true, message: 'Role updated or no change needed' });
    } catch (error) {
        console.error('Error updating role:', error);
        res.status(500).json({ error: 'Failed to update role' });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});