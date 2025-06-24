const fs = require("fs");
const axios = require("axios");
const { cmd } = require('../command');

const dbPath = "./lib/wcg-database.json";
const timers = {};
const startTimers = {};
const countdownTimers = {}; // For countdown warnings

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

function clearStartTimer(from) {
  if (startTimers[from]) {
    clearTimeout(startTimers[from]);
    delete startTimers[from];
  }
  if (countdownTimers[from]) {
    countdownTimers[from].forEach(t => clearTimeout(t));
    delete countdownTimers[from];
  }
}

function clearTurnTimer(from) {
  if (timers[from]) {
    clearTimeout(timers[from]);
    delete timers[from];
  }
}

function generateRandomLetters(count) {
  const letters = [];
  const used = new Set();
  while (letters.length < count) {
    const l = String.fromCharCode(97 + Math.floor(Math.random() * 26));
    if (!used.has(l)) {
      letters.push(l);
      used.add(l);
    }
  }
  return letters;
}

async function announceTurn(conn, from, db) {
  const game = db[from];
  const currentPlayer = game.players[game.turn];
  const letter = game.requiredLetters[game.turn];
  const minLength = game.baseWordLength + game.currentRound;

  await conn.sendMessage(from, {
    text: `🎯 *Round ${game.currentRound + 1}* — It's your turn, @${currentPlayer.split("@")[0]}!\n\n🔤 Your word must start with *${letter.toUpperCase()}*\n📏 Minimum length: *${minLength}* letters\n⏳ Time: *${game.turnTime}s*\n\nSend your word now!`,
    mentions: [currentPlayer]
  });

  // Start countdown warnings at 10, 5, 3 seconds
  if (countdownTimers[from]) countdownTimers[from].forEach(t => clearTimeout(t));
  countdownTimers[from] = [];

  if (game.turnTime > 10) {
    countdownTimers[from].push(setTimeout(() => {
      conn.sendMessage(from, {
        text: `⏰ 10 seconds left, @${currentPlayer.split("@")[0]}! Hurry up!`,
        mentions: [currentPlayer]
      });
    }, (game.turnTime - 10) * 1000));
  }
  if (game.turnTime > 5) {
    countdownTimers[from].push(setTimeout(() => {
      conn.sendMessage(from, {
        text: `⏰ 5 seconds remaining, @${currentPlayer.split("@")[0]}!`,
        mentions: [currentPlayer]
      });
    }, (game.turnTime - 5) * 1000));
  }
  if (game.turnTime > 3) {
    countdownTimers[from].push(setTimeout(() => {
      conn.sendMessage(from, {
        text: `⚠️ 3 seconds left, @${currentPlayer.split("@")[0]}!`,
        mentions: [currentPlayer]
      });
    }, (game.turnTime - 3) * 1000));
  }
}

async function endGameSummary(conn, from, game) {
  const playersCount = game.players.length;
  const rounds = game.currentRound + 1;
  const wordsUsed = game.words.length;
  const winner = game.players[0];
  const wordsList = game.words.length > 0 ? game.words.join(", ") : "No words were played.";

  await conn.sendMessage(from, {
    text: `🏆 *Game Over!*\n\n👑 Winner: @${winner.split("@")[0]}\n🕹️ Rounds Played: ${rounds}\n📜 Total Words: ${wordsUsed}\n\n🗒️ Words Used:\n${wordsList}\n\nThanks for playing! Type "wcg [easy|medium|hard]" to start a new game.`,
    mentions: [winner]
  });
}

