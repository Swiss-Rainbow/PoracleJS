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
				let distance = 0
				let cp = 0
				let maxcp = 9000
				let iv = -1
				let maxiv = 100
				let level = 0
				let maxlevel = 40
				let atk = 0
				let def = 0
				let sta = 0
				let maxAtk = 15
				let maxDef = 15
				let maxSta = 15
				let gender = 0
				let weight = 0
				let maxweight = 9000000
				let template = 3
				let gen = 0
				let time = 0
				const forms = []

				for (const element of args) {
					let pid = (element.match(/^\d+$/) && _.has(monsterData, element))
						? element
						: _.findKey(monsterData, (mon) => mon.name.toLowerCase() === element)
					pid = pid || _.findKey(defaultMonsterData, (mon) => mon.name.toLowerCase() === element)
					if (pid) monsters.push(pid)
					else if (element.match(/^maxlevel\d+$/i)) maxlevel = element.replace(/maxlevel/i, '')
					else if (element.match(/^template[1-5]$/i)) template = element.replace(/template/i, '')
					else if (element.match(/^maxcp\d+$/i)) maxcp = element.replace(/maxcp/i, '')
					else if (element.match(/^maxiv\d+$/i)) maxiv = element.replace(/maxiv/i, '')
					else if (element.match(/^maxweight\d+$/i)) maxweight = element.replace(/maxweight/i, '')
					else if (element.match(/^maxatk\d+$/i)) maxAtk = element.replace(/maxatk/i, '')
					else if (element.match(/^maxdef\d+$/i)) maxDef = element.replace(/maxdef/i, '')
					else if (element.match(/^maxsta\d+$/i)) maxSta = element.replace(/maxsta/i, '')
					else if (element.match(/^cp\d+$/i)) cp = element.replace(/cp/i, '')
					else if (element.match(/^level\d+$/i)) level = element.replace(/level/i, '')
					else if (element.match(/^iv\d+$/i)) iv = element.replace(/iv/i, '')
					else if (element.match(/^atk\d+$/i)) atk = element.replace(/atk/i, '')
					else if (element.match(/^def\d+$/i)) def = element.replace(/def/i, '')
					else if (element.match(/^sta\d+$/i)) sta = element.replace(/sta/i, '')
					else if (element === 'female') gender = 2
					else if (element === 'male') gender = 1
					else if (element === 'genderless') gender = 3
					else if (element.match(/^weight\d+$/i)) weight = element.replace(/weight/i, '')
					else if (element.match(/^form\w+$/i)) forms.push(element.replace(/form/i, ''))
					else if (element === 'everything') monsters = [...Array(config.general.max_pokemon).keys()].map((x) => x += 1) // eslint-disable-line no-return-assign
					else if (element.match(/^d\d+$/i)) {
						distance = element.replace(/d/i, '')
						if (distance.length >= 10) distance = distance.substr(0, 9)
					}
					else if (element.match(/^gen[1-7]$/i)) {
						gen = element.replace(/gen/i, '')
						monsters = [...Array(config.general.max_pokemon).keys()].map((x) => x += 1).filter((k) => k >= genData[gen].min && k <= genData[gen].max) // eslint-disable-line no-return-assign
					}
					else if (element.match(/^t\d+$/i)) time = Math.min(element.replace(/t/i, ''), 59)
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
						else {
							if (!monsters.length) {
								return ctx.reply('400 NO MONSTER FOUND').catch((O_o) => {
									controller.log.error(O_o.message)
								})
							}

							return ctx.reply(`400 UNKNOWN ARGUMENT \`${element}\``, { parse_mode: 'Markdown' }).catch((O_o) => {
								controller.log.error(O_o.message)
							})
						}
					}
				}
				if (monsters.length && !forms.length) {
					const form = 0
					const insertData = monsters.map((pokemonId) => [target.id, pokemonId, template, distance, iv, maxiv, cp, maxcp, level, maxlevel, atk, def, sta, weight, maxweight, form, maxAtk, maxDef, maxSta, gender, time])
					controller.query.insertOrUpdateQuery(
						'monsters',
						['id', 'pokemon_id', 'template', 'distance', 'min_iv', 'max_iv', 'min_cp', 'max_cp', 'min_level', 'max_level', 'atk', 'def', 'sta', 'min_weight', 'max_weight', 'form', 'maxAtk', 'maxDef', 'maxSta', 'gender', 'time'],
						insertData,
					).catch((O_o) => {})

					ctx.reply('✅').catch((O_o) => {
						controller.log.error(O_o.message)
					})
					controller.log.log({ level: 'debug', message: `${user.first_name} started tracking ${monsters} in ${target.name}`, event: 'discord:track' })

				}
				else if (monsters.length > 1 && forms.length) {
					return ctx.reply('Form filters can be added to 1 monster at a time').catch((O_o) => {
						controller.log.error(O_o.message)
					})
				}
				else if (!monsters.length) {
					return ctx.reply('404 NO MONSTERS FOUND').catch((O_o) => {
						controller.log.error(O_o.message)
					})
				}
				else if (monsters.length === 1 && forms.length) {
					if (!_.has(formData, monsters[0])) {
						return ctx.reply(`Sorry, ${monsters[0]} doesn't have forms`).catch((O_o) => {
							controller.log.error(O_o.message)
						})
					}

					const fids = []
					forms.forEach((form) => {
						const fid = _.findKey(formData[monsters[0]], (monforms) => monforms.toLowerCase() === form)
						if (fid) fids.push(fid)
					})
					const insertData = fids.map((form) => [target.id, monsters[0], template, distance, iv, maxiv, cp, maxcp, level, maxlevel, atk, def, sta, weight, maxweight, form, maxAtk, maxDef, maxSta, gender, time])
					controller.log.log({ level: 'debug', message: `${user.first_name} started tracking ${monsters[0]} form: ${fids} in ${target.name}`, event: 'discord:track' })
					controller.query.insertOrUpdateQuery(
						'monsters',
						['id', 'pokemon_id', 'template', 'distance', 'min_iv', 'max_iv', 'min_cp', 'max_cp', 'min_level', 'max_level', 'atk', 'def', 'sta', 'min_weight', 'max_weight', 'form', 'maxAtk', 'maxDef', 'maxSta', 'gender', 'time'],
						insertData,
					).catch((O_o) => {})
					if (fids.length > 0) {
						ctx.reply('✅').catch((O_o) => {
							controller.log.error(O_o.message)
						})
					}
					else {
						ctx.reply(`Sorry, I didn't find those forms for ${monsterData[monsters[0]].name}`).catch((O_o) => {
							controller.log.error(O_o.message)
						})
					}
				}
			}
		})
		.catch((err) => {
			controller.log.error(`Telegram commando /track errored with: ${err.message} (command was "${command.text}")`)
		})
}
