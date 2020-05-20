const _ = require('lodash')
const geofence = require('../../../../config/geofence.json')

const confAreas = geofence.map((area) => area.name.toLowerCase()).sort()
const confAreasNormal = geofence.map((area) => area.name).sort()

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
				switch (args[0]) {
					case 'add': {
						controller.query.selectOneQuery('humans', 'id', target.id).then((human) => {
							const oldArea = JSON.parse(human.area.split())
							const validAreas = confAreas.filter((x) => args.includes(x))
							const addAreas = validAreas.filter((x) => !oldArea.includes(x))
							const newAreas = oldArea.concat(addAreas)
							if (addAreas.length) controller.query.updateQuery('humans', 'area', JSON.stringify(newAreas), 'id', target.id)
							if (!validAreas.length) {
								return ctx.reply(`No valid areas there, please use one of ${confAreasNormal.join(', ')}`).catch((O_o) => {
									controller.log.error(O_o.message)
								})
							}
							if (addAreas.length) {
								ctx.reply(`Added areas: ${addAreas.join(', ')}`).catch((O_o) => {
									controller.log.error(O_o.message)
								})
								controller.log.log({ level: 'debug', message: `${user.first_name} added area ${addAreas} for ${target.name}`, event: 'telegram:areaAdd' })
							}
							else {
								ctx.reply('👌').catch((O_o) => {
									controller.log.error(O_o.message)
								})
							}
						})
							.catch((err) => {
								controller.log.error(`selectOneQuery on !area add unhappy; ${err.message}`)
							})
						break
					}
					case 'remove': {
						controller.query.selectOneQuery('humans', 'id', target.id).then((human) => {
							const oldArea = JSON.parse(human.area.split())
							const validAreas = oldArea.filter((x) => args.includes(x))
							const removeAreas = validAreas.filter((x) => oldArea.includes(x))
							const newAreas = oldArea.filter((x) => !removeAreas.includes(x))
							if (removeAreas.length) {
								controller.query.updateQuery('humans', 'area', JSON.stringify(newAreas), 'id', target.id).catch((O_o) => {})
							}
							if (!validAreas.length) {
								return ctx.reply(`404 NO VALID AND TRACKED AREAS FOUND \nVALID: ${confAreasNormal.join(', ')} \nTRACKED: ${oldArea}`).catch((O_o) => {
									controller.log.error(O_o.message)
								})
							}
							if (removeAreas.length) {
								ctx.reply(`Removed areas: ${removeAreas.join(', ')}`)
								controller.log.log({ level: 'debug', message: `${user.first_name} removed area ${removeAreas} for ${target.name}`, event: 'telegram:areaRemove' })
							}
							else {
								ctx.reply('👌').catch((O_o) => {
									controller.log.error(O_o.message)
								})
							}
						})
							.catch((err) => {
								controller.log.error(`selectOneQuery on !area remove unhappy; ${err.message}`)
							})
						break
					}
					case 'list': {
						controller.query.selectOneQuery('humans', 'id', target.id).then((human) => {
							let message = ''
							message = message.concat(`You currently are set to receive alarms in:\n${human.area}`)
							message = message.concat(`\n\nCurrent configured areas are:\n${confAreasNormal.join(', ')}`)
							ctx.reply(message).catch((O_o) => {
								controller.log.error(O_o.message)
							})
							controller.log.log({
								level: 'debug',
								message: `${user.first_name} checked areas for ${target.name}`,
								event: 'telegram:areaList'
							})
						})
							.catch((err) => {
								controller.log.error(`selectOneQuery on !area list unhappy; ${err.message}`)
							})
						break
					}
					default:
						return ctx.reply('404 COMMAND INCOMPLETE - USE `add`, `list` or `remove`', { parse_mode: 'Markdown' }).catch((O_o) => {
							controller.log.error(O_o.message)
						})
				}
			}
		})
		.catch((err) => {
			controller.log.error(`Telegram commando /area errored with: ${err.message} (command was "${ctx.state.command.text}")`)
		})
}
