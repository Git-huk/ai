const { cmd } = require('../command');
const config = require('../config');
const axios = require("axios");

let bioInterval;
const defaultTimeBio = "⚡ XBOT MD | Online 🕒 {time}";
const defaultQuoteBio = "📝 Quote of the Day: {quote}";
const timeZone = 'Africa/Lagos';

cmd({
    pattern: "autobio",
    alias: ["autoabout"],
    desc: "Toggle automatic bio updates",
    category: "misc",
    filename: __filename
}, async (conn, mek, m, { args, reply, isOwner }) => {
    if (!isOwner) return reply("❌ Only the bot owner can use this command");

    const action = args[0]?.toLowerCase();

    try {
        if (action === 'on') {
            return reply(
                `💡 *Choose Auto Bio Mode:*\n\n` +
                `*Reply with:*\n` +
                `1️⃣ → Time-based bio (updates every minute)\n` +
                `2️⃣ → Quote of the Day (updates daily)`
            );
        } else if (action === 'off') {
            config.AUTO_BIO = "false";
            stopAutoBio();
            return reply("✅ Auto-bio disabled");
        } else if (['1', '2'].includes(action)) {
            config.AUTO_BIO = "true";

            if (action === '1') {
                config.AUTO_BIO_TEXT = defaultTimeBio;
                startAutoBio(conn, defaultTimeBio);
                return reply("✅ Time-based Auto-bio enabled and updating every minute.");
            } else {
                const quote = await fetchQuote();
                const quoteBio = defaultQuoteBio.replace('{quote}', quote);
                config.AUTO_BIO_TEXT = defaultQuoteBio;
                startAutoBio(conn, quoteBio, true); // true means quote mode
                return reply("✅ Quote of the Day enabled and updating daily.");
            }
        } else {
            return reply(`Usage:
${config.PREFIX}autobio on - Show mode options
${config.PREFIX}autobio 1 - Enable Time-based bio
${config.PREFIX}autobio 2 - Enable Quote bio
${config.PREFIX}autobio off - Disable auto-bio`);
        }
    } catch (error) {
        console.error('Auto-bio error:', error);
        return reply("❌ Failed to update auto-bio settings");
    }
});

function startAutoBio(conn, initialText, isQuote = false) {
    stopAutoBio();
    bioInterval = setInterval(async () => {
        try {
            const now = new Date();
            let bio = config.AUTO_BIO_TEXT;

            if (bio.includes('{time}')) {
                const timeString = now.toLocaleTimeString('en-US', { timeZone });
                bio = bio.replace('{time}', timeString);
            } else if (isQuote && bio.includes('{quote}')) {
                const quote = await fetchQuote();
                bio = bio.replace('{quote}', quote);
            }

            await conn.updateProfileStatus(bio);
        } catch (err) {
            console.error("Bio update error:", err);
            stopAutoBio();
        }
    }, isQuote ? 24 * 60 * 60 * 1000 : 60 * 1000); // daily or every minute
}

function stopAutoBio() {
    if (bioInterval) {
        clearInterval(bioInterval);
        bioInterval = null;
    }
}

async function fetchQuote() {
    try {
        const res = await axios.get("http://api.forismatic.com/api/1.0/", {
            params: {
                method: "getQuote",
                format: "json",
                lang: "en"
            }
        });
        return res.data?.quoteText || "Stay positive!";
    } catch {
        return "Keep pushing forward!";
    }
}

// Optional init on boot
module.exports.init = (conn) => {
    if (config.AUTO_BIO === "true" && config.AUTO_BIO_TEXT) {
        const isQuote = config.AUTO_BIO_TEXT.includes('{quote}');
        startAutoBio(conn, config.AUTO_BIO_TEXT, isQuote);
    }
};
