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
const questDts = require(`${__dirname}/../../../../config/questdts`)

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

module.exports = (ctx) => {

	const { controller, command } = ctx.state
    if (ctx.update.channel_post) {
        
        ctx.update.message = ctx.update.channel_post;
    }
	const user = (ctx.update.message.from === undefined) ? ctx.update.message.chat : ctx.update.message.from
	const channelName = ctx.update.message.chat.title ? ctx.update.message.chat.title : ''
	const args = command.splitArgs

	let target = { id: user.id.toString(), name: user.first_name }
	if (!_.includes(controller.config.telegram.admins, user.id.toString()) && ctx.update.message.chat.type !== 'private') {
		return ctx.telegram.sendMessage(user.id, 'Please run commands in Direct Messages').catch((O_o) => {
			controller.log.error(O_o.message)
		})
	}
	if (_.includes(controller.config.telegram.admins, user.id.toString()) && ctx.update.message.chat.type !== 'private') target = { id: ctx.update.message.chat.id.toString(), name: ctx.update.message.chat.title }
	controller.query.countQuery('id', 'humans', 'id', target.id)
		.then((isregistered) => {
			if (!isregistered && _.includes(controller.config.telegram.admins, user.id.toString()) && ctx.update.message.chat.type !== 'private') {
				return ctx.reply(`${channelName} does not seem to be registered. add it with /channel add`).catch((O_o) => {
					controller.log.error(O_o.message)
				})
			}
			if (!isregistered && ctx.update.message.chat.type === 'private') {
				return ctx.telegram.sendMessage(user.id, `You don't seem to be registered. \nYou can do this by sending /poracle to @${controller.config.telegram.channel}`).catch((O_o) => {
					controller.log.error(O_o.message)
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
				const rawArgs = command.args
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
				if (rawArgs.match(/(^| )all pokemon/i)) monsters = [...Array(controller.config.general.max_pokemon).keys()].map((x) => x += 1) // eslint-disable-line no-return-assign
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
					const insertData = questTracks.map((t) => [t.id, t.reward, t.template, t.reward_type, t.distance, t.mustShiny])
					controller.query.insertOrUpdateQuery(
						'quest',
						['id', 'reward', 'template', 'reward_type', 'distance', 'shiny'],
						insertData,
					).catch((O_o) => {})
					controller.log.log({ level: 'debug', message: `${user.first_name} added quest trackings to ${target.name}`, event: 'discord:quest' })
					ctx.reply('✅').catch((O_o) => {
						controller.log.error(O_o.message)
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
					controller.query.mysteryQuery(remQuery).then(() => {
						controller.log.log({ level: 'debug', message: `${user.first_name} removed quest trackings for ${target.name}`, event: 'discord:questRemove' })
					}).catch((O_o) => {})

					ctx.reply('✅').catch((O_o) => {
						controller.log.error(O_o.message)
					})
				}

			}
		})
		.catch((err) => {
			controller.log.error(`Telegram commando /quest errored with: ${err.message} (command was "${command.text}")`)
		})
}
