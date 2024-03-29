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

let gruntTypeDataPath = `${__dirname}/../../../util/grunt_types.json`
const defaultGruntTypes = require(gruntTypeDataPath)
if (config.locale.language.toLowerCase() !== 'en') {
	const gruntTypeDataPathToTest = `${__dirname}/../../../util/locale/grunt_types${config.locale.language.toLowerCase()}.json`
	if (fs.existsSync(gruntTypeDataPathToTest)) {
		gruntTypeDataPath = gruntTypeDataPathToTest
	}
}
const gruntTypes = require(gruntTypeDataPath)

const formData = require(`${__dirname}/../../../util/forms`)
const genData = require(`${__dirname}/../../../util/gens`)

module.exports = (ctx) => {

	const { controller, command } = ctx.state
    const user = ctx.update.message.from || ctx.update.message.chat
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
				let park = 0
				let distance = 0
				let team = 4
				let template = 3
				let remove = false
				let levels = []
				let gen = 0
				const form = 0
				const forms = []

				args.forEach((element) => {
					let pid = (element.match(/^\d+$/) && _.has(monsterData, element))
						? element
						: _.findKey(monsterData, (mon) => mon.name.toLowerCase() === element)
					pid = pid || _.findKey(defaultMonsterData, (mon) => mon.name.toLowerCase() === element)
					if (pid) monsters.push(pid)
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
				})
				args.forEach((element) => {
					if (element.toLowerCase() === 'ex') park = 1
					else if (element.match(/^level\d+$/i)) levels.push(element.replace(/level/i, ''))
					else if (element.match(/^template[1-5]$/i)) template = element.replace(/template/i, '')
					else if (element === 'instinct') team = 3
					else if (element === 'valor') team = 2
					else if (element === 'mystic') team = 1
					else if (element === 'harmony') team = 0
					else if (element === 'remove') remove = true
					else if (element.match(/^form[\w-]+$/i)) forms.push(element.replace(/form/i, ''))
					else if (element === 'everything') levels = [1, 2, 3, 4, 5, 6]
					else if (element.match(/^d\d+$/i)) {
						distance = element.replace(/d/i, '')
						if (distance.length >= 10) distance = distance.substr(0, 9)
					}
					else if (element.match(/^gen[1-7]$/i)) {
						gen = element.replace(/gen/i, '')
						monsters = [...Array(config.general.max_pokemon).keys()].map((x) => x += 1).filter((k) => k >= genData[gen].min && k <= genData[gen].max) // eslint-disable-line no-return-assign
					}
				})
				if (!remove) {
					if (monsters.length !== 0 && levels.length === 0 && forms.length === 0) {
						const level = 0
						const insertData = monsters.map((monster) => [target.id, monster, template, distance, park, team, level, form])
						controller.query.insertOrUpdateQuery(
							'raid',
							['id', 'pokemon_id', 'template', 'distance', 'park', 'team', 'level', 'form'],
							insertData,
						).catch((O_o) => {})
						controller.log.log({
							level: 'debug',
							message: `${user.first_name} started tracking ${monsters} raids in ${target.name}`,
							event: 'telegram:raid',
						})

						ctx.reply('✅').catch((O_o) => {
							controller.log.error(O_o.message)
						})

					}
					else if (monsters.length === 1 && levels.length === 0 && forms.length !== 0) {
						const level = 0
						if (!_.has(formData, monsters[0])) {
							return ctx.reply(`Sorry, ${monsters[0]} doesn't have forms`).catch((O_o) => {
								controller.log.error(O_o.message)
							})
						}
						const fids = []
						forms.forEach((f) => {
							const fid = _.findKey(formData[monsters[0]], (monforms) => monforms.toLowerCase() === f)
							if (fid) fids.push(fid)
						})
						if (!fids.length) {
							return ctx.reply(`Didn't find these forms for ${monsters[0]}`).catch((O_o) => {
								controller.log.error(O_o.message)
							})
						}
						const insertData = fids.map((f) => [target.id, monsters[0], template, distance, park, team, level, f])
						controller.query.insertOrUpdateQuery(
							'raid',
							['id', 'pokemon_id', 'template', 'distance', 'park', 'team', 'level', 'form'],
							insertData,
						).catch((O_o) => {})
						controller.log.log({
							level: 'debug',
							message: `${user.first_name} started tracking ${monsters} raids in ${target.name}`,
							event: 'telegram:raid',
						})

						ctx.reply('✅').catch((O_o) => {
							controller.log.error(O_o.message)
						})

					}
					else if (monsters.length === 0 && levels.length === 0) ctx.reply('404 NO MONSTERS FOUND')
					else if (monsters.length !== 0 && levels.length !== 0) ctx.reply('400 Can\'t track raids by name and level at the same time')
					else if (monsters.length === 0 && levels.length !== 0) {
						const insertData = levels.map((level) => [target.id, 721, template, distance, park, team, level, form])
						controller.query.insertOrUpdateQuery(
							'raid',
							['id', 'pokemon_id', 'template', 'distance', 'park', 'team', 'level', 'form'],
							insertData,
						).catch((O_o) => {})
						controller.log.log({
							level: 'debug',
							message: `${user.first_name} started tracking level ${levels} raids in ${target.name}`,
							event: 'telegram:raid',
						})
						ctx.reply('✅').catch((O_o) => {
							controller.log.error(O_o.message)
						})
					}
				}
				else {
					if (monsters.length) {
						monsters.forEach((monster) => {
							controller.query.deleteByIdQuery('raid', 'pokemon_id', `${monster}`, target.id).catch((O_o) => {})
						})
						controller.log.log({ level: 'debug', message: `${user.first_name} stopped tracking ${monsters} raids in ${target.name}`, event: 'telegram:unraid' })
						ctx.reply('✅').catch((O_o) => {
							controller.log.error(O_o.message)
						})
					}
					if (levels.length) {
						levels.forEach((level) => {
							controller.query.deleteByIdQuery('raid', 'level', `${level}`, target.id).catch((O_o) => {})
						})
						controller.log.log({ level: 'debug', message: `${user.first_name} stopped tracking level ${levels} raids in ${target.name}`, event: 'telegram:unraid' })

						ctx.reply('✅').catch((O_o) => {
							controller.log.error(O_o.message)
						})
					}
					if (!monsters.length && !levels.length) {
						ctx.reply('404 No raid bosses or levels found').catch((O_o) => {
							controller.log.error(O_o.message)
						})
					}
				}
			}
		})
		.catch((err) => {
			controller.log.error(`Telegram commando /raid errored with: ${err.message} (command was "${command.text}")`)
		})
}
