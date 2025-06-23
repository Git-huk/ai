const { proto, downloadContentFromMessage, getContentType } = require('baileys')
const fs = require('fs')

const downloadMediaMessage = async(m, filename) => {
    if (m.type === 'viewOnceMessage') {
        m.type = m.msg?.type
    }
    if (m.type === 'imageMessage') {
        const nameJpg = filename ? filename + '.jpg' : 'undefined.jpg'
        const stream = await downloadContentFromMessage(m.msg, 'image')
        let buffer = Buffer.from([])
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk])
        fs.writeFileSync(nameJpg, buffer)
        return fs.readFileSync(nameJpg)
    } else if (m.type === 'videoMessage') {
        const nameMp4 = filename ? filename + '.mp4' : 'undefined.mp4'
        const stream = await downloadContentFromMessage(m.msg, 'video')
        let buffer = Buffer.from([])
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk])
        fs.writeFileSync(nameMp4, buffer)
        return fs.readFileSync(nameMp4)
    } else if (m.type === 'audioMessage') {
        const nameMp3 = filename ? filename + '.mp3' : 'undefined.mp3'
        const stream = await downloadContentFromMessage(m.msg, 'audio')
        let buffer = Buffer.from([])
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk])
        fs.writeFileSync(nameMp3, buffer)
        return fs.readFileSync(nameMp3)
    } else if (m.type === 'stickerMessage') {
        const nameWebp = filename ? filename + '.webp' : 'undefined.webp'
        const stream = await downloadContentFromMessage(m.msg, 'sticker')
        let buffer = Buffer.from([])
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk])
        fs.writeFileSync(nameWebp, buffer)
        return fs.readFileSync(nameWebp)
    } else if (m.type === 'documentMessage') {
        const ext = m.msg?.fileName?.split('.')?.pop()?.toLowerCase()
            .replace('jpeg', 'jpg')
            .replace('png', 'jpg')
            .replace('m4a', 'mp3') || 'bin'
        const nameDoc = filename ? filename + '.' + ext : 'undefined.' + ext
        const stream = await downloadContentFromMessage(m.msg, 'document')
        let buffer = Buffer.from([])
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk])
        fs.writeFileSync(nameDoc, buffer)
        return fs.readFileSync(nameDoc)
    }
}