async function nextTurn(conn, from) {
  const db = loadDB();
  const game = db[from];
  if (!game || game.finished) return;

  clearTurnTimer(from);
  if (countdownTimers[from]) {
    countdownTimers[from].forEach(t => clearTimeout(t));
    delete countdownTimers[from];
  }

  // Move to next player
  game.turn = (game.turn + 1) % game.players.length;

  // Increase difficulty each full round
  if (game.turn === 0) {
    game.currentRound++;
    game.turnTime = Math.max(5, game.turnTime - game.reducePerRound);
  }

  saveDB(db);

  await announceTurn(conn, from, db);

  // Start turn timer
  timers[from] = setTimeout(async () => {
    await conn.sendMessage(from, {
      text: `⏰ Time's up for @${game.players[game.turn].split("@")[0]}! You missed your turn and are eliminated.`,
      mentions: [game.players[game.turn]]
    });

    // Remove eliminated player
    game.players.splice(game.turn, 1);

    // Check if winner
    if (game.players.length === 1) {
      game.finished = true;
      saveDB(db);
      clearTurnTimer(from);
      await endGameSummary(conn, from, game);
      delete db[from];
      saveDB(db);
      return;
    }

    if (game.turn >= game.players.length) game.turn = 0;
    saveDB(db);

    nextTurn(conn, from);
  }, game.turnTime * 1000);
}

