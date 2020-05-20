const { mount } = require('telegraf')

const regex = /^\/([^@\s]+)@?(?:(\S+)|)\s?([\s\S]*)$/i

/* eslint no-param-reassign: ["error", { "props": false }] */
module.exports = () => mount('text', (ctx, next) => {
	if (ctx.update.channel_post) {
		ctx.update.message = ctx.update.channel_post
	}
	if (!ctx.update.message) {
		return next()
	}

	ctx.update.message.text = ctx.update.message.text.toLowerCase()
	const parts = regex.exec(ctx.update.message.text)
	if (parts) {
		ctx.state.command = {
			text: ctx.update.message.text,
			command: parts[1],
			bot: parts[2],
			args: parts[3],
			get splitArgs() {
				const args = parts[3].split(/\s+/)
				return args.map((arg) => arg.toLowerCase().replace(/,*$/, ''))
			},
		}
	}

	return next()
})
