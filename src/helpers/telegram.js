const cluster = require('cluster')
const Telegraf = require('telegraf')
const fs = require('fs')
const config = require('config')
const _ = require('lodash')
const telegramController = require('./telegram/middleware/controller')
const commandParts = require('./telegram/middleware/commandParser')

const log = require('../logger')

function startBeingHungry() {
	log.log({ level: 'debug', message: `telegram worker #${cluster.worker.id} started being hungry`, event: 'telegram:workRequest' })
	const hungryInterval = setInterval(() => {
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
	if (err) return log.error(err)
	clients.forEach((client) => {
		client
			.use(commandParts())
			.use(telegramController())
	})
	files.forEach((file) => {

		if (!file.endsWith('.js')) return
		const props = require(`${__dirname}/telegram/commands/${file}`) // eslint-disable-line global-require
		let commandName = file.split('.')[0]
		if (config.commands[commandName]) commandName = config.commands[commandName]
		enabledCommands.push(commandName)
		commandWorker.command(commandName, props)
	})
	log.log({ level: 'debug', message: `Loading Telegram commands: (${enabledCommands.join(' ')})`, event: 'telegram:commandsAdded' })

	clients.forEach((client) => {
		client.launch()
	})

})

let hungryInterval = startBeingHungry()
process.on('message', (msg) => {
	const client = _.sample(clients)
	if (msg.reason === 'food') {
		clearInterval(hungryInterval)
		let message = ''
		const telegramMessage = msg.job.message
		if (telegramMessage.content) message = message.concat(`${telegramMessage.content}\n`)
		if (telegramMessage.embed) {
			if (telegramMessage.embed.author) {
				if (telegramMessage.embed.author.name) message = message.concat(`\n${telegramMessage.embed.author.name}\n`)
			}
			if (telegramMessage.embed.title) message = message.concat(`${telegramMessage.embed.title}\n`)
			if (telegramMessage.embed.description) message = message.concat(`${telegramMessage.embed.description}\n`)
			if (telegramMessage.embed.fields) {
				telegramMessage.embed.fields.forEach((field) => {
					message = message.concat(`\n${field.name}\n\n${field.value}\n`)
					return message
				})
			}
		}
        // Send normal sticker id
		if ((config.telegram.images && msg.job.sticker) || (msg.type === 'monster' && config.telegram.monster_images) || (msg.type === 'raid' && config.telegram.raid_images) || (msg.type === 'quest' && config.telegram.quest_images)) {
            client.telegram.sendSticker(msg.job.target, msg.job.sticker, { disable_notification: true }).then(() => {
			    sendMessage(client, msg, message);
            // Normaize Sticker and try to send again!
	    	}).catch((err) => {
		    	log.error(`Failed sending Telegram sticker to ${msg.job.name}. Sticker:${msg.job.sticker}. Error: ${err.message}`)

                if (config.telegram.images || (msg.type === 'monster' && config.telegram.monster_images) || (msg.type === 'raid' && config.telegram.raid_images) || (msg.type === 'quest' && config.telegram.quest_images) || (msg.type === 'invasion' && config.telegram.invasion_location)) {
                    let sticker = msg.job.sticker;
                    let posUnderline = sticker.lastIndexOf("_");
                    let subcode = sticker.substr(posUnderline);
                    sticker = sticker.replace(subcode, "_00.webp");
                    client.telegram.sendSticker(msg.job.target, sticker, { disable_notification: true }).then(() => {
		        	    sendMessage(client, msg, message);
                    // Send without sticker, if also normalized sticker is missing
	    	        }).catch((err) => {
		    	        log.error(`Failed sending Telegram sticker to ${msg.job.name}. Sticker:${msg.job.sticker}. Error: ${err.message}`)

                        sendMessage(client, msg, message);
                    })
                }
    		})
        }
        // Send without any sticker
        else {
        	sendMessage(client, msg, message);
        }
	}
})

function sendMessage(client, msg, message) {
	client.telegram.sendMessage(msg.job.target, message, {
		parse_mode: 'Markdown',
		disable_web_page_preview: true
	}).then(() => {
		hungryInterval = startBeingHungry();
		if (config.telegram.location || (msg.type === 'monster' && config.telegram.monster_location) || (msg.type === 'raid' && config.telegram.raid_location) || (msg.type === 'quest' && config.telegram.quest_location) || (msg.type === 'invasion' && config.telegram.invasion_location)) {
			client.telegram.sendLocation(msg.job.target, msg.job.lat, msg.job.lon, {disable_notification: true}).catch((err) => {
				log.error(`Failed sending Telegram Location to ${msg.job.name}. Error: ${err.message}`)
			})
		}
	}).catch((err) => {
		log.error(`Failed sending Telegram message to ${msg.job.name}. Error: ${err.message}`)
	})
    }
    