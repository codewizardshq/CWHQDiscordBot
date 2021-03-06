const schedule = require("node-schedule");

const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");

const fs = require("fs");
if (!fs.existsSync("db")) {
    fs.mkdirSync("db");
}

const adapter = new FileSync("./db/rollbacks.json");
const trackers = low(adapter);

trackers.defaults({}).write();

schedule.scheduleJob({ minute: 0, hour: 0, dayOfWeek: 0, tz: "America/Chicago" }, () => {
    console.log("Clearing database.");
    adapter.write({});
});

class Tracker {
    constructor(player) {
        this.id = player;
        this.rollbacks = 0;
    }
}

function trackerHelper(player, value) {
    const tracker = trackers.get(player).value() ? trackers.get(player).value() : trackers.set(player, new Tracker(player)).get(player).write();

    tracker.rollbacks += value;
    if (tracker.rollbacks <= 0) {
        trackers.set(player, undefined).write();
        return 0;
    }

    trackers.update(player, tracker).write();
    return tracker.rollbacks;
}

function addRollback(args) {
    const player = args[0];

    if (!player || player.includes("`") || (args[1] && parseInt(args[1]) == NaN)) return "Invalid syntax. Check `!rb help` for information.";

    trackerHelper(player, Math.abs(args[1] ? args[1] : 1));
    if (trackers.get(player).value()) {
        const tracker = trackers.get(player).value();
        return `Player \`${player}\` has had **${tracker.rollbacks}** rollback${tracker.rollbacks > 1 ? "(s)" : ""} in the last week.`;
    } else {
        return `Player \`${player}\` has had no rollbacks in the last week.`;
    }
}
function removeRollback(args) {
    const player = args[0];

    if (!player || player.includes("`") || (args[1] && parseInt(args[1]) == NaN)) return "Invalid syntax. Check `!rb help` for information.";

    trackerHelper(player, Math.abs(args[1] ? args[1] : 1) * -1);
    if (trackers.get(player).value()) {
        const tracker = trackers.get(player).value();
        return `Player \`${player}\` has had **${tracker.rollbacks}** rollback${tracker.rollbacks > 1 ? "(s)" : ""} in the last week.`;
    } else {
        return `Player \`${player}\` has had no rollbacks in the last week.`;
    }
}
function clearRollbacks(args) {
    const player = args[0];

    if (!player || player.includes("`")) return "Invalid syntax. Check `!rb help` for information.";

    if (trackers.get(player).value()) {
        trackers.set(player, undefined).write();
    }
    return `Cleared rollbacks from player \`${player}\`.`;
}
async function getPlayerRollbacks(message, player, handleEvents = true) {
    if (!player || player.includes("`")) return "Invalid syntax. Check `!rb help` for information.";

    let result;

    if (trackers.get(player).value()) {
        const tracker = trackers.get(player).value();
        result = `Player \`${player}\` has had **${tracker.rollbacks}** rollback${tracker.rollbacks > 1 ? "(s)" : ""} in the last week.`;
    } else {
        result = `Player \`${player}\` has had no rollbacks in the last week.`;
    }

    if (handleEvents) {
        const msg = await message.channel.send(result);
        await msg.react("⬇️");
        await msg.react("⬆️");

        const collector = msg.createReactionCollector(
            (r, u) =>
                (r.emoji.name == "⬇️" || r.emoji.name == "⬆️") &&
                !u.bot &&
                r.message.guild.member(u).roles.cache.some(r => r.id == "765034419509526549")
        );
        collector.on("collect", async (reaction, user) => {
            if (reaction.emoji.name == "⬇️") {
                trackerHelper(player, -1);
            } else {
                trackerHelper(player, 1);
            }
            reaction.users.remove(user);
            msg.edit(await getPlayerRollbacks(message, player, false));
        });
    }

    return result;
}

