const _ = require('lodash')
const config = require('config')
const fs = require('fs')

let gruntTypeDataPath = `${__dirname}/../../../util/grunt_types.json`
const defaultGruntTypes = require(gruntTypeDataPath)
if (config.locale.language.toLowerCase() !== 'en') {
	const gruntTypeDataPathToTest = `${__dirname}/../../../util/locale/grunt_types${config.locale.language.toLowerCase()}.json`
	if (fs.existsSync(gruntTypeDataPathToTest)) {
		gruntTypeDataPath = gruntTypeDataPathToTest
	}
}
const gruntTypes = require(gruntTypeDataPath)

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
				let distance = 0
				let template = 3
				let remove = false
				let gender = 0
				const rawTypes = []
				const types = []

				args.forEach((element) => {
					if (element.match(/^template[1-5]$/i)) template = element.replace(/template/i, '')
					else if (element === 'remove') remove = true
					else if (element.match(/^d\d+$/i)) {
						distance = element.replace(/d/i, '')
						if (distance.length >= 10) distance = distance.substr(0, 9)
					}
					else if (element === 'female') gender = 2
					else if (element === 'male') gender = 1
					else rawTypes.push(element)
				})

				for (const t of rawTypes) {
					if (t === 'mixed') {
						types.push('Mixed')
					}
					else if (t === 'boss') {
						types.push('Boss')
					}
					else {
						let key = _.findKey(gruntTypes, (tt) => tt.type.toLowerCase() === t)
						key = key || _.findKey(defaultGruntTypes, (tt) => tt.type.toLowerCase() === t)
						if (key) {
							types.push(gruntTypes[key].type)
						}
						else {
							return ctx.reply(`400 UNKNOWN ARGUMENT \`${t}\``, { parse_mode: 'Markdown' }).catch((O_o) => {
								controller.log.error(O_o.message)
							})
						}
					}
				}

				if (!remove) {
					const insertData = types.length === 0 ? [[target.id, template, distance, gender, '']] : []
					types.forEach((t) => {
						insertData.push([target.id, template, distance, gender, t])
					})
					controller.query.insertOrUpdateQuery(
						'incident',
						['id', 'template', 'distance', 'gender', 'gruntType'],
						insertData,
					).catch((O_o) => {})
					controller.log.log({
						level: 'debug',
						message: `${user.first_name} started tracking invasions in ${target.name}`,
						event: 'telegram:invasion',
					})

					ctx.reply('✅').catch((O_o) => {
						controller.log.error(O_o.message)
					})
				}
				else {
					controller.query.deleteQuery('incident', 'id', target.id).catch((O_o) => {})
					controller.log.log({ level: 'debug', message: `${user.first_name} stopped tracking invasions in ${target.name}`, event: 'telegram:uninvasion' })

					ctx.reply('✅').catch((O_o) => {
						controller.log.error(O_o.message)
					})
				}
			}
		})
		.catch((err) => {
			controller.log.error(`Telegram commando /invasion errored with: ${err.message} (command was "${command.text}")`)
		})
}
