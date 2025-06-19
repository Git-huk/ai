const { cmd } = require('../command');
const config = require('../config');

cmd({
    pattern: "anticall",
    alias: ["nocall"],
    desc: "Enable or disable nticall feature",
    category: "settings",
    filename: __filename
},    
async (conn, mek, m, { from, args, isCreator, reply }) => {
    if (!isCreator) return reply("*📛 ᴏɴʟʏ ᴛʜᴇ ᴏᴡɴᴇʀ ᴄᴀɴ ᴜsᴇ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ!*");

    const status = args[0]?.toLowerCase();
    // Default value for ANTI_CALL is "false"
    if (args[0] === "on") {
        config.ANTI_CALL = "true";
        return reply("Anti-call is now enabled.");
    } else if (args[0] === "off") {
        config.ANTI_CALL = "false";
        return reply("Anti-call is now disabled.");
    } else {
        return reply(`*Current settings*:- ${config.ANTI_CALL}\n\n*🫟 ᴇxᴀᴍᴘʟᴇ:  ${config.PREFIX}anticall on*`);
    }
}); 




