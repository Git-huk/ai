const { cmd } = require('../command');
const config = require('../config');


cmd({
    pattern: "anticall",
    alias: ["callblock"],
    desc: "Configure call rejection settings",
    category: "autos",
    filename: __filename,
    react: "📵"
}, async (m, conn, { args, isOwner, reply }) => {
    if (!isOwner) return reply("*Command reserved for owner*!");

    const action = args[0]?.toLowerCase();
    const validModes = ["off", "true", "block"];
    
    if (validModes.includes(action)) {
        config.ANTICALL = action;
        reply(`AntiCall Mode: ${action.toUpperCase()}\n${action === "block" ? "⚠️ Callers will be BLOCKED" : ""}`);
    } else if (args[0] === "msg") {
        config.ANTICALL_MSG = args.slice(1).join(" ");
        reply(`New rejection message set:\n${config.ANTICALL_MSG}`);
    } else {
        reply(`📵 *AntiCall Settings*\n
Current Mode: ${config.ANTICALL.toUpperCase()}
Message: ${config.ANTICALL_MSG}

Usage:
→ ${config.PREFIX}anticall true (reject calls)
→ ${config.PREFIX}anticall block (reject+block)
→ ${config.PREFIX}anticall off (disable)
→ ${config.PREFIX}anticall msg [message]`);
    }
});
cmd({
     on:"body"},async(conn, mek, m, {from, body, isCmd,isGroup,isOwner,isAdmins,groupAdmins,isBotAdmins,sender,groupName,quoted})=>{
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