module.exports.message = async (client, msg) => {
    // if (msg.author.bot) return;
    let args = msg.content.toLowerCase().split(" ");

    if (args[0] != "!rb") return;
    args.shift();

    if (!msg.member.roles.cache.some(r => r.id == "765034419509526549") || msg.author.bot) {
        switch (args[0]) {
            case "add":
            case "remove":
            case "clear":
            case "help":
            case null:
            case undefined:
                msg.react("⚠️");
                return;

            default:
                getPlayerRollbacks(msg, args[0]);
                return;
        }
    }

    if (args.length > 0 && args[0] != "help") {
        const cmd = args[0];

        switch (cmd) {
            case "add":
                args.shift();
                msg.channel.send(addRollback(args));
                break;

            case "remove":
                args.shift();
                msg.channel.send(removeRollback(args));
                break;

            case "clear":
                args.shift();
                msg.channel.send(clearRollbacks(args));
                break;
            case "debug":
                args.shift();
                if (!msg.member.hasPermission("MANAGE_GUILD")) {
                    msg.react("⚠️");
                    break;
                }
                switch (args[0]) {
                    case "cleardb":
                        adapter.write({});
                        msg.channel.send("All rollbacks cleared from database.");
                        break;
                    case "getdb":
                    case undefined:
                        msg.channel.send(`\`\`\`json\n${JSON.stringify(trackers.read().value())}\n\`\`\``);
                        break;
                    default:
                        msg.react("⚠️");
                        break;
                }
                break;

            default:
                getPlayerRollbacks(msg, args[0]);
                break;
        }
    } else {
        msg.channel.send({
            embed: {
                title: "Rollback Command Help",
                description:
                    "Rollbacks reset every day at midnight.\n\nKeep in mind that players are **NOT** discord users, and as such do not use a mention to add a rollback.\n\n__**Commands:**__",
                color: 10831812,
                fields: [
                    {
                        name: "!rb <player>",
                        value: "Retrieves the number of rollbacks that a specified player currently has."
                    },
                    {
                        name: "!rb add <player> [amount]",
                        value: "Adds a specified amount of rollbacks to a player."
                    },
                    {
                        name: "!rb remove <player> [amount]",
                        value: "Subtracts a specified amount of rollbacks to a player. (Will cap at 0 rollbacks)"
                    },
                    {
                        name: "!rb clear <player>",
                        value: "Removes a player from the database, and as such setting their rollback count to 0."
                    },
                    {
                        name: "!rb",
                        value: "Shows this help menu."
                    }
                ]
            }
        });
    }

    return;
};

// exports.message = (client, msg) => {
//     const user = msg.mentions.members.first();

//     if (user) {
//         if (trackers.has(user.id)) {
//             tracker = trackers.get(user.id);
//         } else {
//             tracker = new Tracker(user.id);
//             trackers.set(user.id, tracker);
//         }
//     } else {
//         msg.channel.send("Invalid user.");
//         return;
//     }

//     var args = msg.content.toLowerCase().split(" ");
//     if(args[0] == "!rb") {
//         if(args[1] == "add") {
//             if(msg.member.roles.cache.find(r => r.id == '765034419509526549')) {
//                 var user = msg.mentions.members.first();
//                 if(user) {
//                     const tracker = trackers.get(user.id);
//                     tracker.rollbacks++;
//                     msg.channel.send("Added a rollback to `" + user.user.tag + "`'s count.");
//                 } else {
//                     msg.channel.send("Invalid user.");
//                 }
//             } else {
//                 msg.channel.send("You do not have permission to use this command.");
//             }
//         } else if (args[1] == "remove") {
//             if(msg.member.roles.cache.find(r => r.id == '765034419509526549')) {
//                 var user = msg.mentions.members.first();
//                 if(user) {
//                     const tracker = trackers.get(user.id);
//                     if(!trackers.has(user.id)) {
//                         msg.channel.send("`" + user.user.tag + "` has had no rollbacks in the past week.");
//                     } else {
//                         if(tracker.rollbacks > 0) {
//                             tracker.rollbacks--;
//                             msg.channel.send("Removed a rollback to `" + user.user.tag + "`'s count.");
//                         } else {
//                             tracker.rollbacks = 0;
//                             msg.channel.send("Failed to remove rollback. User's count is already 0.");
//                         }
//                     }
//                 } else {
//                     msg.channel.send("Invalid user.");
//                 }
//             } else {
//                 msg.channel.send("You do not have permission to use this command.");
//             }
//         } else {
//             var user = msg.mentions.members.first() || msg.member;
//             if(user) {
//                 const tracker = trackers.get(user.id);
//                 if(trackers.has(user.id)) {
//                     msg.channel.send("`" + user.user.tag + "` has had " + tracker.rollbacks + " rollback(s) in the last week.");
//                 } else {
//                     msg.channel.send("`" + user.user.tag + "` has had no rollbacks in the past week.");
//                 }

//             } else {
//                 msg.channel.send("Invalid user.");
//             }
//         }
//     }
// }

// var exports = module.exports;
