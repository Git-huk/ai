const axios = require('axios');
const { cmd, commands } = require('../command');
const config = require("../config");
const { setConfig, getConfig } = require("../lib/configdb");
const { prefix } = config.PREFIX;

// Default AI states
let AI_STATE = {
    IB: "false", // Inbox chats
    GC: "false"  // Group chats
};

cmd({
    pattern: "chatbot",
    alias: ["xylo"],
    desc: "Enable or disable AI chatbot responses",
    category: "ai",
    filename: __filename,
    react: "✅"
}, async (conn, mek, m, { from, args, isOwner, reply, prefix }) => {
    if (!isOwner) return reply("Command reserved for owner only*");

    const mode = args[0]?.toLowerCase();
    const target = args[1]?.toLowerCase();

    if (mode === "on") {
        if (!target || target === "all") {
            AI_STATE.IB = "true";
            AI_STATE.GC = "true";
            await setConfig("AI_STATE", JSON.stringify(AI_STATE));
            return reply("*Xylo is now enabled for both inbox and group chats*");
        } else if (target === "pm") {
            AI_STATE.IB = "true";
            await setConfig("AI_STATE", JSON.stringify(AI_STATE));
            return reply("*Xylo is now enabled for inbox chats*");
        } else if (target === "gc") {
            AI_STATE.GC = "true";
            await setConfig("AI_STATE", JSON.stringify(AI_STATE));
            return reply("*Xylo is now enabled for group chats*");
        }
    } else if (mode === "off") {
        if (!target || target === "all") {
            AI_STATE.IB = "false";
            AI_STATE.GC = "false";
            await setConfig("AI_STATE", JSON.stringify(AI_STATE));
            return reply("*Xylo is now disabled for both inbox and group chats*");
        } else if (target === "pm") {
            AI_STATE.IB = "false";
            await setConfig("AI_STATE", JSON.stringify(AI_STATE));
            return reply("*Xylo is now disabled for inbox chats*");
        } else if (target === "gc") {
            AI_STATE.GC = "false";
            await setConfig("AI_STATE", JSON.stringify(AI_STATE));
            return reply("*Xylo is now disabled for group chats*");
        }
    } else {
        return reply(`*Ai command assist*
            
> ${prefix}chatbot on all - Enable AI in all chats
> ${prefix}chatbot on pm - Enable AI in inbox only
> ${prefix}chatbot on gc - Enable AI in groups only
*Disable Settings ❌*
> ${prefix}chatbot off all - Disable AI in all chats
> ${prefix}chatbot off pm - Disable AI in inbox only
> ${prefix}chatbot off gc - Disable AI in groups only`);
    }
});

// Initialize AI state on startup
(async () => {
    const savedState = await getConfig("AI_STATE");
    if (savedState) AI_STATE = JSON.parse(savedState);
})();

// AI Chatbot by DavidX
cmd({
    on: "body"
}, async (conn, m, store, {
    from,
    body,
    sender,
    isGroup,
    isBotAdmins,
    isAdmins,
    reply,
    quotedMsg
}) => {
    try {
        // Check if message is a reply
        if (!m?.message?.extendedTextMessage?.contextInfo?.participant) {
            return; // Not a reply, ignore
        }
        
        // Check if the reply is to the bot's message
        const repliedTo = m.message.extendedTextMessage.contextInfo.participant;
        const botJid = conn.user.id.split(':')[0] + '@s.whatsapp.net';
        if (repliedTo !== botJid) {
            return; // Not replying to the bot, ignore
        }

        // Check if AI is enabled for this chat type
        const isInbox = !isGroup;
        if ((isInbox && AI_STATE.IB !== "true") || (isGroup && AI_STATE.GC !== "true")) {
            return;
        }

        // Optional: Prevent bot responding to its own messages or commands
        if (!body || m.key.fromMe || body.startsWith(config.PREFIX)) return;

        // Handle time/date questions directly
        const lowerBody = body.toLowerCase();
        if (lowerBody.includes('time') || lowerBody.includes('date')) {
            const now = new Date();
            const options = { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZone: 'Africa/Lagos',
                timeZoneName: 'short'
            };
            const currentDateTime = now.toLocaleDateString('en-US', options);
            return reply(`Current Date & Time in Nigeria:\n${currentDateTime}`);
        }

        // Encode message for the query
        const query = encodeURIComponent(body);
        const prompt = encodeURIComponent("You are Xylo, a friendly and helpful assistant made by DavidX, About DavidX, he's a tech genius from Nigeria who's age is personal and real name  David promise, more info to get at https://github.com/Mek-d1/X-BOT-MD. You provide concise, accurate, and helpful responses while maintaining a conversational tone. You do not refuse to answer questions unless they involve illegal activities, harm, or explicit content. When responding in a WhatsApp chat context, keep your answers relatively concise but complete.");

        // BK9 API Request
        const apiUrl = `https://bk9.fun/ai/BK93?BK9=${prompt}&q=${query}`;

        const { data } = await axios.get(apiUrl);

        if (data && data.status && data.BK9) {
            await conn.sendMessage(from, {
                text: data.BK9
            }, { quoted: m });
        } else {
            reply("Failed to generate a response from Ai");
        }

    } catch (err) {
        console.error("AI Chatbot Error:", err.message);
        reply("An error occurred while contacting the AI.");
    }
});