const sms = (conn, m, store) => {
    if (!m) return m
    const M = proto.WebMessageInfo
    if (m.key) {
        m.id = m.key.id
        m.isBot = m.id?.startsWith('BAES') && m.id.length === 16
        m.isBaileys = m.id?.startsWith('BAE5') && m.id.length === 16
        m.chat = m.key.remoteJid
        m.fromMe = m.key.fromMe
        m.isGroup = m.chat.endsWith('@g.us')
        m.sender = m.fromMe ? conn.user?.id.split(':')[0] + '@s.whatsapp.net' : m.isGroup ? m.key.participant : m.key.remoteJid
    }

    if (m.message) {
        m.mtype = getContentType(m.message)
        m.msg = (m.mtype === 'viewOnceMessage')
            ? m.message[m.mtype]?.message?.[getContentType(m.message[m.mtype]?.message)]
            : m.message[m.mtype]

        try {
            m.body = m.message.conversation
                || m.message?.imageMessage?.caption
                || m.message?.videoMessage?.caption
                || m.message?.extendedTextMessage?.text
                || m.message?.buttonsResponseMessage?.selectedButtonId
                || m.message?.listResponseMessage?.singleSelectReply?.selectedRowId
                || m.message?.templateButtonReplyMessage?.selectedId
                || m.message?.buttonsResponseMessage?.selectedButtonId
                || ''
        } catch (err) {
            m.body = ''
        }

        const contextInfo = m.msg?.contextInfo
        const quoted = m.quoted = contextInfo?.quotedMessage || null
        m.mentionedJid = contextInfo?.mentionedJid || []

        if (quoted) {
            let type = getContentType(quoted)
            m.quoted = quoted[type] || quoted

            if (['productMessage'].includes(type)) {
                type = getContentType(m.quoted)
                m.quoted = m.quoted[type]
            }

            if (typeof m.quoted === 'string') m.quoted = { text: m.quoted }

            if (quoted.viewOnceMessageV2) {
                // handle if needed
            } else {
                m.quoted.mtype = type
                m.quoted.id = contextInfo?.stanzaId
                m.quoted.chat = contextInfo?.remoteJid || m.chat
                m.quoted.isBot = m.quoted.id?.startsWith('BAES') && m.quoted.id.length === 16
                m.quoted.isBaileys = m.quoted.id?.startsWith('BAE5') && m.quoted.id.length === 16
                m.quoted.sender = conn.decodeJid(contextInfo?.participant)
                m.quoted.fromMe = m.quoted.sender === (conn.user?.id)
                m.quoted.text = m.quoted?.text || m.quoted?.caption || m.quoted?.conversation || m.quoted?.contentText || m.quoted?.selectedDisplayText || m.quoted?.title || ''
                m.quoted.mentionedJid = contextInfo?.mentionedJid || []

                m.getQuotedObj = m.getQuotedMessage = async () => {
                    if (!m.quoted.id) return false
                    const q = await store.loadMessage(m.chat, m.quoted.id, conn)
                    return exports.sms(conn, q, store)
                }

                const vM = m.quoted.fakeObj = M.fromObject({
                    key: {
                        remoteJid: m.quoted.chat,
                        fromMe: m.quoted.fromMe,
                        id: m.quoted.id
                    },
                    message: quoted,
                    ...(m.isGroup ? { participant: m.quoted.sender } : {})
                })

                const key = {
                    remoteJid: m.chat,
                    fromMe: false,
                    id: m.quoted.id,
                    participant: m.quoted.sender
                }

                m.quoted.delete = async () => await conn.sendMessage(m.chat, { delete: key })
                m.forwardMessage = (jid, forceForward = true, options = {}) => conn.copyNForward(jid, vM, forceForward, { contextInfo: { isForwarded: false } }, options)
                m.quoted.download = () => conn.downloadMediaMessage(m.quoted)
            }
        }
    }

    if (m.msg?.url) m.download = () => conn.downloadMediaMessage(m.msg)

    m.text = m.msg?.text || m.msg?.caption || m.message?.conversation || m.msg?.contentText || m.msg?.selectedDisplayText || m.msg?.title || ''

    m.copy = () => exports.sms(conn, M.fromObject(M.toObject(m)))
    m.copyNForward = (jid = m.chat, forceForward = false, options = {}) => conn.copyNForward(jid, m, forceForward, options)
    m.sticker = (stik, id = m.chat, option = { mentions: [m.sender] }) =>
        conn.sendMessage(id, { sticker: stik, contextInfo: { mentionedJid: option.mentions } }, { quoted: m })

    m.replyimg = (img, teks, id = m.chat, option = { mentions: [m.sender] }) =>
        conn.sendMessage(id, { image: img, caption: teks, contextInfo: { mentionedJid: option.mentions } }, { quoted: m })

    m.imgurl = (img, teks, id = m.chat, option = { mentions: [m.sender] }) =>
        conn.sendMessage(id, { image: { url: img }, caption: teks, contextInfo: { mentionedJid: option.mentions } }, { quoted: m })

    m.reply = async (content, opt = { packname: "Secktor", author: "SamPandey001" }, type = "text") => {
        switch (type.toLowerCase()) {
            case "text":
                return await conn.sendMessage(m.chat, { text: content }, { quoted: m })
            case "image":
                if (Buffer.isBuffer(content))
                    return await conn.sendMessage(m.chat, { image: content, ...opt }, { quoted: m })
                if (isUrl(content))
                    return conn.sendMessage(m.chat, { image: { url: content }, ...opt }, { quoted: m })
                break
            case "video":
                if (Buffer.isBuffer(content))
                    return await conn.sendMessage(m.chat, { video: content, ...opt }, { quoted: m })
                if (isUrl(content))
                    return await conn.sendMessage(m.chat, { video: { url: content }, ...opt }, { quoted: m })
                break
            case "audio":
                if (Buffer.isBuffer(content))
                    return await conn.sendMessage(m.chat, { audio: content, ...opt }, { quoted: m })
                if (isUrl(content))
                    return await conn.sendMessage(m.chat, { audio: { url: content }, ...opt }, { quoted: m })
                break
            case "template":
                const optional = await generateWAMessage(m.chat, content, opt)
                const message = { viewOnceMessage: { message: { ...optional.message } } }
                await conn.relayMessage(m.chat, message, { messageId: optional.key.id })
                break
            case "sticker":
                const { data, mime } = await conn.getFile(content)
                if (mime === "image/webp") {
                    const buff = await writeExifWebp(data, opt)
                    return await conn.sendMessage(m.chat, { sticker: { url: buff }, ...opt }, { quoted: m })
                } else {
                    const type = mime.split('/')[0]
                    if (type === "video" || type === "image")
                        return await conn.sendImageAsSticker(m.chat, content, opt)
                }
                break
        }
    }

    m.senddoc = (doc, type, id = m.chat, option = { mentions: [m.sender], filename: Config.ownername, mimetype: type,
        externalAdRepl: {
            title: Config.ownername,
            body: ' ',
            thumbnailUrl: ``,
            thumbnail: log0,
            mediaType: 1,
            mediaUrl: '',
            sourceUrl: gurl,
        }
    }) => conn.sendMessage(id, {
        document: doc,
        mimetype: option.mimetype,
        fileName: option.filename,
        contextInfo: {
            externalAdReply: option.externalAdRepl,
            mentionedJid: option.mentions
        }
    }, { quoted: m })

    m.sendcontact = (name, info, number) => {
        const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nORG:${info};\nTEL;type=CELL;type=VOICE;waid=${number}:${number}\nEND:VCARD`
        conn.sendMessage(m.chat, {
            contacts: {
                displayName: name,
                contacts: [{ vcard }]
            }
        }, { quoted: m })
    }

    m.react = (emoji) => conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } })

    return m
}

module.exports = { sms, downloadMediaMessage }
