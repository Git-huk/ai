const fs = require("fs");
const axios = require("axios");
const { cmd } = require('../command');

const dbPath = "./lib/wcg-database.json";
const timers = {};
const startTimers = {};

const WAIT_TIME = 30; // seconds wait before game starts

const modes = {
  easy: { turnTime: 40, baseLength: 3, lengthIncrementEveryRounds: 4 },
  medium: { turnTime: 30, baseLength: 3, lengthIncrementEveryRounds: 2 },
  hard: { turnTime: 25, baseLength: 4, lengthIncrementEveryRounds: 1 },
};

function loadDB() {
  if (!fs.existsSync(dbPath)) return {};
  return JSON.parse(fs.readFileSync(dbPath, "utf-8") || "{}");
}

function saveDB(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

async function isValidWord(word) {
  try {
    const res = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`);
    return Array.isArray(res.data);
  } catch {
    return false;
  }
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

function getWordLengthForTurn(game) {
  const modeData = modes[game.mode] || modes.medium;
  const increments = Math.floor(game.roundsCompleted / modeData.lengthIncrementEveryRounds);
  return modeData.baseLength + increments;
}

cmd({
  pattern: "wcg ?(.*)",
  desc: "Start a Word Chain Game with optional mode: easy, medium, hard",
  category: "game",
  filename: __filename,
}, async (conn, mek, m, { from, reply, sender, args }) => {
  const db = loadDB();

  if (db[from] && !db[from].finished) return reply("⚠️ A Word Chain game is already running here.");

  const modeArg = (args[0] || "medium").toLowerCase();
  const mode = modes[modeArg] ? modeArg : "medium";
  const modeData = modes[mode];

  db[from] = {
    type: "wcg",
    players: [sender],
    words: [],
    turn: 0,
    waiting: true,
    finished: false,
    mode: mode,
    turnTime: modeData.turnTime,
    roundsCompleted: 0,
    requiredFirstLetter: null,
  };

  saveDB(db);

  reply(
    `🎮 *Word Chain Game Created!*\n👤 Player 1: @${sender.split("@")[0]}\n🛡 Mode: *${mode.toUpperCase()}*\n🕒 Waiting for players (max 20)...\n\nType *join-wcg* to jump in!\n\n⌛ Game starts in *${WAIT_TIME} seconds* — Get ready!`,
    null,
    { mentions: [sender] }
  );

  clearStartTimer(from);

  // Countdown announcements at intervals
  [20, 10, 5, 3, 1].forEach((sec) => {
    setTimeout(() => {
      const game = loadDB()[from];
      if (!game || !game.waiting) return;
      conn.sendMessage(from, {
        text: `⏳ Game begins in *${sec} second${sec > 1 ? "s" : ""}*!\nType *join-wcg* to join the fun!`,
      });
    }, (WAIT_TIME - sec) * 1000);
  });

  // Start game after wait time
  startTimers[from] = setTimeout(() => {
    const db = loadDB();
    if (!db[from] || db[from].finished) return;
    const game = db[from];
    if (game.waiting) {
      if (game.players.length < 2) {
        conn.sendMessage(from, { text: "⚠️ Not enough players joined. Game cancelled." });
        delete db[from];
        saveDB(db);
        return;
      }
      game.waiting = false;
      game.turn = 0;

      const randomLetter = String.fromCharCode(97 + Math.floor(Math.random() * 26));
      game.requiredFirstLetter = randomLetter;

      saveDB(db);

      conn.sendMessage(from, {
        text: `🔥 *Let the Word Chain Begin!*\n🎯 @${game.players[0].split("@")[0]} starts.\n🔤 First letter: *${randomLetter.toUpperCase()}*\n📏 Minimum length: *${getWordLengthForTurn(game)}*\n⏳ You have *${game.turnTime} seconds* to reply.\n\nType your word without any prefix!`,
        mentions: game.players,
      });

      clearStartTimer(from);
      clearTurnTimer(from);
      timers[from] = setTimeout(() => handleTimeout(conn, from), game.turnTime * 1000);
    }
  }, WAIT_TIME * 1000);
});

// No join command — players join by typing "join-wcg" during waiting phase only
cmd({
  pattern: ".*",
  dontAddCommandList: true,
  fromMe: false,
  filename: __filename,
}, async (conn, mek, m, { from, sender, body, reply }) => {
  const text = (body || "").trim().toLowerCase();
  const db = loadDB();
  const game = db[from];

  if (!game || game.type !== "wcg" || game.finished) return;

  if (game.waiting) {
    // Accept "join-wcg" only while waiting
    if (text === "join-wcg") {
      if (game.players.includes(sender)) return reply("⚠️ You already joined the game.");
      if (game.players.length >= 20) return reply("⚠️ Player limit reached (20).");

      game.players.push(sender);
      saveDB(db);

      return reply(
        `🙌 Welcome @${sender.split("@")[0]}! You joined the Word Chain.\n👥 Players: ${game.players.length}\n⌛ Game starts soon — Get ready!`,
        null,
        { mentions: game.players }
      );
    }
    // Ignore any other messages during waiting phase
    return;
  }

  // If game started, only current player's turn words accepted
  const currentPlayer = game.players[game.turn];
  if (currentPlayer !== sender) return;

  // Validate word input
  if (!/^[a-z]{2,}$/.test(text)) return reply("⚠️ Please send a valid English word with letters only.");
  if (text.length < getWordLengthForTurn(game)) return reply(`📏 Word too short! Minimum *${getWordLengthForTurn(game)}* letters required.`);
  if (game.words.includes(text)) return reply("♻️ Word already used! Try a different one.");
  if (!(await isValidWord(text))) return reply("❌ That word doesn't seem valid. Try again!");

  if (game.words.length > 0) {
    const lastWord = game.words[game.words.length - 1];
    if (lastWord[lastWord.length - 1] !== text[0]) {
      return reply(`🔁 Word must start with *${lastWord[lastWord.length - 1].toUpperCase()}*`);
    }
  } else {
    if (text[0] !== game.requiredFirstLetter) {
      return reply(`🔤 First word must start with *${game.requiredFirstLetter.toUpperCase()}*`);
    }
  }

  // Word accepted
  game.words.push(text);
  game.turn = (game.turn + 1) % game.players.length;

  // Increment roundsCompleted after full cycle
  if (game.turn === 0) game.roundsCompleted++;

  clearTurnTimer(from);
  timers[from] = setTimeout(() => handleTimeout(conn, from), game.turnTime * 1000);

  saveDB(db);

  reply(
    `✅ *${text}* accepted! 🎉\n🔠 Next word starts with *${text[text.length - 1].toUpperCase()}*\n➡️ @${game.players[game.turn].split("@")[0]}, your turn!\n📏 Min length: *${getWordLengthForTurn(game)}*\n⏳ You have ${game.turnTime} seconds.`,
    null,
    { mentions: game.players }
  );
});

async function handleTimeout(conn, from) {
  const db = loadDB();
  if (!db[from]) return;
  const game = db[from];
  if (game.finished) return;

  const eliminated = game.players[game.turn];
  game.players.splice(game.turn, 1);

  await conn.sendMessage(from, {
    text: `⌛ *Timeout!* @${eliminated.split("@")[0]} failed to respond in time and was eliminated.`,
    mentions: [eliminated],
  });

  if (game.players.length === 1) {
    game.finished = true;
    await conn.sendMessage(from, {
      text: `🏆 *Game Over!* 🎉\nCongratulations to the winner: @${game.players[0].split("@")[0]} 🏅`,
      mentions: game.players,
    });
    clearTurnTimer(from);
    clearStartTimer(from);
    delete db[from];
    saveDB(db);
    return;
  }

  if (game.turn >= game.players.length) game.turn = 0;

  const lastWord = game.words[game.words.length - 1];
  const nextLetter = lastWord[lastWord.length - 1];

  clearTurnTimer(from);
  timers[from] = setTimeout(() => handleTimeout(conn, from), game.turnTime * 1000);

  saveDB(db);

  await conn.sendMessage(from, {
    text: `➡️ It's @${game.players[game.turn].split("@")[0]}'s turn!\n🔠 Word must start with *${nextLetter.toUpperCase()}*\n📏 Min length: *${getWordLengthForTurn(game)}*\n⏳ You have ${game.turnTime} seconds.`,
    mentions: [game.players[game.turn]],
  });
}
