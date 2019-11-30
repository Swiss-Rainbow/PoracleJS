const cluster = require('cluster')
const Telegraf = require('telegraf')
const fs = require('fs')
const config = require('config')
const _ = require('lodash')
const telegramController = require('./telegram/middleware/controller')
const commandParts = require('./telegram/middleware/commandParser')

const log = require('../logger')

function startBeingHungry() {
	const hungryInterval = setInterval(() => {
		log.log({
			level: 'debug',
			message: `PoracleJSDebug: telegram worker #${cluster.worker.id} sends hungary command`,
		})
		process.send({ reason: 'hungary' })
	}, 100)
	return hungryInterval
}

const enabledCommands = []
const clients = []
config.telegram.token.forEach((key) => {
	clients.push(new Telegraf(key, { channelMode: true }))
})
const commandWorker = clients[0]

fs.readdir(`${__dirname}/telegram/commands/`, (err, files) => {
	if (err) {
		return log.error(err)
	}
	clients.forEach((client) => {
		client
			.use(commandParts())
			.use(telegramController())
	})
	files.forEach((file) => {

		if (!file.endsWith('.js')) {
			return
		}
		const props = require(`${__dirname}/telegram/commands/${file}`) // eslint-disable-line global-require
		let commandName = file.split('.')[0]
		if (config.commands[commandName]) {
			commandName = config.commands[commandName]
		}
		enabledCommands.push(commandName)
		commandWorker.command(commandName, props)
	})
	log.log({
		level: 'debug',
		message: `Loading Telegram commands: (${enabledCommands.join(' ')})`,
		event: 'telegram:commandsAdded',
	})

	clients.forEach((client) => {
		client.launch()
	})

})

const targets = {}
let hungryInterval = startBeingHungry()

process.on('message', (msg) => {
	const client = _.sample(clients)
	if (msg.reason === 'food') {
		let message = ''
		const telegramMessage = msg.job.message
		if (telegramMessage.content) {
			message = message.concat(`${telegramMessage.content}\n`)
		}
		if (telegramMessage.embed) {
			if (telegramMessage.embed.author) {
				if (telegramMessage.embed.author.name) {
					message = message.concat(`\n${telegramMessage.embed.author.name}\n`)
				}
			}
			if (telegramMessage.embed.title) {
				message = message.concat(`${telegramMessage.embed.title}\n`)
			}
			if (telegramMessage.embed.description) {
				message = message.concat(`${telegramMessage.embed.description}\n`)
			}
			if (telegramMessage.embed.fields) {
				telegramMessage.embed.fields.forEach((field) => {
					message = message.concat(`\n${field.name}\n\n${field.value}\n`)
					return message
				})
			}
		}

		targets[msg.job.target] = targets[msg.job.target] || []
		targets[msg.job.target].push((length) => {
			log.log({
				level: 'debug',
				message: `PoracleJSDebug: target: ${msg.job.target} (${msg.job.name}) / Length: ${targets[msg.job.target].length}`,
			})
			if (hungryInterval !== null && Object.getOwnPropertyNames(targets).length > 10) {
				clearInterval(hungryInterval)
				hungryInterval = null
				log.log({
					level: 'debug',
					message: `PoracleJSDebug: telegram worker #${cluster.worker.id} stopped being hungry`,
				})
			}
			if (length > 1) {
				return false
			}
			(async () => {
				if (msg.job.sticker && (config.telegram.images || (msg.type === 'monster' && config.telegram.monster_images) || (msg.type === 'raid' && config.telegram.raid_images) || (msg.type === 'quest' && config.telegram.quest_images) || (msg.type === 'invasion' && config.telegram.invasion_location))) {
					try {
						await client.telegram.sendSticker(msg.job.target, msg.job.sticker, { disable_notification: true })
						log.log({
							level: 'debug',
							message: `PoracleJSDebug: Sticker ${msg.job.sticker} sent to ${msg.job.name}`,
						})
					}
					catch (err) {
						log.error(`Failed sending Telegram sticker to ${msg.job.name}. Sticker: ${msg.job.sticker}. Error: ${err.message}`)

						// Normalize sticker and try to send again!
						let { sticker } = msg.job
						const posUnderline = sticker.lastIndexOf('_')
						const subcode = sticker.substr(posUnderline)
						sticker = sticker.replace(subcode, '_00.webp')
						await client.telegram.sendSticker(msg.job.target, sticker, { disable_notification: true }).catch((err) => {
							log.error(`Failed sending Telegram sticker to ${msg.job.name}. Sticker: ${sticker}. Error: ${err.message}`)
						})
						log.log({
							level: 'debug',
							message: `PoracleJSDebug: Normalized sticker ${sticker} sent to ${msg.job.name}`,
						})
					}
				}

				client.telegram.sendMessage(msg.job.target, message, {
					parse_mode: 'Markdown',
					disable_web_page_preview: true,
				}).then(() => {
					log.log({
						level: 'debug',
						message: `PoracleJSDebug: Message ${message} sent to ${msg.job.name}`,
					})
					if (config.telegram.location || (msg.type === 'monster' && config.telegram.monster_location) || (msg.type === 'raid' && config.telegram.raid_location) || (msg.type === 'quest' && config.telegram.quest_location) || (msg.type === 'invasion' && config.telegram.invasion_location)) {
						client.telegram.sendLocation(msg.job.target, msg.job.lat, msg.job.lon, { disable_notification: true }).catch((err) => {
							log.error(`Failed sending Telegram Location to ${msg.job.name}. Error: ${err.message}`)
						})
					}
				}).catch((err) => {
					log.error(`Failed sending Telegram message to ${msg.job.name}. Error: ${err.message}`)
				}).then(() => {
					targets[msg.job.target].shift()
					if (targets[msg.job.target].length > 0) {
						targets[msg.job.target][0](1)
					}
					else {
						delete targets[msg.job.target]
						if (hungryInterval === null && Object.getOwnPropertyNames(targets).length < 10) {
							hungryInterval = startBeingHungry()
							log.log({
								level: 'debug',
								message: `PoracleJSDebug: telegram worker #${cluster.worker.id} restarted being hungry`,
							})
						}
					}
				})
			})()
		})
		targets[msg.job.target][0](targets[msg.job.target].length)
	}
})