// Main handler
cmd({
  pattern: ".*",
  desc: "Word Chain Game - no prefix commands",
  category: "game",
  filename: __filename,
  fromMe: false
}, async (conn, mek, m, { from, body, sender, reply }) => {
  if (!body) return;

  const text = body.trim().toLowerCase();
  const db = loadDB();

  const game = db[from];

  // 1. Handle leave command during waiting phase
  if (text === "leave wcg") {
    if (!game || game.finished) return reply("⚠️ No active Word Chain game to leave.");
    if (!game.waiting) return reply("⚠️ The game has already started, you can't leave now.");
    if (!game.players.includes(sender)) return reply("ℹ️ You are not in the current waiting lobby.");

    // Remove player
    game.players = game.players.filter(p => p !== sender);

    // If host leaves and no players left, cancel game
    if (game.players.length === 0) {
      delete db[from];
      saveDB(db);
      clearStartTimer(from);
      return conn.sendMessage(from, { text: "⚠️ Host and all players left. Game cancelled." });
    }

    // If host left, assign new host
    if (game.players[0] === sender) {
      // Assign new host to first player remaining
      // (optional: notify new host)
    }

    saveDB(db);
    return reply(`✅ You left the Word Chain game lobby. Current players: ${game.players.length}`);
  }

  // 2. Join game: "join wcg"
  if (text === "join wcg") {
    if (!game || game.finished) return reply("⚠️ No active Word Chain game to join.");
    if (!game.waiting) return reply("⚠️ The game has already started, too late to join.");
    if (game.players.includes(sender)) return reply("ℹ️ You already joined the game.");
    if (game.players.length >= 20) return reply("⚠️ Player limit reached (20).");

    game.players.push(sender);
    saveDB(db);
    return reply(`✅ @${sender.split("@")[0]} joined the Word Chain game! Players: ${game.players.length}`, null, { mentions: [sender] });
  }

  // 3. Start new game "wcg" or "wcg mode"
  if (text.startsWith("wcg")) {
    if (game && !game.finished) {
      return reply("⚠️ A Word Chain game is already running. Send 'join wcg' to enter.");
    }

    const parts = text.split(" ");
    let mode = "medium";
    if (parts.length > 1) {
      if (["easy", "medium", "hard"].includes(parts[1])) mode = parts[1];
    }

    const configs = {
      easy: { turnTime: 40, wordStart: 3, reduce: 0.5 },
      medium: { turnTime: 30, wordStart: 4, reduce: 1 },
      hard: { turnTime: 25, wordStart: 5, reduce: 2 }
    };
    const conf = configs[mode];

    db[from] = {
      type: "wcg",
      players: [sender],
      words: [],
      turn: 0,
      waiting: true,
      finished: false,
      currentRound: 0,
      turnTime: conf.turnTime,
      baseWordLength: conf.wordStart,
      reducePerRound: conf.reduce,
      requiredLetters: [],
      mode
    };
    saveDB(db);

    // Reminders every 15 seconds during wait
    const remindPlayers = () => {
      if (!db[from] || db[from].finished || !db[from].waiting) return;
      conn.sendMessage(from, {
        text: `⏳ Waiting for players to join! Send *join wcg* to enter the game lobby. Current players: ${db[from].players.length}`
      });
      startTimers[from] = setTimeout(remindPlayers, 15000);
    };

    clearStartTimer(from);
    startTimers[from] = setTimeout(remindPlayers, 15000);

    await reply(`🎮 *Word Chain Game Started!* 👤 Host: @${sender.split("@")[0]} 🧩 Mode: *${mode.toUpperCase()}* 

⏳ Waiting for players to join (max 20)

🕔 Game begins in *50 seconds*.

Send *join wcg* to enter the game lobby.

You can leave anytime by sending *leave wcg*.

Good luck!`, null, { mentions: [sender] });

    clearStartTimer(from);
    startTimers[from] = setTimeout(async () => {
      const db2 = loadDB();
      const game2 = db2[from];
      if (!game2 || game2.finished) return;

      if (game2.waiting) {
        if (game2.players.length < 2) {
          conn.sendMessage(from, { text: "⚠️ Not enough players joined. Game cancelled." });
          delete db2[from];
          saveDB(db2);
          clearStartTimer(from);
          return;
        }

        game2.waiting = false;
        game2.requiredLetters = generateRandomLetters(game2.players.length);
        saveDB(db2);

        await conn.sendMessage(from, {
          text: `🚦 The game is starting with ${game2.players.length} players!

@${game2.players.map(p => p.split("@")[0]).join(", @")}

Get ready!`,
          mentions: game2.players
        });

        await announceTurn(conn, from, db2);

        timers[from] = setTimeout(async () => {
          await conn.sendMessage(from, {
            text: `⏰ Time's up for @${game2.players[0].split("@")[0]}! You missed your turn and are eliminated.`,
            mentions: [game2.players[0]]
          });

          game2.players.shift();

          if (game2.players.length === 1) {
            game2.finished = true;
            saveDB(db2);
            clearTurnTimer(from);
            await endGameSummary(conn, from, game2);
            delete db2[from];
            saveDB(db2);
            return;
          }

          game2.turn = 0;
          saveDB(db2);

          nextTurn(conn, from);
        }, game2.turnTime * 1000);
      }
    }, 50 * 1000);

    return;
  }

  // 4. Status command: "status wcg"
  if (text === "status wcg") {
    if (!game || game.finished) return reply("⚠️ No active Word Chain game currently.");
    const playersList = game.players.map(p => `@${p.split("@")[0]}`).join(", ");
    const statusMsg = game.waiting
      ? `⏳ Waiting for players to join.\nPlayers (${game.players.length}): ${playersList}`
      : `🎮 Game in progress.\nRound: ${game.currentRound + 1}\nPlayers left (${game.players.length}): ${playersList}\nCurrent turn: @${game.players[game.turn].split("@")[0]}`;
    return reply(statusMsg, null, { mentions: game.players });
  }

  // 5. Word submission during game
  if (!game || game.finished || game.type !== "wcg" || game.waiting) return;

  if (game.players[game.turn] !== sender) return; // Not your turn

  if (text.includes(" ")) return; // Only single words allowed

  const word = text.trim();

  if (game.words.includes(word)) return reply("❌ Word already used, try another!");

  const minLength = game.baseWordLength + game.currentRound;
  if (word.length < minLength) return reply(`❌ Word must be at least ${minLength} letters long.`);

  const requiredLetter = game.requiredLetters[game.turn];
  if (!word.startsWith(requiredLetter)) return reply(`❌ Word must start with '${requiredLetter.toUpperCase()}'!`);

  const valid = await isValidWord(word);
  if (!valid) return reply("❌ That’s not a valid English word!");

  game.words.push(word);
  saveDB(db);

  clearTurnTimer(from);
  if (countdownTimers[from]) {
    countdownTimers[from].forEach(t => clearTimeout(t));
    delete countdownTimers[from];
  }

  const praisePhrases = [
    "🔥 Nicely done!",
    "✅ Word accepted!",
    "🎉 Great pick!",
    "💯 On point!",
    "👏 Keep it up!"
  ];
  const praise = praisePhrases[Math.floor(Math.random() * praisePhrases.length)];

  await conn.sendMessage(from, {
    text: `${praise} @${sender.split("@")[0]} used *${word}*`,
    mentions: [sender]
  });

  nextTurn(conn, from);
});
