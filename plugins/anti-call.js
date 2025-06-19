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
        return reply(`*🫟 ᴇxᴀᴍᴘʟᴇ:  ${config.PREFIX}anticall on*`);
    }
}); 


cmd({
     on:"body"},async(conn, mek, m, {from, body, isGroup, isOwner, isAdmins, sender, quoted })=>{
try{
conn.ev.on("call", async(json) => {
	  if(config.ANTI_CALL === "true") { 
    	for(const id of json) {
    		if(id.status == "offer") {
    			if(id.isGroup == false) {
    				await conn.rejectCall(id.id, id.from);
				
				if ( mek.key.fromMe) return await conn.sendMessage(id.from, {
    					text: `*Call rejected automatically because owner is busy ⚠️*`, 
							mentions: [id.from]
    				});
	
    			} else {
    				await conn.rejectCall(id.id, id.from);
    			}
    		}
    	}}
    });
} catch (e) {
console.log(e)
reply(e)
}}
)

