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

const genData = require(`${__dirname}/../../../util/gens`)
const pvpData = require(`${__dirname}/../../../util/pvp_ranks`)

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
				let league = 1500
				let maxrank = 10
				let distance = 0
				let gender = 0
				let weight = 0
				let maxweight = 9000000
				let template = 3
				let gen = 0
				let time = 0
				const forms = []
				let family = false

				for (let element of args) {
					family = element.startsWith('+')
					element = element.replace(/^\+/, '')

					let pid = (element.match(/^\d+$/) && _.has(monsterData, element))
						? element
						: _.findKey(monsterData, (mon) => mon.name.toLowerCase() === element)
					pid = pid || _.findKey(defaultMonsterData, (mon) => mon.name.toLowerCase() === element)
					if (pid) {
						monsters.push(parseInt(pid, 10))
						if (family) monsters = monsters.concat(pvpData[pid].family)
					}
					else if (element.match(/^league(1500|2500)$/i)) league = element.replace(/league/i, '')
					else if (element.match(/^maxrank\d+$/i)) maxrank = Math.min(element.replace(/maxrank/i, ''), 10)
					else if (element.match(/^template[1-5]$/i)) template = element.replace(/template/i, '')
					else if (element.match(/^maxweight\d+$/i)) maxweight = element.replace(/maxweight/i, '')
					else if (element.match(/^female$/i)) gender = 2
					else if (element.match(/^male$/i)) gender = 1
					else if (element.match(/^genderless$/i)) gender = 3
					else if (element.match(/^weight\d+$/i)) weight = element.replace(/weight/i, '')
					else if (element.match(/^form\w+$/i)) forms.push(element.replace(/form/i, ''))
					else if (element.match(/^everything$/i)) monsters = [...Array(config.general.max_pokemon).keys()].map((x) => x += 1) // eslint-disable-line no-return-assign
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
							return ctx.reply(`400 UNKNOWN ARGUMENT \`${element}\``, { parse_mode: 'Markdown' }).catch((O_o) => {
								controller.log.error(O_o.message)
							})
						}
					}
				}

				monsters = [...new Set(monsters)]

				if (monsters.length && !forms.length) {
					const insertData = []
					monsters.forEach((pokemonId) => {
						const pokemonIndex = pvpData[pokemonId].family.indexOf(pokemonId)
						for (let i = 1; i <= maxrank; i += 1) {
							pvpData[pokemonId].family.forEach((memberId, memberIndex) => {
								if (memberIndex <= pokemonIndex) {
									for (const formId in pvpData[pokemonId][league]) {
										if (pvpData[pokemonId][league][formId]) {
											const rankData = pvpData[pokemonId][league][formId][i]
											const level = Math.ceil(rankData.level)
											insertData.push(
												[
													target.id,
													memberId,
													template,
													distance,
													-1,
													100,
													0,
													league,
													0,
													level,
													rankData.attack,
													rankData.defense,
													rankData.stamina,
													weight,
													maxweight,
													formId === '-1' ? 0 : formId,
													rankData.attack,
													rankData.defense,
													rankData.stamina,
													gender,
													time,
													i,
													pokemonId,
												],
											)
										}
									}
								}
							})
						}
					})
					controller.query.insertOrUpdateQuery(
						'monsters',
						['id', 'pokemon_id', 'template', 'distance', 'min_iv', 'max_iv', 'min_cp', 'max_cp', 'min_level', 'max_level', 'atk', 'def', 'sta', 'min_weight', 'max_weight', 'form', 'maxAtk', 'maxDef', 'maxSta', 'gender', 'time', 'pvp_rank', 'pvp_id'],
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

					// const fids = []
					// forms.forEach((form) => {
					// 	const fid = _.findKey(formData[monsters[0]], (monforms) => monforms.toLowerCase() === form)
					// 	if (fid) fids.push(fid)
					// })
					// const insertData = fids.map((form) => [target.id, monsters[0], template, distance, iv, maxiv, cp, maxcp, level, maxlevel, atk, def, sta, weight, maxweight, form, maxAtk, maxDef, maxSta, gender, time])
					// controller.log.log({ level: 'debug', message: `${user.first_name} started tracking ${monsters[0]} form: ${fids} in ${target.name}`, event: 'discord:track' })
					// controller.query.insertOrUpdateQuery(
					// 	'monsters',
					// 	['id', 'pokemon_id', 'template', 'distance', 'min_iv', 'max_iv', 'min_cp', 'max_cp', 'min_level', 'max_level', 'atk', 'def', 'sta', 'min_weight', 'max_weight', 'form', 'maxAtk', 'maxDef', 'maxSta', 'gender', 'time'],
					// 	insertData,
					// ).catch((O_o) => {})
					// if (fids.length > 0) {
					// 	ctx.reply('✅').catch((O_o) => {
					// 		controller.log.error(O_o.message)
					// 	})
					// }
					// else {
					// 	ctx.reply(`Sorry, I didn't find those forms for ${monsterData[monsters[0]].name}`).catch((O_o) => {
					// 		controller.log.error(O_o.message)
					// 	})
					// }
				}
			}
		})
		.catch((err) => {
			controller.log.error(`Telegram commando /pvp errored with: ${err.message} (command was "${command.text}")`)
		})
}
