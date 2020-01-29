const _ = require('lodash')
const config = require('config')
const fs = require('fs')

let monsterDataPath = `${__dirname}/../../../util/monsters.json`
const defaultMonsterData = require(monsterDataPath)
if (config.locale.language.toLowerCase() !== 'en') {
	const monsterDataPathToTest = `${__dirname}/../../../util/locale/monsters${config.locale.language.toLowerCase()}.json`
	if (fs.existsSync(monsterDataPathToTest)) {
		monsterDataPath = monsterDataPathToTest
	}
}
const monsterData = require(monsterDataPath)
const questDts = require('../../../../config/questdts')

let gruntTypeDataPath = `${__dirname}/../../../util/grunt_types.json`
const defaultGruntTypes = require(gruntTypeDataPath)
if (config.locale.language.toLowerCase() !== 'en') {
	const gruntTypeDataPathToTest = `${__dirname}/../../../util/locale/grunt_types${config.locale.language.toLowerCase()}.json`
	if (fs.existsSync(gruntTypeDataPathToTest)) {
		gruntTypeDataPath = gruntTypeDataPathToTest
	}
}
const gruntTypes = require(gruntTypeDataPath)

const genData = require(`${__dirname}/../../../util/gens`)


exports.run = (client, msg) => {
	let target = { id: msg.author.id, name: msg.author.tag }
	if (!_.includes(client.config.discord.admins, msg.author.id) && msg.channel.type === 'text') {
		return msg.author.send('Please run commands in Direct Messages').catch((O_o) => {
			client.log.error(O_o.message)
		})
	}
	if (_.includes(client.config.discord.admins, msg.author.id) && msg.channel.type === 'text') target = { id: msg.channel.id, name: msg.channel.name }

	if (_.includes(client.config.discord.admins, msg.author.id) && msg.content.match(client.hookRegex)) {
		target = { id: msg.content.match(client.hookRegex)[0], name: `Webhook-${_.random(99999)}` }
		msg.content = msg.content.replace(client.hookRegex, '')
	}
	client.query.countQuery('id', 'humans', 'id', target.id)
		.then((isregistered) => {
			if (!isregistered && _.includes(client.config.discord.admins, msg.author.id) && msg.content.match(client.hookRegex)) {
				return msg.reply(`${target.name} does not seem to be registered. add it with ${client.config.discord.prefix}${client.config.commands.webhook ? client.config.commands.webhook : 'webhook'}  add <YourWebhook>`).catch((O_o) => {
					client.log.error(O_o.message)
				})
			}
			if (!isregistered && _.includes(client.config.discord.admins, msg.author.id) && msg.channel.type === 'text') {
				return msg.reply(`${msg.channel.name} does not seem to be registered. add it with ${client.config.discord.prefix}${client.config.discord.prefix}${client.config.commands.channel ? client.config.commands.channel : 'channel'} add`).catch((O_o) => {
					client.log.error(O_o.message)
				})
			}
			if (!isregistered && msg.channel.type === 'dm') {
				return msg.author.send(`You don't seem to be registered. \nYou can do this by sending ${client.config.discord.prefix}${client.config.commands.poracle ? client.config.commands.poracle : 'poracle'} to #${client.config.discord.channel}`).catch((O_o) => {
					client.log.error(O_o.message)
				})
			}
			if (isregistered) {
				let monsters = []
				const items = []
				let distance = 0
				const questTracks = []
				let template = 3
				let mustShiny = 0
				let remove = false
				let gen = 0
				const rawArgs = msg.content.slice(`${config.discord.prefix}quest`.length)
				const args = rawArgs.toLowerCase().split(' ')
				let minDust = 10000000
				let stardustTracking = 9999999

				for (const element of args) {
					let pid = (element.match(/^\d+$/) && _.has(monsterData, element))
						? element
						: _.findKey(monsterData, (mon) => mon.name.toLowerCase() === element)
					pid = pid || _.findKey(defaultMonsterData, (mon) => mon.name.toLowerCase() === element)
					if (pid) monsters.push(pid)
					else if (element.match(/^gen[1-7]$/i)) {
						gen = element.replace(/gen/i, '')
						monsters = [...Array(config.general.max_pokemon).keys()].map((x) => x += 1).filter((k) => k >= genData[gen].min && k <= genData[gen].max) // eslint-disable-line no-return-assign
					}
					else if (element.match(/^d\d+$/i)) {
						distance = element.replace(/d/i, '')
						if (distance.length >= 10) distance = distance.substr(0, 9)
					}
					else if (element.match(/^stardust\d+$/i)) minDust = element.replace(/stardust/i, '')
					else if (element === 'stardust') {
						minDust = 1
						stardustTracking = -1
					}
					else if (element === 'shiny') mustShiny = 1
					else if (element === 'remove') remove = true
					else if (element.match(/^template[1-5]$/i)) template = element.replace(/template/i, '')
					else {
						let tid = _.findKey(gruntTypes, (t) => t.type.toLowerCase() === element.toLowerCase())
						tid = tid || _.findKey(defaultGruntTypes, (t) => t.type.toLowerCase() === element.toLowerCase())
						if (tid) {
							_.filter(defaultMonsterData, (o, k) => {
								if (_.includes(o.types, defaultGruntTypes[tid].type) && k < config.general.max_pokemon) {
									if (!_.includes(monsters, parseInt(k, 10))) monsters.push(parseInt(k, 10))
								}
								return k
							})
						}
					}
				}
				_.forEach(questDts.rewardItems, (item, key) => {
					const re = new RegExp(`(^| )${item}`, 'i')
					if (rawArgs.match(re)) items.push(key)
				})
				if (rawArgs.match(/(^| )all pokemon/i)) monsters = [...Array(config.general.max_pokemon).keys()].map((x) => x += 1) // eslint-disable-line no-return-assign
				if (rawArgs.match(/(^| )all items/i)) {
					_.forEach(questDts.rewardItems, (item, key) => {
						items.push(key)
					})
				}
				if (rawArgs.match(/^stardust\d+$/i)) {
					questTracks.push({
						id: target.id,
						reward: minDust,
						template,
						mustShiny: 0,
						reward_type: 3,
						distance,
					})
				}
				monsters.forEach((pid) => {
					questTracks.push({
						id: target.id,
						reward: pid,
						template,
						mustShiny,
						reward_type: 7,
						distance,
					})
				})
				items.forEach((i) => {
					questTracks.push({
						id: target.id,
						reward: i,
						template,
						mustShiny: 0,
						reward_type: 2,
						distance,
					})
				})
				if (!remove) {
					if (!questTracks.length) {
						msg.reply('404, No valid quest tracks found').catch((O_o) => {
							client.log.error(O_o.message)
						})
						return
					}
					const insertData = questTracks.map((t) => [t.id, t.reward, t.template, t.reward_type, t.distance, t.mustShiny])
					client.query.insertOrUpdateQuery(
						'quest',
						['id', 'reward', 'template', 'reward_type', 'distance', 'shiny'],
						insertData,
					).catch((O_o) => {})
					client.log.log({ level: 'debug', message: `${msg.author.username} added quest trackings to ${target.name}`, event: 'discord:quest' })
					msg.react('✅').catch((O_o) => {
						client.log.error(O_o.message)
					})
				}
				else {
					// in case no items or pokemon are in the command, add a dummy 0 to not break sql
					items.push(0)
					monsters.push(0)
					const remQuery = `
						delete from quest WHERE id=${target.id} and 
						((reward_type = 2 and reward in(${items})) or (reward_type = 7 and reward in(${monsters})) or (reward_type = 3 and reward > ${stardustTracking}))		
						`
					client.query.mysteryQuery(remQuery).then(() => {
						client.log.log({ level: 'debug', message: `${msg.author.username} removed quest trackings for ${target.name}`, event: 'discord:questRemove' })
					}).catch((O_o) => {})

					msg.react('✅').catch((O_o) => {
						client.log.error(O_o.message)
					})
				}

			}
		})
		.catch((err) => {
			client.log.error(`commando !quest errored with: ${err.message} (command was "${msg.content}")`)
		})
}
