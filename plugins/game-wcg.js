const fs = require("fs");
const axios = require("axios");
const { cmd } = require("../command");
const config = require("../config");

const DB_PATH = "./lib/wcg-database.json";
const STATS_PATH = "./lib/wcg-stats.json";

const timers = {};
const startTimers = {};
const WAIT_TIME = 30;
const MAX_PLAYERS = 20;

const modes = {
  easy: { turnTime: 40, baseLength: 3, lengthIncrementEveryRounds: 4 },
  medium: { turnTime: 30, baseLength: 3, lengthIncrementEveryRounds: 2 },
  hard: { turnTime: 25, baseLength: 4, lengthIncrementEveryRounds: 1 },
};

function load(path) {
  if (!fs.existsSync(path)) return {};
  return JSON.parse(fs.readFileSync(path, "utf-8") || "{}");
}

function save(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

async function isValidWord(word) {
  try {
    const res = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`);
    return Array.isArray(res.data);
  } catch {
    return false;
  }
}

function getWordLengthForTurn(game) {
  const mode = modes[game.mode] || modes.medium;
  return mode.baseLength + Math.floor(game.roundsCompleted / mode.lengthIncrementEveryRounds);
}

function updateStats(player, win, wordCount, roundCount) {
  const stats = load(STATS_PATH);
  if (!stats[player]) stats[player] = { wins: 0, words: 0, rounds: 0 };
  if (win) stats[player].wins += 1;
  stats[player].words += wordCount;
  stats[player].rounds += roundCount;
  save(STATS_PATH, stats);
}

function clearStartTimer(chatId) {
  if (startTimers[chatId]) {
    clearTimeout(startTimers[chatId]);
    delete startTimers[chatId];
  }
}

function clearTurnTimer(chatId) {
  if (timers[chatId]) {
    clearTimeout(timers[chatId]);
    delete timers[chatId];
  }
}

function isPatternRepeated(word) {
  return /^([a-zA-Z])\1+$/.test(word);
}

function formatPlayers(players) {
  return players.map((p, i) => `👤 ${i + 1}. @${p.split("@")[0]}`).join("\n");
}

function getMentionJid(jid) {
  return [jid];
}

function getMentionTag(jid) {
  return `@${jid.split("@")[0]}`;
}

cmd(
  {
    pattern: "wcg",
    desc: "Start word chain game",
    category: "game",
    filename: __filename,
  },
  async (m, text, { botNumber, conn }) => {
    const chatId = m.chat;
    const sender = m.sender;
    const args = text.trim().split(" ");
    const mode = (args[0] || "medium").toLowerCase();

    if (!modes[mode]) return m.reply("⚠️ Invalid mode. Use `easy`, `medium`, or `hard`.");

    const db = load(DB_PATH);
    if (db[chatId]) return m.reply("⚠️ A game is already active in this chat!");

    db[chatId] = {
      players: [sender],
      usedWords: [],
      round: 0,
      roundsCompleted: 0,
      currentWord: null,
      expectedStart: null,
      mode,
      turnIndex: 0,
      gameStarted: false,
    };
    save(DB_PATH, db);

    m.reply(`🧠 Word Chain Game Started in *${mode.toUpperCase()}* mode!\n\nPlayers can join for ${WAIT_TIME} seconds using *wcgjoin*.\n\nMax players: ${MAX_PLAYERS}`);

    startTimers[chatId] = setTimeout(async () => {
      const db = load(DB_PATH);
      const game = db[chatId];
      if (!game || game.players.length < 2) {
        delete db[chatId];
        save(DB_PATH, db);
        return m.reply("⚠️ Not enough players joined. Game cancelled.");
      }

      game.gameStarted = true;

      // Ensure bot joins but never starts first
      if (!game.players.includes(botNumber)) {
        game.players.push(botNumber);
      }
      const realPlayers = game.players.filter(p => p !== botNumber);
      if (game.players[0] === botNumber && realPlayers.length > 0) {
        const nonBot = realPlayers[Math.floor(Math.random() * realPlayers.length)];
        const idx = game.players.indexOf(nonBot);
        [game.players[0], game.players[idx]] = [game.players[idx], game.players[0]];
      }

      save(DB_PATH, db);
      nextTurn(chatId, conn, botNumber);
    }, WAIT_TIME * 1000);
  }
);

cmd(
  {
    pattern: "wcgjoin",
    desc: "Join WCG",
    category: "game",
    filename: __filename,
  },
  async (m) => {
    const db = load(DB_PATH);
    const game = db[m.chat];
    if (!game || game.gameStarted) return;

    if (game.players.includes(m.sender)) return m.reply("🫵 You're already in the game!");
    if (game.players.length >= MAX_PLAYERS) return m.reply("⚠️ Maximum players reached!");

    game.players.push(m.sender);
    save(DB_PATH, db);
    m.reply(`✅ Joined!\nCurrent players:\n${formatPlayers(game.players)}`);
  }
);

async function nextTurn(chatId, conn, botNumber) {
  const db = load(DB_PATH);
  const game = db[chatId];
  if (!game) return;

  game.round++;
  if (game.turnIndex >= game.players.length) {
    game.turnIndex = 0;
    game.roundsCompleted++;
  }

  const player = game.players[game.turnIndex];
  const requiredLength = getWordLengthForTurn(game);
  const expected = game.currentWord ? game.currentWord.slice(-1) : null;

  game.expectedStart = expected;
  save(DB_PATH, db);

  const msg = `🎮 Round ${game.round}\n👤 Turn: ${getMentionTag(player)}\n📏 Minimum letters: ${requiredLength}` +
    (expected ? `\n🔤 Word must start with: *${expected.toUpperCase()}*` : "") +
    `\n⏳ You have ${modes[game.mode].turnTime}s.`;

  await conn.sendMessage(chatId, { text: msg, mentions: getMentionJid(player) });

  if (player === botNumber) {
    clearTurnTimer(chatId);
    setTimeout(async () => {
      let word = expected ? expected + "ame" : "game";
      if (game.usedWords.includes(word)) word += "r";
      game.usedWords.push(word);
      game.currentWord = word;
      game.turnIndex++;
      save(DB_PATH, db);
      conn.sendMessage(chatId, { text: `🤖 Bot played: *${word}*` });
      nextTurn(chatId, conn, botNumber);
    }, 2000);
    return;
  }

  clearTurnTimer(chatId);
  timers[chatId] = setTimeout(() => {
    conn.sendMessage(chatId, { text: `⌛ @${player.split("@")[0]} ran out of time and was eliminated.`, mentions: [player] });
    game.players.splice(game.turnIndex, 1);
    if (game.players.length === 1) {
      conn.sendMessage(chatId, { text: `🏆 Game Over! Winner: ${getMentionTag(game.players[0])}`, mentions: [game.players[0]] });
      updateStats(game.players[0], true, game.usedWords.length, game.roundsCompleted);
      delete db[chatId];
    } else {
      if (game.turnIndex >= game.players.length) game.turnIndex = 0;
      nextTurn(chatId, conn, botNumber);
    }
    save(DB_PATH, db);
  }, modes[game.mode].turnTime * 1000);
}

cmd(
  {
    on: "text",
    fromMe: false,
    filename: __filename,
  },
  async (m, text, { botNumber, conn }) => {
    const chatId = m.chat;
    const db = load(DB_PATH);
    const game = db[chatId];
    if (!game || !game.gameStarted) return;

    const player = game.players[game.turnIndex];
    if (m.sender !== player) return;

    const word = text.trim().toLowerCase();

    if (!/^[a-zA-Z]+$/.test(word)) return m.reply("⚠️ Please send a valid English word with letters only.");
    if (game.usedWords.includes(word)) return m.reply("🚫 That word has already been used!");
    if (isPatternRepeated(word)) return m.reply("🚨 Suspicious pattern detected. Try a real word.");
    if (game.expectedStart && word[0] !== game.expectedStart) return m.reply(`❌ Your word must start with: *${game.expectedStart.toUpperCase()}*`);
    if (word.length < getWordLengthForTurn(game)) return m.reply(`✂️ Word too short! Needs at least ${getWordLengthForTurn(game)} letters.`);

    const valid = await isValidWord(word);
    if (!valid) return m.reply("📚 Word not found in dictionary!");

    game.usedWords.push(word);
    game.currentWord = word;
    game.turnIndex++;
    save(DB_PATH, db);
    clearTurnTimer(chatId);
    m.reply(`✅ Cool! *${word}* accepted!`);
    nextTurn(chatId, conn, botNumber);
  }
);
