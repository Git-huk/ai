const { cmd } = require('../command');
const config = require('../config');
const axios = require("axios");


let bioInterval;
const defaultBio = "⚡ XBOT MD | Online 🕒 {time}";
const timeZone = 'Africa/Lagos';

cmd({
    pattern: "autobio",
    alias: ["autoabout"],
    desc: "Toggle automatic bio updates",
    category: "misc",
    filename: __filename,
    usage: `${config.PREFIX}autobio [on/off]`
}, async (conn, mek, m, { args, reply, isOwner }) => {
    if (!isOwner) return reply("❌ Only the bot owner can use this command");
    
    const [action, ...bioParts] = args;
    const customBio = args;

    try {
        if (action === 'on') {
            if (config.AUTO_BIO === "true") {
                return reply("ℹ️ Auto-bio is already enabled");
            }

            // Update config
            config.AUTO_BIO = "true";
            if (customBio) {
                // Store custom bio in memory only (not in env)
                config.AUTO_BIO_TEXT = customBio;
            } else {
                config.AUTO_BIO_TEXT = defaultBio;
            }
const response = await axios.get("http://api.forismatic.com/api/1.0/", {
      params: {
        method: "getQuote",
        format: "json",
        lang: "en",
      },
    });
const { quoteText } = response.data;
            // Start updating bio
            startAutoBio(conn, quoteText);
            return reply(`✅ Auto-bio enabled\nCurrent text: "${quoteText}"`);

        } else if (action === 'off') {
            if (config.AUTO_BIO !== "true") {
                return reply("ℹ️ Auto-bio is already disabled");
            }
            
            // Update config
            config.AUTO_BIO = "false";
            
            // Stop updating bio
            stopAutoBio();
            return reply("✅ Auto-bio disabled");

        } else {
            return reply(`Usage:\n` +
                `${config.PREFIX}autobio on @quote - Enable with random quotes\n` +
                `${config.PREFIX}autobio off - Disable auto-bio\n\n` +
                `Available placeholders:\n` +
                `{time} - Current time\n` +
                `Current status: ${config.AUTO_BIO === "true" ? 'ON' : 'OFF'}\n` +
                `Current text: "${config.AUTO_BIO_TEXT || defaultBio}"`);
        }
    } catch (error) {
        console.error('Auto-bio error:', error);
        return reply("❌ Failed to update auto-bio settings");
    }
});

// Start auto-bio updates
function startAutoBio(conn, bioText) {
    stopAutoBio(); // Clear any existing interval
    
    bioInterval = setInterval(async () => {
        try {
            const now = new Date();
            const timeString = now.toLocaleTimeString('en-US', { timeZone });
            const formattedBio = bioText.replace('{time}', timeString);
            await conn.updateProfileStatus(formattedBio);
        } catch (error) {
            console.error('Bio update error:', error);
            stopAutoBio();
        }
    }, 5 * 60 * 1000);
}

// Stop auto-bio updates
function stopAutoBio() {
    if (bioInterval) {
        clearInterval(bioInterval);
        bioInterval = null;
    }
}

// Initialize auto-bio if enabled in config
module.exports.init = (conn) => {
    if (config.AUTO_BIO === "true") {
        const bioText = config.AUTO_BIO_TEXT || defaultBio;
        startAutoBio(conn, bioText);
    }
};
